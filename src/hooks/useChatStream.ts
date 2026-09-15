import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  Message,
  MessagePart,
  TextPart,
  ReasoningPart,
  FilePart,
  MessagePartInput,
  SessionStatusPayload,
  TodoItem,
  Session,
} from '../types/opencode'
import { api, normalizeMessageInfo, normalizeMessagePart, extractRelayErrorMessage } from '../services/api'
import { sseManager } from '../services/sse'
import { classifyEmptyIdleFuse } from './empty-idle-fuse'
import { maybeCommitGitCheckpoint } from '../utils/maybe-git-checkpoint'
import { postExternalFileRollback } from '../services/host-api'
import { executeRevertWithTimeout, withRevertTimeout, type RevertMode as EngineRevertMode } from '../utils/revert-engine'

export interface PromptAttachment {
  id?: string
  name?: string
  mime: string
  url: string
}

export type RevertMode = EngineRevertMode

export function useChatStream(
  sessionId: string | null,
  onSessionUpdate?: (sessionId: string, patch: Partial<Session>) => void
) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [sessionStatus, setSessionStatus] = useState<SessionStatusPayload>({ type: 'idle' })
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [error, setError] = useState<string | null>(null)

  // Use a ref to access latest messages in SSE callbacks without stale closures
  const messagesRef = useRef<Message[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Track the ID of the pending optimistic user message so we can swap it with the
  // real backend message when SSE fires — prevents the "sent twice" duplicate bug.
  const pendingOptimisticIdRef = useRef<string | null>(null)
  const userAbortedRef = useRef(false)

  // Load initial messages and todos when sessionId changes
  const loadSessionData = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const [history, initialTodos] = await Promise.all([
        api.getMessages(id),
        api.getTodos(id),
      ])
      setMessages(history)
      setTodos(initialTodos || [])
    } catch (err) {
      console.error('Failed to load session history:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setSessionStatus({ type: 'idle' })
    setError(null)
    userAbortedRef.current = false

    if (!sessionId || sessionId === '__draft__') {
      setMessages([])
      setTodos([])
      return
    }

    setMessages([])
    setTodos([])
    loadSessionData(sessionId)

    // Subscribe to SSE events
    const unsubDelta = sseManager.onPartDelta((data) => {
      if (data.sessionID !== sessionId) return

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
      if (data.sessionID !== sessionId) return
      const cleanPart = normalizeMessagePart(data.part)

      setMessages((prev) => {
        let msgFound = false
        const next = prev.map((msg) => {
          if (msg.info.id !== cleanPart.messageID) return msg
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
          return [
            ...next,
            {
              info: normalizeMessageInfo({
                id: cleanPart.messageID,
                sessionID: data.sessionID,
                role: 'assistant',
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
      if (data.sessionID !== sessionId) return
      const cleanInfo = normalizeMessageInfo(data.info)

      setMessages((prev) => {
        let found = false
        const next = prev.map((msg) => {
          if (msg.info.id !== cleanInfo.id) return msg
          found = true
          return { ...msg, info: { ...msg.info, ...cleanInfo } }
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
                    info: { ...msg.info, ...cleanInfo },
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
      setSessionStatus(data.status)
    })

    // SSE Error Fuse: break out of busy state immediately on backend errors
    const unsubError = sseManager.onSessionError((data) => {
      if (data.sessionID !== sessionId) return
      setSessionStatus({ type: 'idle' })
      const errorMsg = extractRelayErrorMessage(data.error) || 'Session error occurred'
      setError(errorMsg)

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
      setSessionStatus({ type: 'idle' })

      const currentMsgs = messagesRef.current
      const lastMsg = currentMsgs[currentMsgs.length - 1]
      const fuse = classifyEmptyIdleFuse({
        lastMessage: lastMsg,
        userAborted: userAbortedRef.current,
      })
      userAbortedRef.current = false
      if (fuse.kind === 'none' && lastMsg?.info.role === 'assistant') {
        void maybeCommitGitCheckpoint(sessionId, currentMsgs)
      }
      if ((fuse.kind === 'empty_response' || fuse.kind === 'system_abort') && lastMsg) {
        const errorMsg = lastMsg.info.error
          ? extractRelayErrorMessage(lastMsg.info.error)
          : fuse.message
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
      unsubDelta()
      unsubPartUpdated()
      unsubMsgUpdated()
      unsubStatus()
      unsubError()
      unsubIdle()
      unsubTodo()
      unsubRemoved()
    }
  }, [sessionId, loadSessionData])

  const sendPrompt = useCallback(
    async (
      text: string,
      options?: {
        agent?: string
        model?: { providerID: string; modelID: string }
        attachments?: PromptAttachment[]
      }
    ) => {
      const hasText = Boolean(text.trim())
      const hasAttachments = Boolean(options?.attachments && options.attachments.length > 0)
      if (!sessionId || (!hasText && !hasAttachments)) return

      // Optimistically add user message to timeline
      const userMsgId = `usr_${Date.now()}`
      const optimisticParts: MessagePart[] = []

      if (options?.attachments && options.attachments.length > 0) {
        options.attachments.forEach((att, idx) => {
          optimisticParts.push({
            id: `prt_${Date.now()}_att_${idx}`,
            sessionID: sessionId,
            messageID: userMsgId,
            type: 'file',
            mime: att.mime,
            filename: att.name,
            url: att.url,
            isOptimistic: true,
          } as FilePart)
        })
      }

      if (hasText) {
        optimisticParts.push({
          id: `prt_${Date.now()}_txt`,
          sessionID: sessionId,
          messageID: userMsgId,
          type: 'text',
          text: text.trim(),
          isOptimistic: true,
        } as TextPart)
      }

      const userMsg: Message = {
        info: {
          id: userMsgId,
          sessionID: sessionId,
          role: 'user',
          time: { created: Date.now() },
          ...(options?.agent ? { agent: options.agent } : {}),
          ...(options?.model ? { model: options.model } : {}),
        },
        parts: optimisticParts,
      }

      setMessages((prev) => [...prev, userMsg])
      pendingOptimisticIdRef.current = userMsgId
      userAbortedRef.current = false
      setSessionStatus({ type: 'busy' })
      setError(null)

      const apiParts: MessagePartInput[] = []
      if (options?.attachments && options.attachments.length > 0) {
        options.attachments.forEach((att) => {
          apiParts.push({
            type: 'file',
            mime: att.mime,
            filename: att.name,
            url: att.url,
          })
        })
      }
      if (hasText) {
        apiParts.push({
          type: 'text',
          text: text.trim(),
        })
      }

      try {
        await api.sendPrompt(sessionId, apiParts, {
          agent: options?.agent,
          model: options?.model,
        })
      } catch (err) {
        console.error('Failed to send prompt:', err)
        setError(err instanceof Error ? err.message : String(err))
        setSessionStatus({ type: 'idle' })
      }
    },
    [sessionId]
  )

  const abort = useCallback(async () => {
    if (!sessionId) return
    userAbortedRef.current = true
    try {
      await api.abortSession(sessionId)
      setSessionStatus({ type: 'idle' })
    } catch (err) {
      console.error('Failed to abort session:', err)
    }
  }, [sessionId])

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

  const [reverting, setReverting] = useState<boolean>(false)

  /**
   * Revert session to a specific message using OpenCode daemon native atomic rollback
   */
  const revertToMessage = useCallback(
    async (
      messageId: string,
      options?: { mode?: RevertMode; partID?: string }
    ) => {
      if (!sessionId) return { ok: false, error: 'No active session' }
      setReverting(true)
      try {
        return await executeRevertWithTimeout(
          {
            sessionId,
            messageId,
            mode: options?.mode || 'both',
            partID: options?.partID,
            messages: messagesRef.current,
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
      } finally {
        setReverting(false)
      }
    },
    [sessionId, loadSessionData, onSessionUpdate]
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
    loading,
    sessionStatus,
    todos,
    error,
    sendPrompt,
    abort,
    retry,
    revertToMessage,
    unrevert,
    reverting,
    reload: () => sessionId && loadSessionData(sessionId),
  }
}
