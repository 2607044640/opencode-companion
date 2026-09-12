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
  const [state, setState] = useState<DaemonConnectionState>('connected')
  const [attempt, setAttempt] = useState(0)
  const [lastChecked, setLastChecked] = useState(Date.now())
  const [lastConnected, setLastConnected] = useState<number | null>(Date.now())

  const stateRef = useRef(state)
  stateRef.current = state
  const attemptRef = useRef(attempt)
  attemptRef.current = attempt

  const timerRef = useRef<number | null>(null)
  const isProbingRef = useRef(false)

  const checkHealthNow = useCallback(async (): Promise<boolean> => {
    if (isProbingRef.current) return stateRef.current === 'connected'
    isProbingRef.current = true

    try {
      const isHealthy = await api.checkHealth(4000)
      setLastChecked(Date.now())

      if (isHealthy) {
        const wasDisconnected = stateRef.current !== 'connected'
        setState('connected')
        setAttempt(0)
        setLastConnected(Date.now())
        if (wasDisconnected) {
          onRestored?.()
        }
        return true
      } else {
        const nextAttempt = attemptRef.current + 1
        const nextState = determineDaemonState(false, nextAttempt)
        if (stateRef.current === 'connected') {
          onLost?.()
        }
        setState(nextState)
        setAttempt(nextAttempt)
        return false
      }
    } catch {
      const nextAttempt = attemptRef.current + 1
      const nextState = determineDaemonState(false, nextAttempt)
      if (stateRef.current === 'connected') {
        onLost?.()
      }
      setState(nextState)
      setAttempt(nextAttempt)
      return false
    } finally {
      isProbingRef.current = false
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
        if (!payload.connected && stateRef.current === 'connected') {
          // SSE connection dropped -> trigger immediate health recheck
          checkHealthNow()
        } else if (payload.connected && stateRef.current !== 'connected') {
          // SSE reconnected -> confirm via health check
          checkHealthNow()
        }
      }
    )

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
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
