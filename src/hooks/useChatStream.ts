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
} from '../types/opencode'
import { api, normalizeMessageInfo, normalizeMessagePart } from '../services/api'
import { sseManager } from '../services/sse'

export interface PromptAttachment {
  id?: string
  name?: string
  mime: string
  url: string
}

export function useChatStream(sessionId: string | null) {
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

    if (!sessionId) {
      setMessages([])
      setTodos([])
      return
    }

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
      const errorMsg =
        data.error?.data?.message ||
        data.error?.message ||
        (typeof data.error === 'string' ? data.error : 'Session error occurred')
      setError(errorMsg)
    })

    // Safely finalize to idle when backend signals session.idle
    const unsubIdle = sseManager.onSessionIdle((data) => {
      if (data.sessionID !== sessionId) return
      setSessionStatus({ type: 'idle' })
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
    try {
      await api.abortSession(sessionId)
      setSessionStatus({ type: 'idle' })
    } catch (err) {
      console.error('Failed to abort session:', err)
    }
  }, [sessionId])

  const retry = useCallback(async () => {
    setError(null)
    const userMsgs = messagesRef.current.filter((m) => m.info.role === 'user')
    const lastUserMsg = userMsgs[userMsgs.length - 1]
    if (lastUserMsg) {
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
        model: lastUserMsg.info.model ? {
          providerID: lastUserMsg.info.model.providerID,
          modelID: lastUserMsg.info.model.modelID,
        } : undefined,
        attachments,
      })
    } else if (sessionId) {
      await loadSessionData(sessionId)
    }
  }, [sessionId, sendPrompt, loadSessionData])

  const revertLastExchange = useCallback(
    async (opts: { includeUserMessage?: boolean; directory?: string; gitRevert?: boolean; gitRevertMode?: 'revert' | 'reset' } = {}) => {
      if (!sessionId) return { ok: false, error: 'No active session' }

      const msgs = messagesRef.current
      // Find last assistant and its paired user message
      const lastAssistant = [...msgs].reverse().find((m) => m.info.role === 'assistant')
      const lastUser = lastAssistant
        ? [...msgs].reverse().find((m) => m.info.role === 'user' && m.info.id !== lastAssistant.info.id)
        : undefined

      if (!lastAssistant) return { ok: false, error: 'No assistant message to revert' }

      try {
        // 1. Delete assistant message from daemon
        await api.deleteMessage(sessionId, lastAssistant.info.id)

        // 2. Optionally delete paired user message
        if (opts.includeUserMessage && lastUser) {
          await api.deleteMessage(sessionId, lastUser.info.id).catch(() => {/* ignore if fails */})
        }

        // 3. Optionally trigger git revert via serve.mjs endpoint
        if (opts.gitRevert && opts.directory) {
          const gitResp = await fetch('/api/git-revert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directory: opts.directory, mode: opts.gitRevertMode ?? 'revert' }),
            signal: AbortSignal.timeout(20000),
          })
          if (!gitResp.ok) {
            const errBody = await gitResp.json().catch(() => ({}))
            console.warn('Git revert failed:', errBody)
          }
        }

        // 4. Refresh local messages from daemon
        if (sessionId) await loadSessionData(sessionId)
        return { ok: true }
      } catch (err) {
        console.error('Failed to revert last exchange:', err)
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
    [sessionId, loadSessionData]
  )

  return {
    messages,
    loading,
    sessionStatus,
    todos,
    error,
    sendPrompt,
    abort,
    retry,
    revertLastExchange,
    reload: () => sessionId && loadSessionData(sessionId),
  }
}
