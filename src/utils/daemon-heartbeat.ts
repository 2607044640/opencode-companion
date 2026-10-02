import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../services/api'
import { sseManager } from '../services/sse'

export type DaemonConnectionState = 'connected' | 'reconnecting' | 'offline'

export interface DaemonStatus {
  state: DaemonConnectionState
  attempt: number
  lastChecked: number
  lastConnected: number | null
  error?: string
}

export const BASE_RETRY_DELAY = 2000
export const MAX_RETRY_DELAY = 15000
export const HEALTH_CHECK_INTERVAL = 8000
export const MAX_RECONNECTING_ATTEMPTS = 3

/**
 * Calculates exponential backoff delay based on retry attempt.
 * e.g., attempt 1 -> 2000ms, attempt 2 -> 4000ms, attempt 3 -> 8000ms, attempt 4+ -> 15000ms
 */
export function calculateNextBackoff(
  attempt: number,
  baseDelay = BASE_RETRY_DELAY,
  maxDelay = MAX_RETRY_DELAY
): number {
  if (attempt <= 1) return baseDelay
  const delay = baseDelay * Math.pow(2, attempt - 1)
  return Math.min(delay, maxDelay)
}

export const OFFLINE_AFTER_MS = 30_000

/**
 * Pure state reducer for daemon health check probes.
 */
export function reduceDaemonProbe(input: {
  prev: DaemonConnectionState
  everConnected: boolean
  consecutiveFailures: number
  unhealthySince: number | null
  healthy: boolean
  now: number
}): {
  state: DaemonConnectionState
  consecutiveFailures: number
  unhealthySince: number | null
  notifyLost: boolean
  notifyRestored: boolean
} {
  if (input.healthy) {
    return {
      state: 'connected',
      consecutiveFailures: 0,
      unhealthySince: null,
      notifyLost: false,
      notifyRestored: input.prev !== 'connected',
    }
  }

  const consecutiveFailures = input.consecutiveFailures + 1
  const unhealthySince = input.unhealthySince ?? input.now
  const isOffline = input.now - unhealthySince >= OFFLINE_AFTER_MS
  const notifyLost = input.everConnected && input.prev === 'connected'

  return {
    state: isOffline ? 'offline' : 'reconnecting',
    consecutiveFailures,
    unhealthySince,
    notifyLost,
    notifyRestored: false,
  }
}

/**
 * Determines daemon connection state from boolean health result and failure attempt counter.
 */
export function determineDaemonState(
  connected: boolean,
  attempt: number,
  maxReconnectingAttempts = MAX_RECONNECTING_ATTEMPTS
): DaemonConnectionState {
  if (connected) return 'connected'
  if (attempt <= maxReconnectingAttempts) return 'reconnecting'
  return 'offline'
}

/**
 * Returns human-readable tooltip text for current connection state.
 */
export function getDaemonStateTooltip(
  state: DaemonConnectionState,
  attempt = 0,
  isZh = true
): string {
  if (state === 'connected') {
    return isZh
      ? 'WSL 后端守护进程已连接 (127.0.0.1:5001)'
      : 'Daemon Connected (127.0.0.1:5001)'
  }
  if (state === 'reconnecting') {
    if (attempt === 0) {
      return isZh
        ? '正在连接后端服务...'
        : 'Connecting to daemon...'
    }
    return isZh
      ? `后端服务重连中 (第 ${attempt} 次尝试)... 点击立即重试`
      : `Reconnecting to daemon (Attempt ${attempt})... Click to retry`
  }
  return isZh
    ? '后端守护进程离线 (WSL2 未响应)... 点击立即重试'
    : 'Daemon Offline (WSL2 Unreachable)... Click to retry'
}

export interface DaemonHeartbeatOptions {
  enabled?: boolean
  onRestored?: () => void
  onLost?: () => void
}

export interface DaemonHeartbeatReturn {
  state: DaemonConnectionState
  attempt: number
  lastChecked: number
  lastConnected: number | null
  retryNow: () => Promise<boolean>
}

/**
 * React hook that actively monitors daemon health via HTTP heartbeat & SSE reactive events,
 * applying exponential backoff when disconnected and auto-reconnecting.
 */
export function useDaemonHeartbeat({
  enabled = true,
  onRestored,
  onLost,
}: DaemonHeartbeatOptions = {}): DaemonHeartbeatReturn {
  const [state, setState] = useState<DaemonConnectionState>('reconnecting')
  const [attempt, setAttempt] = useState(0)
  const [lastChecked, setLastChecked] = useState(Date.now())
  const [lastConnected, setLastConnected] = useState<number | null>(null)

  const stateRef = useRef(state)
  stateRef.current = state
  const attemptRef = useRef(attempt)
  attemptRef.current = attempt

  const timerRef = useRef<number | null>(null)
  const isProbingRef = useRef(false)
  const rerunRequestedRef = useRef(false)
  const probeSeqRef = useRef(0)
  const hasEverConnectedRef = useRef(false)
  const unhealthySinceRef = useRef<number | null>(null)
  const sseDebounceTimerRef = useRef<number | null>(null)

  const checkHealthNow = useCallback(async (): Promise<boolean> => {
    if (isProbingRef.current) {
      rerunRequestedRef.current = true
      return stateRef.current === 'connected'
    }
    isProbingRef.current = true
    const currentSeq = ++probeSeqRef.current

    try {
      // Fast-path: If SSE is actively connected, treat as healthy
      const isHealthy = sseManager.isConnected ? true : await api.checkHealth(4000)

      // Ignore stale probe results if a new probe started
      if (currentSeq !== probeSeqRef.current) {
        return stateRef.current === 'connected'
      }

      const now = Date.now()
      setLastChecked(now)

      const result = reduceDaemonProbe({
        prev: stateRef.current,
        everConnected: hasEverConnectedRef.current,
        consecutiveFailures: attemptRef.current,
        unhealthySince: unhealthySinceRef.current,
        healthy: isHealthy,
        now,
      })

      if (result.state !== stateRef.current) {
        console.log(`[daemon-state] Transition: ${stateRef.current} -> ${result.state} (failures: ${result.consecutiveFailures})`)
      }

      unhealthySinceRef.current = result.unhealthySince
      setState(result.state)
      setAttempt(result.consecutiveFailures)

      if (isHealthy) {
        setLastConnected(now)
        hasEverConnectedRef.current = true
      }

      if (result.notifyRestored) {
        onRestored?.()
      }
      if (result.notifyLost) {
        onLost?.()
      }

      return isHealthy
    } catch (err) {
      if (currentSeq !== probeSeqRef.current) {
        return stateRef.current === 'connected'
      }

      const now = Date.now()
      setLastChecked(now)

      const result = reduceDaemonProbe({
        prev: stateRef.current,
        everConnected: hasEverConnectedRef.current,
        consecutiveFailures: attemptRef.current,
        unhealthySince: unhealthySinceRef.current,
        healthy: false,
        now,
      })

      if (result.state !== stateRef.current) {
        console.log(`[daemon-state] Transition: ${stateRef.current} -> ${result.state} (failures: ${result.consecutiveFailures}, err: ${err})`)
      }

      unhealthySinceRef.current = result.unhealthySince
      setState(result.state)
      setAttempt(result.consecutiveFailures)

      if (result.notifyLost) {
        onLost?.()
      }

      return false
    } finally {
      if (currentSeq === probeSeqRef.current) {
        isProbingRef.current = false
        if (rerunRequestedRef.current) {
          rerunRequestedRef.current = false
          Promise.resolve().then(() => checkHealthNow())
        }
      }
    }
  }, [onRestored, onLost])

  // Heartbeat loop scheduler
  const scheduleNextCheck = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const currentState = stateRef.current
    let delay = HEALTH_CHECK_INTERVAL

    if (currentState === 'reconnecting' || currentState === 'offline') {
      delay = calculateNextBackoff(attemptRef.current)
    }

    timerRef.current = window.setTimeout(async () => {
      await checkHealthNow()
      scheduleNextCheck()
    }, delay)
  }, [checkHealthNow])

  useEffect(() => {
    if (!enabled) return

    // Initial check on mount
    checkHealthNow().then(() => {
      scheduleNextCheck()
    })

    // Listen to SSE connection events for instant reaction
    const unsubConnection = sseManager.on(
      'connection.change',
      (payload: { connected: boolean }) => {
        if (!payload.connected) {
          // SSE connection dropped -> debounced health check without immediately punishing attempt
          if (sseDebounceTimerRef.current) {
            clearTimeout(sseDebounceTimerRef.current)
          }
          sseDebounceTimerRef.current = window.setTimeout(() => {
            sseDebounceTimerRef.current = null
            checkHealthNow()
          }, 1500)
        } else if (payload.connected) {
          // SSE connected / reconnected -> instantly restore connected status
          if (sseDebounceTimerRef.current) {
            clearTimeout(sseDebounceTimerRef.current)
            sseDebounceTimerRef.current = null
          }
          checkHealthNow()
        }
      }
    )

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (sseDebounceTimerRef.current) {
        clearTimeout(sseDebounceTimerRef.current)
        sseDebounceTimerRef.current = null
      }
      isProbingRef.current = false
      rerunRequestedRef.current = false
      unsubConnection()
    }
  }, [enabled, checkHealthNow, scheduleNextCheck])

  // Manual retry trigger (e.g. user clicks indicator)
  const retryNow = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const result = await checkHealthNow()
    scheduleNextCheck()
    return result
  }, [checkHealthNow, scheduleNextCheck])

  return {
    state,
    attempt,
    lastChecked,
    lastConnected,
    retryNow,
  }
}
