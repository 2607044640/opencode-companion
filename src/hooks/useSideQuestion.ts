import { useState, useRef, useCallback, useEffect } from 'react'
import { api } from '../services/api'
import { sseManager } from '../services/sse'
import type { Message, Session, ProviderInfo } from '../types/opencode'

export interface SideQuestionItem {
  id: string
  sessionID: string
  parentSessionId: string
  question: string
  status: 'generating' | 'done' | 'error'
  thought: string
  answer: string
  thoughtDuration?: number
  startTime: number
  error?: string
}

export interface SideQuestionModelConfig {
  providerID: string
  modelID: string
  name?: string
}

interface ShadowSessionMeta {
  parentKey: string
  itemId: string
}

interface StoredSideQuestionData {
  questionsBySession: Record<string, SideQuestionItem[]>
  currentIndexBySession: Record<string, number>
  cardOpenBySession: Record<string, boolean>
  selectedModel?: SideQuestionModelConfig
}

const STORAGE_KEY = 'opencode_side_questions_store'

function loadStoredData(): StoredSideQuestionData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { questionsBySession: {}, currentIndexBySession: {}, cardOpenBySession: {} }
    }
    const parsed = JSON.parse(raw)
    const questionsBySession: Record<string, SideQuestionItem[]> = {}
    if (parsed.questionsBySession && typeof parsed.questionsBySession === 'object') {
      for (const [sId, list] of Object.entries(parsed.questionsBySession)) {
        if (Array.isArray(list)) {
          // Sanitize: any question left in 'generating' before refresh is marked as 'done'
          questionsBySession[sId] = list.map((item: any) => {
            if (item.status === 'generating') {
              return { ...item, status: 'done' }
            }
            return item
          })
        }
      }
    }
    let selectedModel = parsed.selectedModel
    if (selectedModel && typeof selectedModel === 'object') {
      const mId = (selectedModel.modelID || '').toLowerCase()
      if (mId === 'claude-opus-5-5' || mId.includes('5-5') || mId.includes('opus-5.5')) {
        selectedModel = undefined
      }
    }
    return {
      questionsBySession,
      currentIndexBySession: parsed.currentIndexBySession || {},
      cardOpenBySession: parsed.cardOpenBySession || {},
      selectedModel,
    }
  } catch (err) {
    console.warn('[useSideQuestion] Failed to parse stored side questions:', err)
    return { questionsBySession: {}, currentIndexBySession: {}, cardOpenBySession: {} }
  }
}

export function useSideQuestion(activeSessionId?: string | null) {
  // Load persistent store from localStorage (persists across F5 refresh)
  const [initialData] = useState(loadStoredData)
  const [questionsBySession, setQuestionsBySession] = useState<Record<string, SideQuestionItem[]>>(
    initialData.questionsBySession
  )
  const [currentIndexBySession, setCurrentIndexBySession] = useState<Record<string, number>>(
    initialData.currentIndexBySession
  )
  const [cardOpenBySession, setCardOpenBySession] = useState<Record<string, boolean>>(
    initialData.cardOpenBySession
  )
  const [sideQuestionModel, setSideQuestionModel] = useState<SideQuestionModelConfig>(() => {
    if (initialData.selectedModel && initialData.selectedModel.modelID) {
      const mId = initialData.selectedModel.modelID.toLowerCase()
      if (mId !== 'claude-opus-5-5' && !mId.includes('5-5') && !mId.includes('opus-5.5')) {
        return initialData.selectedModel
      }
    }
    return { providerID: 'obsidian', modelID: 'gpt-6.1-sol', name: 'gpt-6.1-sol' }
  })

  // Providers list for model dropdown
  const [providers, setProviders] = useState<ProviderInfo[]>([])

  useEffect(() => {
    let mounted = true
    api.getProviders().then((res) => {
      if (mounted && Array.isArray(res) && res.length > 0) {
        setProviders(res)
        // Self-heal: ensure selectedModel exists in active providers and is not obsolete
        setSideQuestionModel((curr) => {
          const mId = (curr?.modelID || '').toLowerCase()
          const isObsolete = mId === 'claude-opus-5-5' || mId.includes('5-5') || mId.includes('opus-5.5')
          const provider = res.find((p) => p.id === curr?.providerID)
          const modelExists = provider && provider.models && Boolean(provider.models[curr.modelID])

          if (!modelExists || isObsolete) {
            const obsidian = res.find((p) => p.id === 'obsidian')
            if (obsidian?.models && obsidian.models['gpt-6.1-sol']) {
              return {
                providerID: 'obsidian',
                modelID: 'gpt-6.1-sol',
                name: (obsidian.models['gpt-6.1-sol'] as any)?.name || 'gpt-6.1-sol',
              }
            }
            if (obsidian?.models && obsidian.models['grok-4.7']) {
              return {
                providerID: 'obsidian',
                modelID: 'grok-4.7',
                name: (obsidian.models['grok-4.7'] as any)?.name || 'grok-4.7',
              }
            }
            for (const p of res) {
              const keys = Object.keys(p.models || {})
              if (keys.length > 0) {
                const k = keys[0]
                return { providerID: p.id, modelID: k, name: (p.models[k] as any)?.name || k }
              }
            }
          }
          return curr
        })
      }
    }).catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  // Current active conversation scope
  const currentSessionKey = activeSessionId || '__draft__'

  // Keep a ref to avoid stale closures in callbacks
  const questionsBySessionRef = useRef(questionsBySession)
  questionsBySessionRef.current = questionsBySession

  const sideQuestionModelRef = useRef(sideQuestionModel)
  sideQuestionModelRef.current = sideQuestionModel

  // Active session questions & state
  const sideQuestions = questionsBySession[currentSessionKey] || []
  const rawIndex = currentIndexBySession[currentSessionKey] ?? 0
  const currentIndex = sideQuestions.length > 0 ? Math.min(Math.max(0, rawIndex), sideQuestions.length - 1) : 0
  const isCardOpen = Boolean(cardOpenBySession[currentSessionKey] && sideQuestions.length > 0)
  const currentSideQuestion =
    sideQuestions.length > 0 && currentIndex < sideQuestions.length ? sideQuestions[currentIndex] : null

  // Persist store to localStorage on every state change (F5 safe)
  useEffect(() => {
    try {
      const dataToSave: StoredSideQuestionData = {
        questionsBySession,
        currentIndexBySession,
        cardOpenBySession,
        selectedModel: sideQuestionModel,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave))
    } catch (err) {
      console.warn('[useSideQuestion] Failed to save side questions store:', err)
    }
  }, [questionsBySession, currentIndexBySession, cardOpenBySession, sideQuestionModel])

  // Map of tracked shadow session IDs to their parent conversation and item ID
  const shadowSessionMapRef = useRef<Map<string, ShadowSessionMeta>>(new Map())
  // Track known user message IDs so user prompt parts are NEVER mistaken for assistant answers
  const userMessageIdsRef = useRef<Set<string>>(new Set())
  const firstAnswerTimeMapRef = useRef<Map<string, number>>(new Map())

  // Clean up shadow session on daemon
  const cleanupShadowSession = useCallback(async (sessionId: string) => {
    try {
      await api.abortSession(sessionId).catch(() => {})
      await api.deleteSession(sessionId).catch(() => {})
    } catch {
      // Ignore cleanup errors on daemon
    }
  }, [])

  const closeCard = useCallback(() => {
    setCardOpenBySession((prev) => ({
      ...prev,
      [currentSessionKey]: false,
    }))
  }, [currentSessionKey])

  const openCard = useCallback(() => {
    setCardOpenBySession((prev) => ({
      ...prev,
      [currentSessionKey]: true,
    }))
  }, [currentSessionKey])

  const toggleCard = useCallback(() => {
    setCardOpenBySession((prev) => ({
      ...prev,
      [currentSessionKey]: !prev[currentSessionKey],
    }))
  }, [currentSessionKey])

  const goToPrev = useCallback(() => {
    setCurrentIndexBySession((prev) => ({
      ...prev,
      [currentSessionKey]: Math.max(0, (prev[currentSessionKey] ?? 0) - 1),
    }))
  }, [currentSessionKey])

  const goToNext = useCallback(() => {
    setCurrentIndexBySession((prev) => {
      const currentList = questionsBySessionRef.current[currentSessionKey] || []
      const cur = prev[currentSessionKey] ?? 0
      return {
        ...prev,
        [currentSessionKey]: Math.min(Math.max(0, currentList.length - 1), cur + 1),
      }
    })
  }, [currentSessionKey])

  const deleteSideQuestion = useCallback(
    (indexToDelete?: number) => {
      const currentList = questionsBySessionRef.current[currentSessionKey] || []
      const curIndex = currentIndexBySession[currentSessionKey] ?? 0
      const targetIdx = indexToDelete !== undefined ? indexToDelete : curIndex
      if (targetIdx < 0 || targetIdx >= currentList.length) return

      const target = currentList[targetIdx]
      if (target.sessionID) {
        void cleanupShadowSession(target.sessionID)
        shadowSessionMapRef.current.delete(target.sessionID)
      }

      const nextList = currentList.filter((_, idx) => idx !== targetIdx)

      setQuestionsBySession((prev) => ({
        ...prev,
        [currentSessionKey]: nextList,
      }))

      if (nextList.length === 0) {
        setCardOpenBySession((prev) => ({
          ...prev,
          [currentSessionKey]: false,
        }))
        setCurrentIndexBySession((prev) => ({
          ...prev,
          [currentSessionKey]: 0,
        }))
      } else {
        setCurrentIndexBySession((prev) => ({
          ...prev,
          [currentSessionKey]: Math.min(targetIdx, nextList.length - 1),
        }))
      }
    },
    [currentSessionKey, currentIndexBySession, cleanupShadowSession]
  )

  const clearSessionSideQuestions = useCallback(
    (sessionId: string) => {
      const list = questionsBySessionRef.current[sessionId]
      if (list) {
        for (const item of list) {
          if (item.sessionID) {
            void cleanupShadowSession(item.sessionID)
            shadowSessionMapRef.current.delete(item.sessionID)
          }
        }
      }
      setQuestionsBySession((prev) => {
        const next = { ...prev }
        delete next[sessionId]
        return next
      })
      setCurrentIndexBySession((prev) => {
        const next = { ...prev }
        delete next[sessionId]
        return next
      })
      setCardOpenBySession((prev) => {
        const next = { ...prev }
        delete next[sessionId]
        return next
      })
    },
    [cleanupShadowSession]
  )

  const migrateDraftSideQuestions = useCallback((targetSessionId: string) => {
    if (!targetSessionId || targetSessionId === '__draft__') return
    const draftList = questionsBySessionRef.current['__draft__']
    if (!draftList || draftList.length === 0) return

    for (const item of draftList) {
      if (item.sessionID) {
        shadowSessionMapRef.current.set(item.sessionID, {
          parentKey: targetSessionId,
          itemId: item.id,
        })
      }
    }

    setQuestionsBySession((prev) => {
      const draftItems = prev['__draft__'] || []
      if (draftItems.length === 0) return prev
      const existingTarget = prev[targetSessionId] || []
      const next = { ...prev }
      delete next['__draft__']
      next[targetSessionId] = [
        ...existingTarget,
        ...draftItems.map((it) => ({ ...it, parentSessionId: targetSessionId })),
      ]
      return next
    })

    setCurrentIndexBySession((prev) => {
      const next = { ...prev }
      const draftIdx = prev['__draft__'] ?? 0
      delete next['__draft__']
      next[targetSessionId] = draftIdx
      return next
    })

    setCardOpenBySession((prev) => {
      const next = { ...prev }
      const draftOpen = prev['__draft__'] ?? false
      delete next['__draft__']
      next[targetSessionId] = draftOpen
      return next
    })
  }, [])

  const askSideQuestion = useCallback(
    async (
      question: string,
      contextMessages?: Message[],
      directory?: string,
      modelOverride?: SideQuestionModelConfig,
      targetSessionId?: string | null
    ) => {
      const parentKey = targetSessionId !== undefined ? (targetSessionId || '__draft__') : currentSessionKey
      const now = Date.now()
      const newItemId = `side_${now}`
      const rawModel = modelOverride || sideQuestionModelRef.current
      const isObsoleteModel =
        rawModel &&
        (rawModel.modelID === 'claude-opus-5-5' ||
          rawModel.modelID.includes('5-5') ||
          rawModel.modelID.includes('opus-5.5'))
      const activeModel: SideQuestionModelConfig = isObsoleteModel
        ? { providerID: 'obsidian', modelID: 'gpt-6.1-sol', name: 'gpt-6.1-sol' }
        : rawModel

      const newItem: SideQuestionItem = {
        id: newItemId,
        sessionID: '',
        parentSessionId: parentKey,
        question,
        status: 'generating',
        thought: '',
        answer: '',
        startTime: now,
      }

      setQuestionsBySession((prev) => {
        const existing = prev[parentKey] || []
        return {
          ...prev,
          [parentKey]: [...existing, newItem],
        }
      })

      setCurrentIndexBySession((prev) => {
        const existing = questionsBySessionRef.current[parentKey] || []
        return {
          ...prev,
          [parentKey]: existing.length,
        }
      })

      setCardOpenBySession((prev) => ({
        ...prev,
        [parentKey]: true,
      }))

      try {
        // Create an ephemeral shadow session with [Side Question] title prefix
        const shadowSession: Session = await api.createSession({
          title: `[Side Question] ${question.slice(0, 30)}`,
          directory: directory || '/home/developer/projects/APISpace',
          model: activeModel ? { id: activeModel.modelID, providerID: activeModel.providerID } : undefined,
        })

        const sid = shadowSession.id
        shadowSessionMapRef.current.set(sid, { parentKey, itemId: newItemId })

        setQuestionsBySession((prev) => {
          const list = prev[parentKey] || []
          return {
            ...prev,
            [parentKey]: list.map((item) => (item.id === newItemId ? { ...item, sessionID: sid } : item)),
          }
        })

        // Format read-only context from the active session
        let contextBlock = ''
        if (contextMessages && contextMessages.length > 0) {
          const recent = contextMessages.slice(-4)
          const textParts = recent
            .map((m) => {
              const role = m.info.role === 'user' ? 'User' : 'Assistant'
              const txt = m.parts
                .filter((p) => p.type === 'text')
                .map((p) => (p as any).text || '')
                .join('\n')
                .trim()
              return txt ? `${role}: ${txt.slice(0, 500)}` : ''
            })
            .filter(Boolean)

          if (textParts.length > 0) {
            contextBlock = `\n\n[Active Conversation Context (Read-only reference)]:\n${textParts.join(
              '\n\n'
            )}\n[End of Context]\n`
          }
        }

        const promptText = `[Side Question - Answer concisely and directly to help the user without interrupting their main task]${contextBlock}\nQuestion: ${question}`

        // Send prompt into the shadow session
        await api.sendPrompt(sid, promptText, {
          model: activeModel ? { providerID: activeModel.providerID, modelID: activeModel.modelID } : undefined,
        })
      } catch (err: any) {
        console.error('[SideQuestion] Failed to initialize shadow session:', err)
        setQuestionsBySession((prev) => {
          const list = prev[parentKey] || []
          return {
            ...prev,
            [parentKey]: list.map((item) =>
              item.id === newItemId
                ? {
                    ...item,
                    status: 'error',
                    error: err?.message || 'Failed to start side question query',
                  }
                : item
            ),
          }
        })
      }
    },
    [currentSessionKey]
  )

  // SSE event subscriptions to stream thought and answer into the specific side question
  useEffect(() => {
    // 1. Capture user message IDs to prevent user prompt parts from leaking into answer
    const unsubMsg = sseManager.onMessageUpdated((data) => {
      if (data.info?.role === 'user') {
        userMessageIdsRef.current.add(data.info.id)
      }
    })

    // 2. Stream deltas (reasoning and assistant answer text)
    const unsubDelta = sseManager.onPartDelta((data) => {
      const targetMeta = shadowSessionMapRef.current.get(data.sessionID)
      if (!targetMeta) return

      // INVARIANT: Never process parts from the user's prompt!
      if (userMessageIdsRef.current.has(data.messageID)) return

      const { parentKey, itemId } = targetMeta

      setQuestionsBySession((prev) => {
        const sessionList = prev[parentKey]
        if (!sessionList) return prev
        const itemIdx = sessionList.findIndex((it) => it.id === itemId)
        if (itemIdx === -1) return prev

        const item = sessionList[itemIdx]
        const isReasoning = data.field === 'reasoning'

        let updatedItem: SideQuestionItem
        if (isReasoning) {
          updatedItem = {
            ...item,
            thought: item.thought + data.delta,
          }
        } else {
          if (!firstAnswerTimeMapRef.current.has(item.id) && item.thought.length > 0) {
            firstAnswerTimeMapRef.current.set(item.id, Date.now())
          }
          updatedItem = {
            ...item,
            answer: item.answer + data.delta,
          }
        }

        const nextList = [...sessionList]
        nextList[itemIdx] = updatedItem
        return { ...prev, [parentKey]: nextList }
      })
    })

    // 3. Process authoritative part updates
    const unsubUpdated = sseManager.onPartUpdated((data) => {
      const targetMeta = shadowSessionMapRef.current.get(data.sessionID)
      if (!targetMeta) return

      const part = data.part
      if (!part) return

      // INVARIANT: Never process parts from the user's prompt!
      if (part.messageID && userMessageIdsRef.current.has(part.messageID)) return

      const { parentKey, itemId } = targetMeta

      setQuestionsBySession((prev) => {
        const sessionList = prev[parentKey]
        if (!sessionList) return prev
        const itemIdx = sessionList.findIndex((it) => it.id === itemId)
        if (itemIdx === -1) return prev

        const item = sessionList[itemIdx]
        let updatedItem = item

        if (part.type === 'reasoning') {
          const reasoningText = (part as any).text || ''
          if (reasoningText.length >= item.thought.length) {
            updatedItem = { ...item, thought: reasoningText }
          }
        } else if (part.type === 'text') {
          const answerText = (part as any).text || ''
          if (answerText.length >= item.answer.length) {
            updatedItem = { ...item, answer: answerText }
          }
        }

        if (updatedItem === item) return prev

        const nextList = [...sessionList]
        nextList[itemIdx] = updatedItem
        return { ...prev, [parentKey]: nextList }
      })
    })

    // 4. Mark completion on idle
    const handleTurnEnd = (sessionId: string) => {
      const targetMeta = shadowSessionMapRef.current.get(sessionId)
      if (!targetMeta) return

      const { parentKey, itemId } = targetMeta

      setQuestionsBySession((prev) => {
        const sessionList = prev[parentKey]
        if (!sessionList) return prev
        const itemIdx = sessionList.findIndex((it) => it.id === itemId)
        if (itemIdx === -1) return prev

        const item = sessionList[itemIdx]
        if (item.status === 'done') return prev

        const firstAnswerTime = firstAnswerTimeMapRef.current.get(item.id)
        const thoughtDur = firstAnswerTime
          ? Math.max(1, Math.round((firstAnswerTime - item.startTime) / 1000))
          : Math.max(1, Math.round((Date.now() - item.startTime) / 1000))

        const updatedItem: SideQuestionItem = {
          ...item,
          status: 'done',
          thoughtDuration: item.thought ? thoughtDur : undefined,
        }

        const nextList = [...sessionList]
        nextList[itemIdx] = updatedItem
        return { ...prev, [parentKey]: nextList }
      })
    }

    const unsubIdle = sseManager.onSessionIdle((data) => {
      handleTurnEnd(data.sessionID)
    })

    const unsubStatus = sseManager.onSessionStatus((data) => {
      if (data.status?.type === 'idle') {
        handleTurnEnd(data.sessionID)
      }
    })

    const unsubError = sseManager.onSessionError((data) => {
      const targetMeta = shadowSessionMapRef.current.get(data.sessionID)
      if (!targetMeta) return

      const { parentKey, itemId } = targetMeta

      setQuestionsBySession((prev) => {
        const sessionList = prev[parentKey]
        if (!sessionList) return prev
        const itemIdx = sessionList.findIndex((it) => it.id === itemId)
        if (itemIdx === -1) return prev

        const item = sessionList[itemIdx]
        const updatedItem: SideQuestionItem = {
          ...item,
          status: 'error',
          error: typeof data.error === 'string' ? data.error : data.error?.message || 'Query error',
        }

        const nextList = [...sessionList]
        nextList[itemIdx] = updatedItem
        return { ...prev, [parentKey]: nextList }
      })
    })

    return () => {
      unsubMsg()
      unsubDelta()
      unsubUpdated()
      unsubIdle()
      unsubStatus()
      unsubError()
    }
  }, [])

  return {
    sideQuestions,
    currentSideQuestion,
    currentIndex,
    totalCount: sideQuestions.length,
    isCardOpen,
    askSideQuestion,
    closeCard,
    openCard,
    toggleCard,
    goToPrev,
    goToNext,
    deleteSideQuestion,
    clearSessionSideQuestions,
    migrateDraftSideQuestions,
    sideQuestionModel,
    setSideQuestionModel,
    providers,
  }
}
