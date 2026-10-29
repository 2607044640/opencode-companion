import { useState, useEffect, useCallback, useRef } from 'react'
import type { DraftInjection, PromptDraft } from '../components/chat/PromptInput'
import {
  canAutoDrainQueue,
  createQueuedMessage,
  dequeueFirst,
  enqueueMessage,
  loadPersistedQueue,
  migrateSessionQueue,
  removeQueuedMessage,
  savePersistedQueue,
  shouldEnqueueSubmission,
  type QueuedMessage,
  type QueuedPromptOptions,
} from '../utils/message-queue'
import { DRAFT_SESSION_ID } from './useSessions'

export interface UsePromptQueueParams {
  activeSessionId: string | null
  isBusy: boolean
  runKnown: boolean
  sessionStatusType: string
  turnEnd: 'clean' | 'error' | 'user' | null
  onSendPrompt: (text: string, options?: QueuedPromptOptions) => Promise<void>
  onAbort: (opts?: { preempt?: boolean }) => Promise<void>
}

export function usePromptQueue({
  activeSessionId,
  isBusy,
  runKnown,
  sessionStatusType,
  turnEnd,
  onSendPrompt,
  onAbort,
}: UsePromptQueueParams) {
  const [queueBySession, setQueueBySession] = useState<Record<string, QueuedMessage[]>>(() =>
    loadPersistedQueue(typeof window !== 'undefined' ? window.sessionStorage : undefined)
  )
  const [pausedBySession, setPausedBySession] = useState<Record<string, boolean>>({})
  const [queueEditRequest, setQueueEditRequest] = useState<
    (DraftInjection & { agent?: string; model?: { providerID: string; modelID: string } }) | null
  >(null)
  const [isDispatching, setIsDispatching] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      savePersistedQueue(window.sessionStorage, queueBySession)
    }
  }, [queueBySession])

  const queueSessionKey = activeSessionId || DRAFT_SESSION_ID
  const queuedMessages = queueBySession[queueSessionKey] || []
  const isPaused = Boolean(pausedBySession[queueSessionKey])

  const queuedMessagesRef = useRef(queuedMessages)
  queuedMessagesRef.current = queuedMessages

  const isDispatchingRef = useRef(false)
  const onSendPromptRef = useRef(onSendPrompt)
  onSendPromptRef.current = onSendPrompt

  // Track turnEnd transitions to pause queue only when an active turn ends in error or user stop
  const prevTurnEndRef = useRef<'clean' | 'error' | 'user' | null>(null)
  useEffect(() => {
    if (turnEnd === prevTurnEndRef.current) return
    prevTurnEndRef.current = turnEnd
    if ((turnEnd === 'error' || turnEnd === 'user') && queuedMessagesRef.current.length > 0) {
      setPausedBySession((prev) => ({ ...prev, [queueSessionKey]: true }))
    } else if (turnEnd === 'clean') {
      setPausedBySession((prev) => {
        if (!prev[queueSessionKey]) return prev
        const next = { ...prev }
        delete next[queueSessionKey]
        return next
      })
    }
  }, [turnEnd, queueSessionKey])

  // Clear paused flag automatically when queue becomes empty
  useEffect(() => {
    if (queuedMessages.length === 0 && pausedBySession[queueSessionKey]) {
      setPausedBySession((prev) => {
        const next = { ...prev }
        delete next[queueSessionKey]
        return next
      })
    }
  }, [queuedMessages.length, pausedBySession, queueSessionKey])

  const enqueue = useCallback(
    (draft: PromptDraft) => {
      const item = createQueuedMessage(draft.text, draft.options)
      setQueueBySession((prev) => ({
        ...prev,
        [queueSessionKey]: enqueueMessage(prev[queueSessionKey] || [], item),
      }))
      // Submitting a new message resumes queue draining if it was previously paused
      setPausedBySession((prev) => {
        if (!prev[queueSessionKey]) return prev
        const next = { ...prev }
        delete next[queueSessionKey]
        return next
      })
    },
    [queueSessionKey]
  )

  const removeQueued = useCallback(
    (id: string) => {
      setQueueBySession((prev) => ({
        ...prev,
        [queueSessionKey]: removeQueuedMessage(prev[queueSessionKey] || [], id),
      }))
    },
    [queueSessionKey]
  )

  const editQueued = useCallback(
    (id: string) => {
      const item = queuedMessagesRef.current.find((entry) => entry.id === id)
      if (!item) return
      setQueueBySession((prev) => ({
        ...prev,
        [queueSessionKey]: removeQueuedMessage(prev[queueSessionKey] || [], id),
      }))
      setQueueEditRequest({
        text: item.text,
        attachments: item.options?.attachments,
        timestamp: Date.now(),
        focus: true,
        agent: item.options?.agent,
        model: item.options?.model,
      })
    },
    [queueSessionKey]
  )

  const dispatchQueueItem = useCallback(
    async (id: string, immediate = false) => {
      if (isDispatchingRef.current) return
      const current = queuedMessagesRef.current
      const target = current.find((item) => item.id === id)
      if (!target) return

      isDispatchingRef.current = true
      setIsDispatching(true)
      setPausedBySession((prev) => {
        if (!prev[queueSessionKey]) return prev
        const next = { ...prev }
        delete next[queueSessionKey]
        return next
      })
      setQueueBySession((prev) => ({
        ...prev,
        [queueSessionKey]: removeQueuedMessage(prev[queueSessionKey] || [], id),
      }))

      try {
        if (immediate) {
          await onAbort({ preempt: true })
        }
        await onSendPromptRef.current(target.text, target.options)
      } finally {
        isDispatchingRef.current = false
        setIsDispatching(false)
      }
    },
    [queueSessionKey, onAbort]
  )

  const migrateDraftQueue = useCallback((newSessionId: string) => {
    if (!newSessionId || newSessionId === DRAFT_SESSION_ID) return
    setQueueBySession((prev) => migrateSessionQueue(prev, DRAFT_SESSION_ID, newSessionId))
  }, [])

  // Level-triggered Auto-Drain Engine:
  // Whenever the session is idle, known, not currently dispatching, and not paused,
  // automatically pop and send the head of the FIFO queue.
  useEffect(() => {
    const ready = canAutoDrainQueue({
      isBusy,
      runKnown,
      statusType: sessionStatusType,
      queueLength: queuedMessages.length,
      isPaused,
      isDispatching: isDispatching || isDispatchingRef.current,
    })
    if (!ready) return

    const { item } = dequeueFirst(queuedMessages)
    if (!item) return

    void dispatchQueueItem(item.id, false)
  }, [isBusy, runKnown, sessionStatusType, queuedMessages, isPaused, isDispatching, dispatchQueueItem])

  // Unified prompt submission gate:
  // Guarantees that if the model is busy OR the queue already has items, new submissions
  // are enqueued in FIFO order instead of cutting in line.
  const submitOrEnqueue = useCallback(
    async (text: string, options?: QueuedPromptOptions) => {
      if (shouldEnqueueSubmission(isBusy || isDispatchingRef.current, queuedMessagesRef.current.length)) {
        enqueue({ text, options })
        return
      }
      await onSendPromptRef.current(text, options)
    },
    [isBusy, enqueue]
  )

  return {
    queuedMessages,
    isQueuePaused: isPaused,
    isDispatchingQueue: isDispatching,
    queueEditRequest,
    enqueue,
    removeQueued,
    editQueued,
    sendQueuedNow: (id: string) => void dispatchQueueItem(id, true),
    migrateDraftQueue,
    submitOrEnqueue,
  }
}
