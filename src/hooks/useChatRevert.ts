import { useState, useCallback, type MutableRefObject } from 'react'
import type { Message, Session, SessionStatusPayload } from '../types/opencode'
import { api } from '../services/api'
import { postExternalFileRollback } from '../services/host-api'
import {
  executeRevertWithTimeout,
  withRevertTimeout,
  type RevertMode,
} from '../utils/revert-engine'
import { isRunningStatus } from '../utils/session-run-state'
import type { AutoRecoveryState } from './useChatStream'
import { markUserStop } from './stop-registry'

export interface UseChatRevertDeps {
  sessionId: string | null
  sessionDir?: string
  messagesRef: MutableRefObject<Message[]>
  sessionBusyRef: MutableRefObject<boolean>
  sessionStatusRef: MutableRefObject<SessionStatusPayload>
  userAbortedRef: MutableRefObject<boolean>
  revertingRef: MutableRefObject<boolean>
  clearAutoRecoveryTimer: () => void
  setAutoRecoveryState: (val: AutoRecoveryState | null) => void
  commitTerminalError: (val: boolean) => void
  commitSessionStatus: (next: SessionStatusPayload, known?: boolean) => void
  setError: (err: string | null) => void
  loadSessionData: (id: string) => Promise<void>
  onSessionUpdate?: (sessionId: string, patch: Partial<Session>) => void
}

export function useChatRevert({
  sessionId,
  sessionDir,
  messagesRef,
  sessionBusyRef,
  sessionStatusRef,
  userAbortedRef,
  revertingRef,
  clearAutoRecoveryTimer,
  setAutoRecoveryState,
  commitTerminalError,
  commitSessionStatus,
  setError,
  loadSessionData,
  onSessionUpdate,
}: UseChatRevertDeps) {
  const [reverting, setReverting] = useState<boolean>(false)

  const revertToMessage = useCallback(
    async (
      messageId: string,
      options?: { mode?: RevertMode; partID?: string }
    ) => {
      if (!sessionId) {
        console.warn('[Revert:Hook] Cannot revert: No active session')
        return { ok: false, error: 'No active session' }
      }
      clearAutoRecoveryTimer()
      setAutoRecoveryState(null)
      commitTerminalError(false)
      revertingRef.current = true
      setReverting(true)

      if (sessionBusyRef.current || isRunningStatus(sessionStatusRef.current)) {
        console.log('[Revert:Hook] Active prompt/retry in flight during revert, aborting session first:', sessionId)
        userAbortedRef.current = true
        markUserStop(sessionId)
        try {
          await api.abortSession(sessionId)
        } catch (err) {
          console.warn('[Revert:Hook] Pre-revert abort warning:', err)
        }
        sessionBusyRef.current = false
        commitSessionStatus({ type: 'idle' })
        setError(null)
      }

      const effectiveDir = sessionDir || messagesRef.current[0]?.info.path?.cwd
      console.log('[Revert:Hook] revertToMessage called:', {
        sessionId,
        messageId,
        options,
        effectiveDir,
        messagesCount: messagesRef.current.length,
      })
      try {
        const result = await executeRevertWithTimeout(
          {
            sessionId,
            messageId,
            mode: options?.mode || 'both',
            partID: options?.partID,
            messages: messagesRef.current,
            sessionDir: effectiveDir,
          },
          {
            revertSession: (id, msgId, opts) => api.revertSession(id, msgId, opts),
            unrevertSession: (id) => api.unrevertSession(id),
            summarizeSession: (id) => api.summarizeSession(id),
            rollbackFiles: (actions) => postExternalFileRollback(actions),
            reloadSession: (id) => loadSessionData(id),
            onSessionUpdate,
          }
        )
        console.log('[Revert:Hook] executeRevertWithTimeout returned:', result)
        return result
      } catch (err) {
        console.error('[Revert:Hook] Unexpected error in revertToMessage:', err)
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      } finally {
        revertingRef.current = false
        setReverting(false)
      }
    },
    [
      sessionId,
      loadSessionData,
      onSessionUpdate,
      sessionDir,
      clearAutoRecoveryTimer,
      commitSessionStatus,
      commitTerminalError,
      messagesRef,
      revertingRef,
      sessionBusyRef,
      sessionStatusRef,
      setAutoRecoveryState,
      setError,
      userAbortedRef,
    ]
  )

  const unrevert = useCallback(async () => {
    if (!sessionId) return { ok: false, error: 'No active session' }
    clearAutoRecoveryTimer()
    revertingRef.current = true
    setReverting(true)
    try {
      const updatedSession = await withRevertTimeout(api.unrevertSession(sessionId))
      onSessionUpdate?.(sessionId, { revert: undefined })
      await loadSessionData(sessionId)
      return { ok: true, session: updatedSession }
    } catch (err) {
      console.error('Failed to unrevert session:', err)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      revertingRef.current = false
      setReverting(false)
    }
  }, [sessionId, loadSessionData, onSessionUpdate, clearAutoRecoveryTimer, revertingRef])

  return {
    reverting,
    revertToMessage,
    unrevert,
  }
}
