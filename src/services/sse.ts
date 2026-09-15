// Server-Sent Events (SSE) Manager for OpenCode global events (/global/event)

import { BASE_URL } from './api'
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

class GlobalEventStreamManager {
  private eventSource: EventSource | null = null
  private listeners: Map<string, Set<SSEEventListener>> = new Map()
  private isConnecting: boolean = false
  private retryTimeout: number | null = null
  private retryDelay: number = 2000
  public isConnected: boolean = false

  constructor() {
    this.connect()
  }

  public connect() {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return
    if (this.eventSource || this.isConnecting) return
    this.isConnecting = true

    try {
      const url = `${BASE_URL}/global/event`
      const es = new EventSource(url)
      this.eventSource = es

      es.onopen = () => {
        this.isConnected = true
        this.isConnecting = false
        this.retryDelay = 2000
        this.emit('connection.change', { connected: true })
      }

      es.onmessage = (event) => {
        try {
          if (!event.data) return
          const parsed = JSON.parse(event.data)
          const payload: SSEPayload = parsed.payload || parsed
          if (payload && payload.type) {
            this.emit(payload.type, payload.properties)
            this.emit('*', payload)
          }
        } catch (err) {
          console.error('Failed to parse SSE event data:', err, event.data)
        }
      }

      es.onerror = (err) => {
        console.warn('SSE stream error, reconnecting...', err)
        this.isConnected = false
        this.isConnecting = false
        this.emit('connection.change', { connected: false })
        this.cleanup()
        this.scheduleReconnect()
      }
    } catch (e) {
      console.error('Exception creating EventSource:', e)
      this.isConnecting = false
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (typeof window === 'undefined') return
    if (this.retryTimeout) return
    this.retryTimeout = window.setTimeout(() => {
      this.retryTimeout = null
      this.retryDelay = Math.min(this.retryDelay * 1.5, 10000)
      this.connect()
    }, this.retryDelay)
  }

  private cleanup() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
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

  private emit(eventType: string, data: any) {
    const set = this.listeners.get(eventType)
    if (set) {
      set.forEach((listener) => {
        try {
          listener(data)
        } catch (err) {
          console.error(`Error in SSE listener for "${eventType}":`, err)
        }
      })
    }
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
