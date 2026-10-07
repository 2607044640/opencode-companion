import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  Message,
  MessagePart,
  TextPart,
  ReasoningPart,
  FilePart,
  SessionStatusPayload,
  TodoItem,
  Session,
} from '../types/opencode'
import { api, mergeMessageInfo, normalizeMessageInfo, normalizeMessagePart, extractRelayErrorMessage, isAbortError } from '../services/api'
import { sseManager } from '../services/sse'
import { classifyEmptyIdleFuse, decideEmptyTurnAutoRetry, userTurnKey } from './empty-idle-fuse'
import { maybeCommitGitCheckpoint } from '../utils/maybe-git-checkpoint'
import { postExternalFileRollback } from '../services/host-api'
import { executeRevertWithTimeout, withRevertTimeout, type RevertMode as EngineRevertMode } from '../utils/revert-engine'
import {
  buildPromptParts,
  buildOptimisticMessage,
  reconcileHistoryWithOptimistic,
} from '../utils/prompt-parts'
import { partitionAssistantTurn } from '../utils/worked-summary'
import { isRunningStatus } from '../utils/session-run-state'

import type {
  PromptAttachment,
} from '../types/opencode'

export type { PromptAttachment }

export type RevertMode = EngineRevertMode

export function useChatStream(
  sessionId: string | null,
  onSessionUpdate?: (sessionId: string, patch: Partial<Session>) => void,
  sessionDir?: string
) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState<boolean>(() => Boolean(sessionId && sessionId !== '__draft__'))
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<SessionStatusPayload>({ type: 'idle' })
  /** False until GET /session/status answers. Chrome must not paint finished or retry from a guess. */
  const [runKnown, setRunKnown] = useState(false)
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [error, setError] = useState<string | null>(null)
  /** Bumps on every transition into idle so the queue can drain even if status was already idle. */
  const [turnEpoch, setTurnEpoch] = useState(0)
  /** Why the latest turn ended. 'user' is Stop; 'error' pauses the queue; null is a clean finish. */
  const [turnEnd, setTurnEnd] = useState<'clean' | 'error' | 'user' | null>(null)

  // Use a ref to access latest messages in SSE callbacks without stale closures
  const messagesRef = useRef<Message[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Track the ID of the pending optimistic user message so we can swap it with the
  // real backend message when SSE fires — prevents the "sent twice" duplicate bug.
  const pendingOptimisticIdRef = useRef<string | null>(null)
  const userAbortedRef = useRef(false)
  const transitioningSessionIdRef = useRef<string | null>(null)
  const currentSessionIdRef = useRef<string | null>(sessionId)
  const sessionBusyRef = useRef(false)
  /** Bumps on every status write so a late /session/status snapshot cannot clobber SSE, send, or abort. */
  const statusEpochRef = useRef(0)
  const autoRetriedTurnKeyRef = useRef<string | null>(null)
  const retryRef = useRef<() => Promise<void>>(async () => {})

  const noteTurnEnd = useCallback((kind: 'clean' | 'error' | 'user') => {
    if (!sessionBusyRef.current && kind === 'clean') return
    sessionBusyRef.current = false
    setTurnEnd(kind)
    setTurnEpoch((n) => n + 1)
  }, [])

  const commitSessionStatus = useCallback((next: SessionStatusPayload, known = true) => {
    statusEpochRef.current += 1
    if (isRunningStatus(next)) sessionBusyRef.current = true
    setSessionStatus(next)
    if (known) setRunKnown(true)
  }, [])

  // Load initial messages and todos when sessionId changes.
  // Chrome stays "confirming" until GET /session/status answers, so a restore
  // cannot paint the finished check or a stale retry banner first.
  // A late snapshot cannot overwrite SSE, send, or abort.
  const loadSessionData = useCallback(async (id: string) => {
    if (currentSessionIdRef.current !== id) return
    const peeked = api.peekMessages(id)
    const statusEpoch = statusEpochRef.current
    const applySnapshot = (status: SessionStatusPayload | null) => {
      if (currentSessionIdRef.current !== id) return false
      if (statusEpochRef.current !== statusEpoch) return false
      if (!status) return false
      // A send/restore that already marked this session running wins over a stale idle snapshot.
      if (status.type === 'idle' && sessionBusyRef.current) {
        setRunKnown(true)
        return false
      }
      commitSessionStatus(status)
      return true
    }
    const statusPromise = api.getSessionStatus(id).then((status) => {
      applySnapshot(status)
      return status
    })
    if (peeked) {
      setMessages((prev) => reconcileHistoryWithOptimistic(peeked, prev))
      setLoadedSessionId(id)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setError(null)
    const todosPromise = api.getTodos(id)
    try {
      const history = await api.getMessages(id)
      const runStatus = await statusPromise
      if (currentSessionIdRef.current !== id) return
      if (runStatus === null && statusEpochRef.current === statusEpoch) {
        const last = history[history.length - 1]
        if (last?.info.role === 'assistant') {
          const probed = partitionAssistantTurn(last.parts, last.info, Date.now(), false)
          if (probed.isLive) commitSessionStatus({ type: 'busy' })
        }
      }
      if (currentSessionIdRef.current === id && statusEpochRef.current === statusEpoch) {
        setRunKnown(true)
      }
      setMessages((prev) => reconcileHistoryWithOptimistic(history, prev))
      setLoadedSessionId(id)
      setLoading(false)
      const initialTodos = await todosPromise
      if (currentSessionIdRef.current !== id) return
      setTodos(initialTodos || [])
    } catch (err) {
      if (currentSessionIdRef.current !== id) return
      console.error('Failed to load session history:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (currentSessionIdRef.current === id) {
        setLoadedSessionId(id)
        setLoading(false)
        if (statusEpochRef.current === statusEpoch) setRunKnown(true)
      }
    }
  }, [commitSessionStatus])

  useEffect(() => {
    currentSessionIdRef.current = sessionId

    // If an in-flight prompt initiated this session switch, preserve optimistic messages and status!
    if (transitioningSessionIdRef.current === sessionId && sessionId) {
      transitioningSessionIdRef.current = null
      loadSessionData(sessionId)
      return
    }

    commitSessionStatus({ type: 'idle' }, false)
    sessionBusyRef.current = false
    setRunKnown(false)
    setError(null)
    setTurnEnd(null)
    userAbortedRef.current = false

    if (!sessionId || sessionId === '__draft__') {
      setMessages([])
      setTodos([])
      setLoading(false)
      setLoadedSessionId(sessionId)
      setRunKnown(true)
      return
    }

    setLoading(true)
    setMessages([])
    setTodos([])
    loadSessionData(sessionId)

    // Ctrl+W then Ctrl+Shift+T restores a frozen page (bfcache). The painted
    // checkmark or retry banner is stale until /session/status answers again.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      const id = currentSessionIdRef.current
      if (!id || id === '__draft__') return
      statusEpochRef.current += 1
      sessionBusyRef.current = false
      setRunKnown(false)
      setError(null)
      void loadSessionData(id)
    }
    window.addEventListener('pageshow', onPageShow)

    // Subscribe to SSE events
    const unsubDelta = sseManager.onPartDelta((data) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return

      const known = messagesRef.current.find((m) => m.info.id === data.messageID)
      const done = Boolean(known?.info.time.completed || known?.info.finish || known?.info.error)
      if (known && !done && !sessionBusyRef.current) {
        commitSessionStatus({ type: 'busy' })
      }

      setMessages((prev) => {
        let msgFound = false
        const next = prev.map((msg) => {
          if (msg.info.id !== data.messageID) return msg
          msgFound = true

          let partFound = false
          const nextParts = msg.parts.map((p) => {
            if (p.id !== data.partID) return p
            partFound = true

            if (p.type === 'text') {
              return { ...p, text: (p as TextPart).text + data.delta }
            }
            if (p.type === 'reasoning') {
              return { ...p, text: (p as ReasoningPart).text + data.delta }
            }
            return p
          })

          if (!partFound) {
            // Part didn't exist yet, create text or reasoning part
            const newPart: MessagePart =
              data.field === 'reasoning'
                ? {
                    id: data.partID,
                    sessionID: data.sessionID,
                    messageID: data.messageID,
                    type: 'reasoning',
                    text: data.delta,
                  }
                : {
                    id: data.partID,
                    sessionID: data.sessionID,
                    messageID: data.messageID,
                    type: 'text',
                    text: data.delta,
                  }
            nextParts.push(newPart)
          }

          return { ...msg, parts: nextParts }
        })

        if (!msgFound) {
          // If message itself is not in state yet, append a placeholder
          const newPart: MessagePart =
            data.field === 'reasoning'
              ? {
                  id: data.partID,
                  sessionID: data.sessionID,
                  messageID: data.messageID,
                  type: 'reasoning',
                  text: data.delta,
                }
              : {
                  id: data.partID,
                  sessionID: data.sessionID,
                  messageID: data.messageID,
                  type: 'text',
                  text: data.delta,
                }

          return [
            ...next,
            {
              info: {
                id: data.messageID,
                sessionID: data.sessionID,
                role: 'assistant',
                time: { created: Date.now() },
              },
              parts: [newPart],
            },
          ]
        }

        return next
      })
    })

    const unsubPartUpdated = sseManager.onPartUpdated((data) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return
      const cleanPart = normalizeMessagePart(data.part)
      console.warn('[CHAT_STREAM_DEBUG] ⚡ onPartUpdated received:', {
        partId: cleanPart.id,
        type: cleanPart.type,
        messageId: cleanPart.messageID,
      })

      setMessages((prev) => {
        let msgFound = false
        const next = prev.map((msg) => {
          const isPendingMatch = pendingOptimisticIdRef.current && msg.info.id === pendingOptimisticIdRef.current
          if (msg.info.id !== cleanPart.messageID && !isPendingMatch) return msg
          msgFound = true

          let partFound = false
          const nextParts: MessagePart[] = []
          let replacedOptimistic = false

          for (const p of msg.parts) {
            if (p.id === cleanPart.id) {
              partFound = true
              nextParts.push(cleanPart)
            } else if ((p as any).isOptimistic && p.type === cleanPart.type && !replacedOptimistic) {
              // Cleanly replace optimistic placeholder part with authoritative backend part
              partFound = true
              replacedOptimistic = true
              nextParts.push(cleanPart)
            } else {
              nextParts.push(p)
            }
          }

          if (!partFound) {
            nextParts.push(cleanPart)
          }

          return { ...msg, parts: nextParts }
        })

        if (!msgFound && cleanPart.messageID) {
          const isUserPart = cleanPart.type === 'file'
          return [
            ...next,
            {
              info: normalizeMessageInfo({
                id: cleanPart.messageID,
                sessionID: data.sessionID,
                role: isUserPart ? 'user' : 'assistant',
                time: { created: Date.now() },
              }),
              parts: [cleanPart],
            },
          ]
        }

        return next
      })
    })

    const unsubMsgUpdated = sseManager.onMessageUpdated((data) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return
      const cleanInfo = normalizeMessageInfo(data.info)

      setMessages((prev) => {
        let found = false
        const next = prev.map((msg) => {
          if (msg.info.id !== cleanInfo.id) return msg
          found = true
          return { ...msg, info: mergeMessageInfo(msg.info, cleanInfo) }
        })

        if (!found) {
          // Reconcile optimistic user message: swap it with the real backend message
          // and align its parts' messageID so subsequent part.updated events match.
          const pendingId = pendingOptimisticIdRef.current
          if (pendingId && cleanInfo.role === 'user') {
            pendingOptimisticIdRef.current = null
            return next.map((msg) =>
              msg.info.id === pendingId
                ? {
                    ...msg,
                    info: mergeMessageInfo(msg.info, cleanInfo),
                    parts: msg.parts.map((p) => ({
                      ...p,
                      messageID: cleanInfo.id,
                    })),
                  }
                : msg
            )
          }
          return [...next, { info: cleanInfo, parts: [] }]
        }
        return next
      })
    })

    const unsubStatus = sseManager.onSessionStatus((data) => {
      if (data.sessionID !== sessionId) return
      commitSessionStatus(data.status)
      if (data.status.type === 'idle') {
        noteTurnEnd(userAbortedRef.current ? 'user' : 'clean')
      }
    })

    // SSE Error Fuse: break out of busy state immediately on backend errors
    const unsubError = sseManager.onSessionError((data) => {
      if (data.sessionID !== sessionId) return
      commitSessionStatus({ type: 'idle' })

      // User-initiated or backend abort is not a relay failure
      if (userAbortedRef.current || isAbortError(data.error)) {
        userAbortedRef.current = false
        setError(null)
        noteTurnEnd('user')
        return
      }

      const errorMsg = extractRelayErrorMessage(data.error) || 'Session error occurred'
      if (isAbortError(errorMsg)) {
        setError(null)
        noteTurnEnd('user')
        return
      }
      setError(errorMsg)
      noteTurnEnd('error')

      // Attach error directly to the last assistant message so it renders inside the message bubble
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const last = prev[prev.length - 1]
        if (last.info.role === 'assistant' && !last.info.error) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              info: {
                ...last.info,
                error: {
                  name: data.error?.name || 'SessionError',
                  message: errorMsg,
                  data: data.error?.data || {},
                },
              },
            },
          ]
        }
        return prev
      })
    })

    // Safely finalize to idle when backend signals session.idle + Empty-idle Fuse
      const unsubIdle = sseManager.onSessionIdle((data) => {
      if (data.sessionID !== sessionId) return
      commitSessionStatus({ type: 'idle' })

      const currentMsgs = messagesRef.current
      const lastMsg = currentMsgs[currentMsgs.length - 1]
      const fuse = classifyEmptyIdleFuse({
        lastMessage: lastMsg,
        userAborted: userAbortedRef.current,
      })
      const abortedByUser = userAbortedRef.current
      userAbortedRef.current = false
      if (fuse.kind === 'none' && lastMsg?.info.role === 'assistant') {
        void maybeCommitGitCheckpoint(sessionId, currentMsgs)
      }
      const turnKey = userTurnKey(currentMsgs)
      const auto =
        (fuse.kind === 'empty_response' || fuse.kind === 'system_abort') && lastMsg
          ? decideEmptyTurnAutoRetry({
              fuseKind: fuse.kind,
              turnKey,
              alreadyRetriedTurnKey: autoRetriedTurnKeyRef.current,
              assistantHasError: Boolean(lastMsg.info.error),
            })
          : null
      if (auto?.retry && turnKey) {
        autoRetriedTurnKeyRef.current = turnKey
        void retryRef.current()
        return
      }
      if (abortedByUser || fuse.kind === 'user_abort') {
        noteTurnEnd('user')
      } else if (
        fuse.kind === 'empty_response' ||
        fuse.kind === 'system_abort' ||
        fuse.kind === 'repetition_loop' ||
        Boolean(lastMsg?.info.role === 'assistant' && lastMsg.info.error)
      ) {
        noteTurnEnd('error')
      } else {
        noteTurnEnd('clean')
      }
      if ((fuse.kind === 'empty_response' || fuse.kind === 'system_abort') && lastMsg) {
        if (isAbortError(lastMsg.info.error)) {
          return
        }
        if (lastMsg.info.finish === 'abort' && auto?.reason !== 'already_retried') {
          return
        }
        const errorMsg = lastMsg.info.error
          ? extractRelayErrorMessage(lastMsg.info.error)
          : fuse.message
        if (isAbortError(errorMsg)) {
          return
        }
        setError(errorMsg)
        setMessages((prev) => {
          if (prev.length === 0) return prev
          const last = prev[prev.length - 1]
          if (last.info.id === lastMsg.info.id && !last.info.error) {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                info: {
                  ...last.info,
                  error: {
                    name: fuse.errorName,
                    message: errorMsg,
                    data: { message: errorMsg, kind: fuse.kind },
                  },
                },
              },
            ]
          }
          return prev
        })
      }
    })

    // Subscribe to message.removed to synchronize deletions
    const unsubRemoved = sseManager.onMessageRemoved((data) => {
      if (data.sessionID !== sessionId) return
      setMessages((prev) => prev.filter((m) => m.info.id !== data.messageID))
    })

    const unsubTodo = sseManager.on('todo.updated', (data: any) => {
      if (data?.sessionID === sessionId && Array.isArray(data?.todos)) {
        setTodos(data.todos)
      }
    })

    return () => {
      window.removeEventListener('pageshow', onPageShow)
      unsubDelta()
      unsubPartUpdated()
      unsubMsgUpdated()
      unsubStatus()
      unsubError()
      unsubIdle()
      unsubTodo()
      unsubRemoved()
    }
  }, [sessionId, loadSessionData, noteTurnEnd, commitSessionStatus])

  const sendPrompt = useCallback(
    async (
      text: string,
      options?: {
        agent?: string
        model?: { providerID: string; modelID: string }
        attachments?: PromptAttachment[]
      },
      targetSessionId?: string
    ) => {
      const effectiveSessionId = targetSessionId || sessionId
      const hasText = Boolean(text.trim())
      const hasAttachments = Boolean(options?.attachments && options.attachments.length > 0)
      if (!effectiveSessionId || (!hasText && !hasAttachments)) {
        return
      }

      // Mark the active session ID ref immediately so incoming SSE events are accepted without race conditions
      currentSessionIdRef.current = effectiveSessionId
      if (targetSessionId) {
        transitioningSessionIdRef.current = targetSessionId
      }

      // Optimistically add user message to timeline using unified builder
      const userMsg = buildOptimisticMessage({
        sessionId: effectiveSessionId,
        text,
        attachments: options?.attachments,
        agent: options?.agent,
        model: options?.model,
      })

      setMessages((prev) => [...prev, userMsg])
      pendingOptimisticIdRef.current = userMsg.info.id
      userAbortedRef.current = false
      commitSessionStatus({ type: 'busy' })
      setError(null)
      setTurnEnd(null)

      const apiParts = buildPromptParts(text, options?.attachments)

      try {
        await api.sendPrompt(effectiveSessionId, apiParts, {
          agent: options?.agent,
          model: options?.model,
          attachments: options?.attachments,
        })
      } catch (err) {
        console.error('Failed to send prompt:', err)
        setError(err instanceof Error ? err.message : String(err))
        commitSessionStatus({ type: 'idle' })
        noteTurnEnd('error')
      }
    },
    [sessionId, noteTurnEnd, commitSessionStatus]
  )

  const abort = useCallback(async (opts?: { preempt?: boolean }) => {
    if (!sessionId) return
    const running = sessionBusyRef.current
    if (!running && opts?.preempt) return
    if (!opts?.preempt) {
      userAbortedRef.current = true
    }
    setError(null)
    commitSessionStatus({ type: 'idle' })
    if (running && !opts?.preempt) {
      noteTurnEnd('user')
    } else {
      sessionBusyRef.current = false
    }
    try {
      await api.abortSession(sessionId)
    } catch (err) {
      console.error('Failed to abort session:', err)
    }
  }, [sessionId, noteTurnEnd, commitSessionStatus])

  const retry = useCallback(async () => {
    setError(null)
    if (!sessionId) return

    const msgs = messagesRef.current
    let lastUserIndex = -1
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].info.role === 'user') {
        lastUserIndex = i
        break
      }
    }

    if (lastUserIndex === -1) {
      await loadSessionData(sessionId)
      return
    }

    const lastUserMsg = msgs[lastUserIndex]
    const subsequentAssistantMsgs = msgs.slice(lastUserIndex + 1).filter((m) => m.info.role === 'assistant')

    // 1. Physically delete failed/empty assistant messages from backend SQLite
    for (const aMsg of subsequentAssistantMsgs) {
      try {
        await api.deleteMessage(sessionId, aMsg.info.id)
      } catch (err) {
        console.warn(`[Retry] Failed to delete assistant message ${aMsg.info.id}:`, err)
      }
    }

    // 2. Also delete the old user message from backend SQLite to prevent duplicate user turns
    try {
      await api.deleteMessage(sessionId, lastUserMsg.info.id)
    } catch (err) {
      console.warn(`[Retry] Failed to delete user message ${lastUserMsg.info.id}:`, err)
    }

    // 3. Immediately strip the failed assistant messages and old user message locally
    setMessages((prev) =>
      prev.filter((m) => {
        if (m.info.id === lastUserMsg.info.id) return false
        if (subsequentAssistantMsgs.some((a) => a.info.id === m.info.id)) return false
        return true
      })
    )

    // 4. Re-dispatch the prompt cleanly without residue
    const textParts = lastUserMsg.parts.filter((p) => p.type === 'text') as TextPart[]
    const fileParts = lastUserMsg.parts.filter((p) => p.type === 'file') as FilePart[]
    const text = textParts.map((p) => p.text).join('\n')
    const attachments = fileParts.map((f) => ({
      id: f.id,
      name: f.filename,
      mime: f.mime,
      url: f.url,
    }))

    await sendPrompt(text, {
      agent: lastUserMsg.info.agent,
      model: lastUserMsg.info.model
        ? {
            providerID: lastUserMsg.info.model.providerID,
            modelID: lastUserMsg.info.model.modelID,
          }
        : undefined,
      attachments,
    })
  }, [sessionId, sendPrompt, loadSessionData])

  useEffect(() => {
    retryRef.current = retry
  }, [retry])

  const [reverting, setReverting] = useState<boolean>(false)

  /**
   * Revert session to a specific message using OpenCode daemon native atomic rollback
   */
  const revertToMessage = useCallback(
    async (
      messageId: string,
      options?: { mode?: RevertMode; partID?: string }
    ) => {
      if (!sessionId) {
        console.warn('[Revert:Hook] Cannot revert: No active session')
        return { ok: false, error: 'No active session' }
      }
      setReverting(true)
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
        setReverting(false)
      }
    },
    [sessionId, loadSessionData, onSessionUpdate, sessionDir]
  )

  /**
   * Restore all previously reverted messages and file state
   */
  const unrevert = useCallback(async () => {
    if (!sessionId) return { ok: false, error: 'No active session' }
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
      setReverting(false)
    }
  }, [sessionId, loadSessionData, onSessionUpdate])

  return {
    messages,
    loading: loading || Boolean(sessionId && sessionId !== '__draft__' && loadedSessionId !== sessionId),
    runKnown,
    sessionStatus,
    todos,
    error,
    turnEpoch,
    turnEnd,
    sendPrompt,
    abort,
    retry,
    revertToMessage,
    unrevert,
    reverting,
    reload: () => sessionId && loadSessionData(sessionId),
  }
}
