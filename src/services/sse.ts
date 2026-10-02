// Server-Sent Events (SSE) Manager for OpenCode global events (/global/event)
// Features Multi-Tab Single Leader Hub (navigator.locks + BroadcastChannel)
// to prevent Chromium 6-connection HTTP/1.1 pool exhaustion.

import { resolveDaemonBaseUrl } from './api'
import type {
  SSEEventMessagePartDelta,
  SSEEventMessagePartUpdated,
  SSEEventMessageUpdated,
  SSEEventSessionStatus,
  SSEEventSessionError,
  SSEEventSessionIdle,
  SSEPayload,
} from '../types/opencode'

export type SSEEventListener<T = any> = (payload: T) => void

const CHANNEL_NAME = 'opencode_sse_hub_v1'
const LEADER_LOCK_NAME = 'opencode_sse_leader_v1'

interface HubBroadcastMessage {
  type: 'sse_event' | 'connection_status' | 'hello'
  fromTabId: string
  eventType?: string
  data?: any
  connected?: boolean
}

class GlobalEventStreamManager {
  private eventSource: EventSource | null = null
  private listeners: Map<string, Set<SSEEventListener>> = new Map()
  private isConnecting: boolean = false
  private retryTimeout: number | null = null
  private retryDelay: number = 2000
  public isConnected: boolean = false
  public isLeader: boolean = false
  public readonly tabId: string = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  private channel: BroadcastChannel | null = null
  private releaseLockResolve: (() => void) | null = null
  private lockGeneration: number = 0
  private electionRetryTimeout: number | null = null
  private closedWatchdogTimeout: number | null = null
  private isDestroyed: boolean = false
  private windowListenersAttached: boolean = false

  constructor() {
    this.initHub()
  }

  private initHub() {
    if (typeof window === 'undefined') return
    this.isDestroyed = false

    // 1. Setup cross-tab BroadcastChannel
    if ('BroadcastChannel' in window) {
      try {
        if (!this.channel) {
          this.channel = new BroadcastChannel(CHANNEL_NAME)
          this.channel.onmessage = (event: MessageEvent<HubBroadcastMessage>) => {
            this.handleChannelMessage(event.data)
          }
          // Follower sends hello on open to sync connection status with leader
          this.channel.postMessage({
            type: 'hello',
            fromTabId: this.tabId,
          })
        }
      } catch (err) {
        console.warn('[SSE Hub] BroadcastChannel init failed:', err)
      }
    }

    // 2. Teardown listeners on page refresh / tab close & bfcache restore
    if (!this.windowListenersAttached) {
      this.windowListenersAttached = true
      const handleUnload = () => {
        this.destroy()
      }
      window.addEventListener('beforeunload', handleUnload)
      window.addEventListener('pagehide', handleUnload)
      window.addEventListener('pageshow', (event) => {
        if (event.persisted || this.isDestroyed) {
          this.initHub()
        }
      })
    }

    // 3. Expose global diagnosis hook for debugging and testing
    ;(window as any).__OPENCODE_DIAG__ = {
      sseManager: this,
      getStatus: () => ({
        tabId: this.tabId,
        isLeader: this.isLeader,
        isConnected: this.isConnected,
        hasEventSource: Boolean(this.eventSource),
      }),
    }

    // 4. Start Leader Election via W3C Web Locks
    this.startLeaderElection()
  }

  private startLeaderElection() {
    if (this.isDestroyed) return
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      const currentGen = ++this.lockGeneration
      console.log(`[SSE Hub] [${this.tabId}] Requesting leader lock "${LEADER_LOCK_NAME}" (gen ${currentGen})...`)
      navigator.locks.request(LEADER_LOCK_NAME, async (_lock) => {
        if (this.isDestroyed || currentGen !== this.lockGeneration) return
        this.isLeader = true
        console.log(`[SSE Hub] [${this.tabId}] ACQUIRED leader lock. Acting as SSE Leader.`)

        await new Promise<void>((resolve) => {
          this.releaseLockResolve = () => {
            if (currentGen === this.lockGeneration) {
              resolve()
            }
          }
          // Registered release function BEFORE connect()
          this.connect()
        })

        this.isLeader = false
        this.releaseLockResolve = null
        console.log(`[SSE Hub] [${this.tabId}] RELEASED leader lock.`)
      }).catch((err) => {
        console.warn(`[SSE Hub] [${this.tabId}] Leader lock error, retrying election in 2s:`, err)
        if (!this.isDestroyed) {
          if (this.electionRetryTimeout) clearTimeout(this.electionRetryTimeout)
          this.electionRetryTimeout = window.setTimeout(() => {
            this.electionRetryTimeout = null
            this.startLeaderElection()
          }, 2000)
        }
      })
    } else {
      // Fallback for environments without Web Locks (e.g. Node tests, older browsers)
      this.isLeader = true
      this.connect()
    }
  }

  private handleChannelMessage(msg: HubBroadcastMessage) {
    if (!msg || typeof msg !== 'object') return
    if (msg.fromTabId === this.tabId) return

    if (msg.type === 'hello') {
      if (this.isLeader) {
        this.broadcastStatus(this.isConnected)
      }
      return
    }

    // Leader ignores inbound sse_event and connection_status from other tabs
    if (this.isLeader) return

    if (msg.type === 'sse_event' && msg.eventType) {
      this.emitLocal(msg.eventType, msg.data)
      if (msg.eventType !== '*') {
        this.emitLocal('*', { type: msg.eventType, properties: msg.data })
      }
    } else if (msg.type === 'connection_status' && typeof msg.connected === 'boolean') {
      if (this.isConnected !== msg.connected) {
        this.isConnected = msg.connected
        this.emitLocal('connection.change', { connected: msg.connected })
      }
    }
  }

  private broadcastStatus(connected: boolean) {
    if (this.channel && this.isLeader) {
      try {
        this.channel.postMessage({
          type: 'connection_status',
          fromTabId: this.tabId,
          connected,
        })
      } catch (err) {
        console.warn('[SSE Hub] Failed to broadcast status:', err)
      }
    }
  }

  private broadcastEvent(eventType: string, data: any) {
    if (this.channel && this.isLeader) {
      try {
        this.channel.postMessage({
          type: 'sse_event',
          fromTabId: this.tabId,
          eventType,
          data,
        })
      } catch (err) {
        console.warn('[SSE Hub] Failed to broadcast event:', err)
      }
    }
  }

  public connect() {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return
    if (this.eventSource || this.isConnecting) return
    this.isConnecting = true

    try {
      const url = `${resolveDaemonBaseUrl()}/global/event`
      console.log(`[SSE Hub] [sse] Connecting EventSource to ${url}...`)
      const es = new EventSource(url)
      this.eventSource = es

      es.onopen = () => {
        console.log(`[SSE Hub] [sse] EventSource connection opened (url: ${url})`)
        if (this.closedWatchdogTimeout) {
          clearTimeout(this.closedWatchdogTimeout)
          this.closedWatchdogTimeout = null
        }
        this.isConnected = true
        this.isConnecting = false
        this.retryDelay = 2000
        this.emit('connection.change', { connected: true })
        this.broadcastStatus(true)
      }

      es.onmessage = (event) => {
        try {
          if (!event.data) return
          const parsed = JSON.parse(event.data)
          const payload: SSEPayload = parsed.payload || parsed
          if (payload && payload.type) {
            this.emit(payload.type, payload.properties)
            this.emit('*', payload)
            this.broadcastEvent(payload.type, payload.properties)
          }
        } catch (err) {
          console.error('[SSE Hub] [sse] Failed to parse event data:', err, event.data)
        }
      }

      es.onerror = (err) => {
        console.warn(`[SSE Hub] [sse] stream error (readyState: ${es.readyState})`, err)
        this.isConnected = false
        this.isConnecting = false
        this.emit('connection.change', { connected: false })
        this.broadcastStatus(false)

        // Only cleanup and schedule manual retry if the EventSource completely closed.
        // Otherwise, native EventSource automatically reconnects with backoff.
        if (es.readyState === EventSource.CLOSED) {
          if (this.isLeader && !this.closedWatchdogTimeout) {
            this.closedWatchdogTimeout = window.setTimeout(() => {
              this.closedWatchdogTimeout = null
              if (this.isLeader && (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED)) {
                console.warn(`[SSE Hub] [${this.tabId}] EventSource remained CLOSED for 8s. Releasing leader lock to re-elect.`)
                this.relinquishLeader()
              }
            }, 8000)
          }

          this.cleanup()
          this.scheduleReconnect()
        }
      }
    } catch (e) {
      console.error('[SSE Hub] [sse] Exception creating EventSource:', e)
      this.isConnecting = false
      this.scheduleReconnect()
    }
  }

  private relinquishLeader() {
    this.cleanup()
    if (this.releaseLockResolve) {
      this.releaseLockResolve()
      this.releaseLockResolve = null
    }
    this.isLeader = false
    this.startLeaderElection()
  }

  private scheduleReconnect() {
    if (typeof window === 'undefined' || this.isDestroyed) return
    if (this.retryTimeout) return
    this.retryTimeout = window.setTimeout(() => {
      this.retryTimeout = null
      this.retryDelay = Math.min(this.retryDelay * 1.5, 10000)
      if (this.isLeader) {
        this.connect()
      }
    }, this.retryDelay)
  }

  public cleanup() {
    if (this.closedWatchdogTimeout) {
      clearTimeout(this.closedWatchdogTimeout)
      this.closedWatchdogTimeout = null
    }
    if (this.eventSource) {
      try {
        this.eventSource.close()
      } catch {}
      this.eventSource = null
    }
    this.isConnecting = false
  }

  public destroy() {
    this.isDestroyed = true
    this.lockGeneration++
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout)
      this.retryTimeout = null
    }
    if (this.electionRetryTimeout) {
      clearTimeout(this.electionRetryTimeout)
      this.electionRetryTimeout = null
    }
    if (this.closedWatchdogTimeout) {
      clearTimeout(this.closedWatchdogTimeout)
      this.closedWatchdogTimeout = null
    }
    this.cleanup()
    if (this.releaseLockResolve) {
      this.releaseLockResolve()
      this.releaseLockResolve = null
    }
    this.isLeader = false
    if (this.channel) {
      try {
        this.channel.close()
      } catch {}
      this.channel = null
    }
  }

  public on<T = any>(eventType: string, listener: SSEEventListener<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(listener)

    return () => {
      this.off(eventType, listener)
    }
  }

  public off(eventType: string, listener: SSEEventListener) {
    const set = this.listeners.get(eventType)
    if (set) {
      set.delete(listener)
      if (set.size === 0) {
        this.listeners.delete(eventType)
      }
    }
  }

  private emitLocal(eventType: string, data: any) {
    const set = this.listeners.get(eventType)
    if (set) {
      set.forEach((listener) => {
        try {
          listener(data)
        } catch (err) {
          console.error(`[SSE Hub] Error in local listener for "${eventType}":`, err)
        }
      })
    }
  }

  private emit(eventType: string, data: any) {
    this.emitLocal(eventType, data)
  }

  // Type-safe helper subscriptions
  public onPartDelta(cb: (data: SSEEventMessagePartDelta) => void) {
    return this.on<SSEEventMessagePartDelta>('message.part.delta', cb)
  }

  public onPartUpdated(cb: (data: SSEEventMessagePartUpdated) => void) {
    return this.on<SSEEventMessagePartUpdated>('message.part.updated', cb)
  }

  public onMessageUpdated(cb: (data: SSEEventMessageUpdated) => void) {
    return this.on<SSEEventMessageUpdated>('message.updated', cb)
  }

  public onSessionStatus(cb: (data: SSEEventSessionStatus) => void) {
    return this.on<SSEEventSessionStatus>('session.status', cb)
  }

  public onSessionError(cb: (data: SSEEventSessionError) => void) {
    return this.on<SSEEventSessionError>('session.error', cb)
  }

  public onSessionIdle(cb: (data: SSEEventSessionIdle) => void) {
    return this.on<SSEEventSessionIdle>('session.idle', cb)
  }

  public onMessageRemoved(cb: (data: { sessionID: string; messageID: string }) => void) {
    return this.on<{ sessionID: string; messageID: string }>('message.removed', cb)
  }
}

export const sseManager = new GlobalEventStreamManager()
