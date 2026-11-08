import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  Message,
  TextPart,
  FilePart,
  SessionStatusPayload,
  TodoItem,
  Session,
  PromptAttachment,
} from '../types/opencode'
import {
  api,
  normalizeMessageInfo,
  normalizeMessagePart,
  extractRelayErrorMessage,
  isAbortError,
  isExplicitUserAbortError,
} from '../services/api'
import { sseManager } from '../services/sse'
import {
  classifyEmptyIdleFuse,
  decideEmptyTurnAutoRetry,
  EMPTY_RESPONSE_MESSAGE,
  inspectCurrentTurnRecovery,
  isFatalNonRetryableError,
  isGoOnUserMessage,
  MAX_AUTO_RECOVERY_ATTEMPTS,
  REPETITION_LOOP_ERROR_MESSAGE,
  REPETITION_LOOP_ERROR_NAME,
  SYSTEM_ABORT_MESSAGE,
} from './empty-idle-fuse'
import { sanitizeMessageRepetition } from '../utils/repetition-fuse'
import { maybeCommitGitCheckpoint } from '../utils/maybe-git-checkpoint'
import type { RevertMode as EngineRevertMode } from '../utils/revert-engine'
import {
  buildPromptParts,
  buildOptimisticMessage,
  reconcileHistoryWithOptimistic,
} from '../utils/prompt-parts'
import { partitionAssistantTurn } from '../utils/worked-summary'
import { isRunningStatus } from '../utils/session-run-state'
import { decideGoOn, GO_ON_SILENCE_MS, GO_ON_TEXT, type GoOnActivity } from './go-on-fuse'
import {
  applyMessageUpdatedToMessages,
  applyPartDeltaToMessages,
  applyPartUpdatedToMessages,
  collectRetryDeletionIds,
  messageProgressSignature,
  preserveInFlightAssistantError,
  stampRelayErrorOnLastAssistant,
  stampRepetitionLoopOnMessage,
  stripAssistantErrors,
} from './chat-stream-reducers'
import { useChatRevert } from './useChatRevert'

export type { PromptAttachment }

export type RevertMode = EngineRevertMode

export interface AutoRecoveryState {
  attempt: number
  max: number
  mode: 'retry' | 'go_on'
}

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
  const [autoRecoveryState, setAutoRecoveryState] = useState<AutoRecoveryState | null>(null)
  const [isErrorTerminal, setIsErrorTerminal] = useState(false)
  /** Bumps on every transition into idle so the queue can drain even if status was already idle. */
  const [turnEpoch, setTurnEpoch] = useState(0)
  /** Why the latest turn ended. 'user' is Stop; 'error' pauses the queue; null is a clean finish. */
  const [turnEnd, setTurnEnd] = useState<'clean' | 'error' | 'user' | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isReconcilingIdle, setIsReconcilingIdle] = useState(false)

  // Use a ref to access latest messages in SSE callbacks without stale closures
  const messagesRef = useRef<Message[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const pendingOptimisticIdRef = useRef<string | null>(null)
  const userAbortedRef = useRef(false)
  const transitioningSessionIdRef = useRef<string | null>(null)
  const currentSessionIdRef = useRef<string | null>(sessionId)
  const sessionBusyRef = useRef(false)
  const isSendingRef = useRef(false)
  const lastSendTimestampRef = useRef(0)
  const statusEpochRef = useRef(0)
  const autoRetriedTurnKeyRef = useRef<string | null>(null)
  const autoRecoveryCountRef = useRef(0)
  const autoRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryRef = useRef<() => Promise<void>>(async () => {})
  const repetitionArmedRef = useRef(false)
  const lastActivityAtRef = useRef(0)
  const stallProbeCountRef = useRef(0)
  const goOnSentRef = useRef(0)
  const goOnFlightRef = useRef(false)
  const isErrorTerminalRef = useRef(false)
  const todosRef = useRef<TodoItem[]>([])
  const sessionStatusRef = useRef<SessionStatusPayload>({ type: 'idle' })
  const runKnownRef = useRef(false)
  const revertingRef = useRef(false)
  const reconcilingIdleInFlightRef = useRef<string | null>(null)
  const reconcilingOptionsRef = useRef<{
    abortedByUser?: boolean
    markCleanWhenWasBusy?: boolean
    commitCheckpointOnCleanAssistant?: boolean
    fallbackMessages?: Message[]
    fallbackFuseKind?: string
  }>({})
  const lastCleanTurnMsgIdRef = useRef<string | null>(null)
  const sendPromptRef = useRef<
    (
      text: string,
      options?: {
        agent?: string
        model?: { providerID: string; modelID: string }
        isAutoRetry?: boolean
      }
    ) => Promise<boolean>
  >(async () => false)

  const clearAutoRecoveryTimer = useCallback(() => {
    if (autoRecoveryTimerRef.current) {
      clearTimeout(autoRecoveryTimerRef.current)
      autoRecoveryTimerRef.current = null
    }
    goOnFlightRef.current = false
  }, [])

  const noteTurnEnd = useCallback((kind: 'clean' | 'error' | 'user') => {
    sessionBusyRef.current = false
    setTurnEnd(kind)
    setTurnEpoch((n) => n + 1)
  }, [])

  const commitSessionStatus = useCallback((next: SessionStatusPayload, known = true) => {
    statusEpochRef.current += 1
    sessionBusyRef.current = isRunningStatus(next)
    sessionStatusRef.current = next
    setSessionStatus(next)
    if (known) {
      runKnownRef.current = true
      setRunKnown(true)
    }
  }, [])

  const commitTerminalError = useCallback((value: boolean) => {
    isErrorTerminalRef.current = value
    setIsErrorTerminal(value)
  }, [])

  const noteActivity = useCallback((kind: GoOnActivity) => {
    lastActivityAtRef.current = Date.now()
    stallProbeCountRef.current = 0
    if (kind === 'delta' || kind === 'part') {
      setAutoRecoveryState(null)
    }
  }, [])

  const maybeSendGoOn = useCallback(
    (rawErrorInput?: unknown): boolean | 'terminal' => {
      if (goOnFlightRef.current) return true
      if (userAbortedRef.current || repetitionArmedRef.current || revertingRef.current) return false

      const activeId = currentSessionIdRef.current
      if (!activeId || activeId === '__draft__') return false

      const currentMsgs = messagesRef.current
      const turn = inspectCurrentTurnRecovery(currentMsgs, GO_ON_TEXT)
      if (!turn.rootUserMessage && currentMsgs.length === 0) return false

      const usedAttempts = Math.max(
        autoRecoveryCountRef.current,
        goOnSentRef.current,
        turn.goOnCount
      )

      const lastMsg = currentMsgs[currentMsgs.length - 1]
      const rawErr = rawErrorInput ?? turn.lastAssistantMessage?.info.error
      if (rawErr && isExplicitUserAbortError(rawErr)) {
        return false
      }

      if (turn.lastAssistantMessage && sanitizeMessageRepetition(turn.lastAssistantMessage).hasLoop) {
        commitTerminalError(true)
        setAutoRecoveryState(null)
        setError(REPETITION_LOOP_ERROR_MESSAGE)
        noteTurnEnd('error')
        return 'terminal'
      }

      if (rawErr && isFatalNonRetryableError(rawErr)) {
        const fatalText = extractRelayErrorMessage(rawErr as any) || String(rawErr)
        commitTerminalError(true)
        setAutoRecoveryState(null)
        setError(fatalText)
        noteTurnEnd('error')
        return 'terminal'
      }

      if (
        !rawErrorInput &&
        lastMsg?.info.role === 'user' &&
        Date.now() - lastSendTimestampRef.current < 2500
      ) {
        return false
      }

      // Branch A: Completely empty turn (0 characters, 0 tool calls emitted in this turn)
      if (!turn.turnHasAnyOutput) {
        const lastAssistant = turn.lastAssistantMessage
        const rawCreated = Number(lastAssistant?.info.time?.created || 0)
        const createdMs = rawCreated > 0 && rawCreated < 1e11 ? rawCreated * 1000 : rawCreated
        const isFreshUnclosedShell =
          Boolean(lastAssistant) &&
          !lastAssistant?.info.finish &&
          !lastAssistant?.info.time?.completed &&
          !rawErr &&
          createdMs > 0 &&
          Date.now() - createdMs < 15_000
        if (isFreshUnclosedShell) {
          return false
        }

        const fuse = classifyEmptyIdleFuse({
          lastMessage: turn.lastAssistantMessage,
          userAborted: userAbortedRef.current,
        })
        const isEmptyFailure =
          fuse.kind === 'empty_response' ||
          fuse.kind === 'system_abort' ||
          (Boolean(rawErr) && !isExplicitUserAbortError(rawErr)) ||
          (Boolean(turn.rootUserMessage) && !turn.lastAssistantMessage && !sessionBusyRef.current)

        if (!isEmptyFailure) return false

        const retryDecision = decideEmptyTurnAutoRetry({
          fuseKind: fuse.kind === 'system_abort' ? 'system_abort' : 'empty_response',
          turnKey: turn.turnKey,
          attemptCount: usedAttempts,
          maxAttempts: MAX_AUTO_RECOVERY_ATTEMPTS,
          assistantHasError: Boolean(rawErr),
          errorText: rawErr,
          turnHasAnyOutput: false,
        })

        if (retryDecision.retry) {
          const nextAttempt = usedAttempts + 1
          autoRecoveryCountRef.current = nextAttempt
          goOnSentRef.current = nextAttempt
          autoRetriedTurnKeyRef.current = turn.turnKey
          goOnFlightRef.current = true
          setError(null)
          commitTerminalError(false)
          setAutoRecoveryState({
            attempt: nextAttempt,
            max: MAX_AUTO_RECOVERY_ATTEMPTS,
            mode: 'retry',
          })

          if (turn.lastAssistantMessage?.info.error) {
            const cleaned = stripAssistantErrors(messagesRef.current, turn.lastAssistantMessage.info.id)
            messagesRef.current = cleaned
            setMessages(cleaned)
          }

          autoRecoveryTimerRef.current = setTimeout(() => {
            autoRecoveryTimerRef.current = null
            if (
              currentSessionIdRef.current !== activeId ||
              userAbortedRef.current ||
              revertingRef.current ||
              sessionBusyRef.current ||
              isSendingRef.current
            ) {
              goOnFlightRef.current = false
              return
            }
            const freshTurn = inspectCurrentTurnRecovery(messagesRef.current, GO_ON_TEXT)
            if (freshTurn.turnHasAnyOutput) {
              const last = freshTurn.lastAssistantMessage
              const targetModel = freshTurn.rootUserMessage?.info.model || last?.info.model
              void sendPromptRef
                .current(GO_ON_TEXT, {
                  agent: last?.info.agent || freshTurn.rootUserMessage?.info.agent,
                  model: targetModel
                    ? { providerID: targetModel.providerID, modelID: targetModel.modelID }
                    : undefined,
                })
                .finally(() => {
                  goOnFlightRef.current = false
                })
              return
            }
            void retryRef.current().finally(() => {
              goOnFlightRef.current = false
            })
          }, 1500)
          return true
        }

        const errMsg =
          (rawErr ? extractRelayErrorMessage(rawErr as any) : null) ||
          (fuse.kind === 'system_abort' ? SYSTEM_ABORT_MESSAGE : EMPTY_RESPONSE_MESSAGE)
        commitTerminalError(true)
        setAutoRecoveryState(null)
        setError(errMsg)
        noteTurnEnd('error')
        return 'terminal'
      }

      // Branch B: Turn already has output (>= 1 char or tool call) -> NEVER delete; auto-send 'go on'
      const verdict = decideGoOn({
        lastActivityAt: lastActivityAtRef.current,
        now: Date.now(),
        runKnown: true,
        daemonIdle: !isRunningStatus(sessionStatusRef.current),
        userAborted: userAbortedRef.current,
        sentThisTurn: usedAttempts,
        messages: currentMsgs,
        todos: todosRef.current,
      })

      const needsGoOn =
        verdict.act === 'send' ||
        (Boolean(rawErr) && !isExplicitUserAbortError(rawErr) && usedAttempts < MAX_AUTO_RECOVERY_ATTEMPTS)

      if (needsGoOn) {
        const nextAttempt = usedAttempts + 1
        autoRecoveryCountRef.current = nextAttempt
        goOnSentRef.current = nextAttempt
        goOnFlightRef.current = true
        setError(null)
        commitTerminalError(false)
        setAutoRecoveryState({
          attempt: nextAttempt,
          max: MAX_AUTO_RECOVERY_ATTEMPTS,
          mode: 'go_on',
        })

        setMessages((prev) => stripAssistantErrors(prev))

        autoRecoveryTimerRef.current = setTimeout(() => {
          autoRecoveryTimerRef.current = null
          if (
            currentSessionIdRef.current !== activeId ||
            userAbortedRef.current ||
            revertingRef.current ||
            sessionBusyRef.current ||
            isSendingRef.current
          ) {
            goOnFlightRef.current = false
            return
          }
          const latest = messagesRef.current[messagesRef.current.length - 1]
          if (latest && isGoOnUserMessage(latest, GO_ON_TEXT)) {
            goOnFlightRef.current = false
            return
          }
          const freshTurn = inspectCurrentTurnRecovery(messagesRef.current, GO_ON_TEXT)
          const last = freshTurn.lastAssistantMessage
          const recheck = decideGoOn({
            lastActivityAt: lastActivityAtRef.current,
            now: Date.now(),
            runKnown: true,
            daemonIdle: !isRunningStatus(sessionStatusRef.current),
            userAborted: userAbortedRef.current,
            sentThisTurn: usedAttempts,
            messages: messagesRef.current,
            todos: todosRef.current,
          })
          const stillNeedsGoOn =
            recheck.act === 'send' ||
            (Boolean(rawErr) &&
              !isExplicitUserAbortError(rawErr) &&
              (!last || last.info.finish !== 'stop' || Boolean(last.info.error)))
          if (!stillNeedsGoOn) {
            goOnFlightRef.current = false
            setAutoRecoveryState(null)
            return
          }
          messagesRef.current = stripAssistantErrors(messagesRef.current)
          const targetModel = freshTurn.rootUserMessage?.info.model || last?.info.model
          void sendPromptRef
            .current(GO_ON_TEXT, {
              agent: last?.info.agent || freshTurn.rootUserMessage?.info.agent,
              model: targetModel
                ? { providerID: targetModel.providerID, modelID: targetModel.modelID }
                : undefined,
            })
            .finally(() => {
              goOnFlightRef.current = false
            })
        }, 1500)
        return true
      }

      if (
        verdict.reason === 'cap' ||
        (Boolean(rawErr) && !isExplicitUserAbortError(rawErr) && usedAttempts >= MAX_AUTO_RECOVERY_ATTEMPTS)
      ) {
        const rawText = rawErr ? extractRelayErrorMessage(rawErr as any) : null
        const capMsg = rawText
          ? `已自动发送 go on / 重试 ${MAX_AUTO_RECOVERY_ATTEMPTS} 次仍失败：${rawText}`
          : SYSTEM_ABORT_MESSAGE
        commitTerminalError(true)
        setAutoRecoveryState(null)
        setError(capMsg)
        noteTurnEnd('error')
        return 'terminal'
      }

      setAutoRecoveryState(null)
      commitTerminalError(false)
      setError(null)
      return false
    },
    [noteTurnEnd, commitTerminalError]
  )

  const finalizeCleanIdleTurn = useCallback(
    (
      activeId: string,
      targetMsgs: Message[],
      mergedOpts: {
        commitCheckpointOnCleanAssistant?: boolean
        markCleanWhenWasBusy?: boolean
      },
      precomputedFuseKind?: string
    ) => {
      const latest = targetMsgs[targetMsgs.length - 1]
      const turnMsgId = latest?.info.id || '__empty__'
      if (mergedOpts.commitCheckpointOnCleanAssistant) {
        const fuseKind =
          precomputedFuseKind ?? classifyEmptyIdleFuse({ lastMessage: latest, userAborted: false }).kind
        if (fuseKind === 'none' && latest?.info.role === 'assistant' && !latest.info.error) {
          if (lastCleanTurnMsgIdRef.current !== turnMsgId) {
            lastCleanTurnMsgIdRef.current = turnMsgId
            void maybeCommitGitCheckpoint(activeId, targetMsgs)
            noteTurnEnd('clean')
          }
        }
      } else if (mergedOpts.markCleanWhenWasBusy) {
        if (lastCleanTurnMsgIdRef.current !== turnMsgId) {
          lastCleanTurnMsgIdRef.current = turnMsgId
          noteTurnEnd('clean')
        }
      }
    },
    [noteTurnEnd]
  )

  const reconcileIdleHistory = useCallback(
    (
      activeId: string,
      options?: {
        abortedByUser?: boolean
        markCleanWhenWasBusy?: boolean
        commitCheckpointOnCleanAssistant?: boolean
        fallbackMessages?: Message[]
        fallbackFuseKind?: string
      }
    ) => {
      const prevOpts = reconcilingOptionsRef.current
      reconcilingOptionsRef.current = {
        abortedByUser: Boolean(prevOpts.abortedByUser || options?.abortedByUser),
        markCleanWhenWasBusy: Boolean(prevOpts.markCleanWhenWasBusy || options?.markCleanWhenWasBusy),
        commitCheckpointOnCleanAssistant: Boolean(
          prevOpts.commitCheckpointOnCleanAssistant || options?.commitCheckpointOnCleanAssistant
        ),
        fallbackMessages: options?.fallbackMessages || prevOpts.fallbackMessages,
        fallbackFuseKind: options?.fallbackFuseKind || prevOpts.fallbackFuseKind,
      }
      if (reconcilingIdleInFlightRef.current === activeId) {
        return
      }
      reconcilingIdleInFlightRef.current = activeId
      setIsReconcilingIdle(true)

      void api
        .getMessages(activeId, { fresh: true })
        .then((history) => {
          const mergedOpts = reconcilingOptionsRef.current
          if (currentSessionIdRef.current !== activeId) return
          const prevMsgs = messagesRef.current
          const reconciled = preserveInFlightAssistantError(
            reconcileHistoryWithOptimistic(history, prevMsgs),
            prevMsgs,
            goOnFlightRef.current
          )
          messagesRef.current = reconciled
          setMessages(reconciled)

          if (
            mergedOpts.abortedByUser ||
            userAbortedRef.current ||
            revertingRef.current ||
            isSendingRef.current ||
            sessionBusyRef.current
          ) {
            return
          }
          if (maybeSendGoOn() === false) {
            finalizeCleanIdleTurn(activeId, reconciled, mergedOpts)
          }
        })
        .catch((err) => {
          const mergedOpts = reconcilingOptionsRef.current
          console.warn('[useChatStream] Background history reconciliation on idle failed:', err)
          if (mergedOpts.abortedByUser || userAbortedRef.current || revertingRef.current) return
          if (maybeSendGoOn() === false) {
            const fallbackMsgs = mergedOpts.fallbackMessages || messagesRef.current
            finalizeCleanIdleTurn(activeId, fallbackMsgs, mergedOpts, mergedOpts.fallbackFuseKind)
          }
        })
        .finally(() => {
          if (reconcilingIdleInFlightRef.current === activeId) {
            reconcilingIdleInFlightRef.current = null
            reconcilingOptionsRef.current = {}
            setIsReconcilingIdle(false)
          }
        })
    },
    [maybeSendGoOn, finalizeCleanIdleTurn]
  )

  const stopRepetitionLoop = useCallback(
    (messageId: string) => {
      if (repetitionArmedRef.current) return
      repetitionArmedRef.current = true
      setError(REPETITION_LOOP_ERROR_MESSAGE)
      setMessages((prev) =>
        stampRepetitionLoopOnMessage(
          prev,
          messageId,
          REPETITION_LOOP_ERROR_NAME,
          REPETITION_LOOP_ERROR_MESSAGE,
          true
        )
      )
      noteTurnEnd('error')
      commitSessionStatus({ type: 'idle' })
      const id = currentSessionIdRef.current
      if (!id || id === '__draft__') return
      void api.abortSession(id).catch((err) => {
        console.error('Failed to abort repetition loop:', err)
      })
    },
    [noteTurnEnd, commitSessionStatus]
  )

  const loadSessionData = useCallback(
    async (id: string) => {
      if (currentSessionIdRef.current !== id) return
      const peeked = api.peekMessages(id)
      const statusEpoch = statusEpochRef.current
      const applySnapshot = (status: SessionStatusPayload | null) => {
        if (currentSessionIdRef.current !== id) return false
        if (statusEpochRef.current !== statusEpoch) return false
        if (!status) return false
        const isRecentSend = Date.now() - lastSendTimestampRef.current < 2500
        if (status.type === 'idle' && sessionBusyRef.current && isRecentSend) {
          setRunKnown(true)
          return false
        }
        commitSessionStatus(status)
        return true
      }
      const knownDir =
        sessionDir ||
        peeked?.[0]?.info.path?.root ||
        peeked?.[0]?.info.path?.cwd
      const statusPromise = api.getSessionStatus(id, knownDir).then((status) => {
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
          runKnownRef.current = true
          setRunKnown(true)
        }
        setMessages((prev) => {
          const next = reconcileHistoryWithOptimistic(history, prev)
          messagesRef.current = next
          return next
        })
        if (lastActivityAtRef.current === 0) {
          lastActivityAtRef.current = Date.now()
        }
        setLoadedSessionId(id)
        setLoading(false)
        const initialTodos = await todosPromise
        if (currentSessionIdRef.current !== id) return
        setTodos(initialTodos || [])
        todosRef.current = initialTodos || []
      } catch (err) {
        if (currentSessionIdRef.current !== id) return
        console.error('Failed to load session history:', err)
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (currentSessionIdRef.current === id) {
          setLoadedSessionId(id)
          setLoading(false)
          if (statusEpochRef.current === statusEpoch) {
            runKnownRef.current = true
            setRunKnown(true)
          }
        }
      }
    },
    [commitSessionStatus, sessionDir]
  )

  useEffect(() => {
    currentSessionIdRef.current = sessionId

    const isTransitioning = transitioningSessionIdRef.current === sessionId && Boolean(sessionId)
    if (isTransitioning) {
      transitioningSessionIdRef.current = null
    } else {
      clearAutoRecoveryTimer()
      commitSessionStatus({ type: 'idle' }, false)
      sessionBusyRef.current = false
      runKnownRef.current = false
      setRunKnown(false)
      setError(null)
      setAutoRecoveryState(null)
      commitTerminalError(false)
      setTurnEnd(null)
      userAbortedRef.current = false
      autoRecoveryCountRef.current = 0
      goOnSentRef.current = 0
      goOnFlightRef.current = false
      lastActivityAtRef.current = 0
      stallProbeCountRef.current = 0
      reconcilingIdleInFlightRef.current = null
      reconcilingOptionsRef.current = {}
      lastCleanTurnMsgIdRef.current = null
      setIsReconcilingIdle(false)
    }

    if (!sessionId || sessionId === '__draft__') {
      setMessages([])
      setTodos([])
      setLoading(false)
      setLoadedSessionId(sessionId)
      setRunKnown(true)
      return
    }

    if (!isTransitioning) {
      setLoading(true)
      setMessages([])
      setTodos([])
    }
    loadSessionData(sessionId)

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      const id = currentSessionIdRef.current
      if (!id || id === '__draft__') return
      statusEpochRef.current += 1
      sessionBusyRef.current = false
      runKnownRef.current = false
      setRunKnown(false)
      setError(null)
      void loadSessionData(id)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pageshow', onPageShow)
    }

    const unsubDelta = sseManager.onPartDelta((data) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return
      noteActivity('delta')

      const known = messagesRef.current.find((m) => m.info.id === data.messageID)
      const done = Boolean(known?.info.time.completed || known?.info.finish || known?.info.error)
      if (known && !done && !sessionBusyRef.current) {
        commitSessionStatus({ type: 'busy' })
      }

      setMessages((prev) => applyPartDeltaToMessages(prev, data, stopRepetitionLoop))
    })

    const unsubPartUpdated = sseManager.onPartUpdated((data) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return
      noteActivity('part')
      const cleanPart = normalizeMessagePart(data.part)
      console.warn('[CHAT_STREAM_DEBUG] ⚡ onPartUpdated received:', {
        partId: cleanPart.id,
        type: cleanPart.type,
        messageId: cleanPart.messageID,
      })

      setMessages((prev) =>
        applyPartUpdatedToMessages(
          prev,
          cleanPart,
          data.sessionID,
          pendingOptimisticIdRef.current,
          stopRepetitionLoop
        )
      )
    })

    const unsubMsgUpdated = sseManager.onMessageUpdated((data) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return
      noteActivity('message')
      const cleanInfo = normalizeMessageInfo(data.info)

      setMessages((prev) => applyMessageUpdatedToMessages(prev, cleanInfo, pendingOptimisticIdRef))
    })

    const unsubStatus = sseManager.onSessionStatus((data) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return
      if (data.status.type === 'idle' && isSendingRef.current) return
      const wasBusyOnStatus = sessionBusyRef.current
      noteActivity('status')

      if (
        data.status.type === 'retry' &&
        typeof data.status.attempt === 'number' &&
        data.status.attempt > MAX_AUTO_RECOVERY_ATTEMPTS
      ) {
        commitSessionStatus({ type: 'idle' })
        void api.abortSession(activeId).catch(() => {})
        const msg =
          data.status.message ||
          `中转通道连续重试超过 ${MAX_AUTO_RECOVERY_ATTEMPTS} 次仍失败，已停止重试`
        commitTerminalError(true)
        setAutoRecoveryState(null)
        setError(msg)
        noteTurnEnd('error')
        return
      }

      commitSessionStatus(data.status)
      if (data.status.type === 'idle') {
        if (userAbortedRef.current) {
          noteTurnEnd('user')
        }
        reconcileIdleHistory(activeId, { markCleanWhenWasBusy: wasBusyOnStatus })
      }
    })

    const unsubError = sseManager.onSessionError((data) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return
      noteActivity('error')
      commitSessionStatus({ type: 'idle' })

      if (userAbortedRef.current || isExplicitUserAbortError(data.error)) {
        clearAutoRecoveryTimer()
        setError(null)
        setAutoRecoveryState(null)
        commitTerminalError(false)
        noteTurnEnd('user')
        return
      }

      const errorMsg = extractRelayErrorMessage(data.error) || 'Session error occurred'
      if (isExplicitUserAbortError(errorMsg)) {
        clearAutoRecoveryTimer()
        setError(null)
        setAutoRecoveryState(null)
        commitTerminalError(false)
        noteTurnEnd('user')
        return
      }

      if (isAbortError(data.error) || isAbortError(errorMsg)) {
        if (goOnFlightRef.current) {
          return
        }
        reconcileIdleHistory(activeId, { markCleanWhenWasBusy: false })
        return
      }

      const relayError = {
        name: data.error?.name || 'SessionError',
        message: errorMsg,
        data: data.error?.data || {},
      }
      const stamped = stampRelayErrorOnLastAssistant(messagesRef.current, relayError)
      messagesRef.current = stamped
      setMessages(stamped)
      queueMicrotask(() => {
        maybeSendGoOn(relayError)
      })
    })

    const unsubIdle = sseManager.onSessionIdle((data) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return
      if (isSendingRef.current) return
      noteActivity('idle')
      commitSessionStatus({ type: 'idle' })

      const abortedByUser = userAbortedRef.current

      if (abortedByUser) {
        clearAutoRecoveryTimer()
        setAutoRecoveryState(null)
        commitTerminalError(false)
        setError(null)
        noteTurnEnd('user')
        return
      }

      const currentMsgs = messagesRef.current
      const lastMsg = currentMsgs[currentMsgs.length - 1]
      const fuse = classifyEmptyIdleFuse({
        lastMessage: lastMsg,
        userAborted: false,
      })

      if (fuse.kind === 'repetition_loop' && lastMsg) {
        commitTerminalError(true)
        setAutoRecoveryState(null)
        setError(fuse.message)
        noteTurnEnd('error')
        setMessages((prev) =>
          stampRepetitionLoopOnMessage(prev, lastMsg.info.id, fuse.errorName, fuse.message, false)
        )
        return
      }

      reconcileIdleHistory(activeId, {
        abortedByUser,
        commitCheckpointOnCleanAssistant: true,
        fallbackMessages: currentMsgs,
        fallbackFuseKind: fuse.kind,
      })
    })

    const unsubRemoved = sseManager.onMessageRemoved((data) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return
      setMessages((prev) => prev.filter((m) => m.info.id !== data.messageID))
    })

    const unsubTodo = sseManager.on('todo.updated', (data: any) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data?.sessionID === activeId && Array.isArray(data?.todos)) {
        todosRef.current = data.todos
        setTodos(data.todos)
      }
    })

    const silenceTimer = window.setInterval(() => {
      const activeId = currentSessionIdRef.current || sessionId
      if (!activeId || activeId === '__draft__') return
      if (
        goOnFlightRef.current ||
        userAbortedRef.current ||
        revertingRef.current ||
        isSendingRef.current ||
        isErrorTerminalRef.current ||
        !runKnownRef.current
      ) {
        return
      }
      const now = Date.now()
      const baseActivity = lastActivityAtRef.current || now
      if (lastActivityAtRef.current === 0) {
        lastActivityAtRef.current = now
      }
      const quietFor = now - baseActivity

      if (!isRunningStatus(sessionStatusRef.current)) {
        if (quietFor < 15_000) return
        const turn = inspectCurrentTurnRecovery(messagesRef.current, GO_ON_TEXT)
        if (!turn.rootUserMessage && messagesRef.current.length === 0) return
        const usedAttempts = Math.max(
          autoRecoveryCountRef.current,
          goOnSentRef.current,
          turn.goOnCount
        )
        if (usedAttempts >= MAX_AUTO_RECOVERY_ATTEMPTS) return
        const idleVerdict = decideGoOn({
          lastActivityAt: baseActivity,
          now,
          runKnown: true,
          daemonIdle: true,
          userAborted: userAbortedRef.current,
          sentThisTurn: usedAttempts,
          messages: messagesRef.current,
          todos: todosRef.current,
        })
        const needsEmptyRetry =
          !turn.turnHasAnyOutput &&
          Boolean(turn.rootUserMessage) &&
          classifyEmptyIdleFuse({
            lastMessage: turn.lastAssistantMessage,
            userAborted: userAbortedRef.current,
          }).kind !== 'none'
        if (idleVerdict.act === 'send' || needsEmptyRetry) {
          lastActivityAtRef.current = now
          reconcileIdleHistory(activeId, { markCleanWhenWasBusy: false })
        }
        return
      }

      if (quietFor < GO_ON_SILENCE_MS) return
      const askedAt = lastActivityAtRef.current
      const activeDir =
        sessionDir ||
        messagesRef.current[0]?.info.path?.root ||
        messagesRef.current[0]?.info.path?.cwd
      void Promise.all([
        api.getSessionStatus(activeId, activeDir),
        api.getMessages(activeId, { fresh: true }).catch(() => null),
      ]).then(([status, freshHistory]) => {
        if (!status || currentSessionIdRef.current !== activeId) return
        if (lastActivityAtRef.current !== askedAt) return
        commitSessionStatus(status)
        if (!isRunningStatus(status)) {
          stallProbeCountRef.current = 0
          reconcileIdleHistory(activeId, { markCleanWhenWasBusy: true })
          return
        }
        const prevSig = messageProgressSignature(messagesRef.current)
        const nextSig = freshHistory ? messageProgressSignature(freshHistory) : prevSig
        if (freshHistory && nextSig !== prevSig) {
          const reconciled = reconcileHistoryWithOptimistic(freshHistory, messagesRef.current)
          messagesRef.current = reconciled
          setMessages(reconciled)
          stallProbeCountRef.current = 0
          lastActivityAtRef.current = Date.now()
          return
        }
        const checkMsgs = freshHistory || messagesRef.current
        const lastMsg = checkMsgs[checkMsgs.length - 1]
        const toolRunning =
          lastMsg?.info.role === 'assistant' &&
          lastMsg.parts.some((p) => p.type === 'tool' && (p as any).state?.status === 'running')
        if (toolRunning || status.type === 'retry') {
          stallProbeCountRef.current = 0
          lastActivityAtRef.current = Date.now()
          return
        }
        stallProbeCountRef.current += 1
        if (stallProbeCountRef.current >= 2) {
          stallProbeCountRef.current = 0
          lastActivityAtRef.current = Date.now()
          void api
            .abortSession(activeId)
            .catch(() => {})
            .finally(() => {
              if (currentSessionIdRef.current !== activeId) return
              commitSessionStatus({ type: 'idle' })
              reconcileIdleHistory(activeId, { markCleanWhenWasBusy: true })
            })
          return
        }
        lastActivityAtRef.current = Date.now()
      })
    }, 5_000)

    return () => {
      clearAutoRecoveryTimer()
      if (typeof window !== 'undefined') {
        window.clearInterval(silenceTimer)
        window.removeEventListener('pageshow', onPageShow)
      } else {
        clearInterval(silenceTimer as any)
      }
      unsubDelta()
      unsubPartUpdated()
      unsubMsgUpdated()
      unsubStatus()
      unsubError()
      unsubIdle()
      unsubTodo()
      unsubRemoved()
    }
  }, [
    sessionId,
    sessionDir,
    loadSessionData,
    noteTurnEnd,
    commitSessionStatus,
    commitTerminalError,
    stopRepetitionLoop,
    noteActivity,
    maybeSendGoOn,
    reconcileIdleHistory,
    clearAutoRecoveryTimer,
  ])

  const sendPrompt = useCallback(
    async (
      text: string,
      options?: {
        agent?: string
        model?: { providerID: string; modelID: string }
        attachments?: PromptAttachment[]
        isAutoRetry?: boolean
      },
      targetSessionId?: string
    ) => {
      const effectiveSessionId = targetSessionId || sessionId
      const hasText = Boolean(text.trim())
      const hasAttachments = Boolean(options?.attachments && options.attachments.length > 0)
      if (!effectiveSessionId || (!hasText && !hasAttachments)) {
        return false
      }

      currentSessionIdRef.current = effectiveSessionId
      if (targetSessionId) {
        transitioningSessionIdRef.current = targetSessionId
      }

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
      repetitionArmedRef.current = false
      lastSendTimestampRef.current = Date.now()
      noteActivity('send')
      if (text.trim() !== GO_ON_TEXT && !options?.isAutoRetry) {
        clearAutoRecoveryTimer()
        autoRecoveryCountRef.current = 0
        goOnSentRef.current = 0
        setAutoRecoveryState(null)
        commitTerminalError(false)
      }
      commitSessionStatus({ type: 'busy' })
      setError(null)
      setTurnEnd(null)
      isSendingRef.current = true
      setIsSending(true)

      const apiParts = buildPromptParts(text, options?.attachments)

      try {
        await api.sendPrompt(effectiveSessionId, apiParts, {
          agent: options?.agent,
          model: options?.model,
          attachments: options?.attachments,
        })
        return true
      } catch (err) {
        console.error('Failed to send prompt:', err)
        setError(err instanceof Error ? err.message : String(err))
        commitSessionStatus({ type: 'idle' })
        noteTurnEnd('error')
        return false
      } finally {
        isSendingRef.current = false
        setIsSending(false)
      }
    },
    [sessionId, noteTurnEnd, commitSessionStatus, commitTerminalError, noteActivity, clearAutoRecoveryTimer]
  )

  useEffect(() => {
    sendPromptRef.current = sendPrompt
  }, [sendPrompt])

  const abort = useCallback(
    async (opts?: { preempt?: boolean }) => {
      if (!sessionId) return
      clearAutoRecoveryTimer()
      setAutoRecoveryState(null)
      commitTerminalError(false)
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
    },
    [sessionId, noteTurnEnd, commitSessionStatus, commitTerminalError, clearAutoRecoveryTimer]
  )

  const retry = useCallback(async () => {
    setError(null)
    commitTerminalError(false)
    if (!sessionId) return

    const msgs = messagesRef.current
    const turn = inspectCurrentTurnRecovery(msgs, GO_ON_TEXT)

    if (turn.turnHasAnyOutput) {
      const last = turn.lastAssistantMessage
      await sendPrompt(GO_ON_TEXT, {
        agent: last?.info.agent || turn.rootUserMessage?.info.agent,
        model: last?.info.model
          ? {
              providerID: last.info.model.providerID,
              modelID: last.info.model.modelID,
            }
          : undefined,
      })
      return
    }

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
    await api.abortSession(sessionId).catch(() => {})

    const freshHistory = await api.getMessages(sessionId, { fresh: true }).catch(() => null)
    const { assistantIdsToDelete, userIdsToDelete, allRemovedIds } = collectRetryDeletionIds(
      msgs,
      lastUserIndex,
      freshHistory
    )

    for (const aId of assistantIdsToDelete) {
      try {
        await api.deleteMessage(sessionId, aId)
      } catch (err) {
        console.warn(`[Retry] Failed to delete assistant message ${aId}:`, err)
      }
    }

    for (const uId of userIdsToDelete) {
      try {
        await api.deleteMessage(sessionId, uId)
      } catch (err) {
        console.warn(`[Retry] Failed to delete user message ${uId}:`, err)
      }
    }

    if (pendingOptimisticIdRef.current && allRemovedIds.has(pendingOptimisticIdRef.current)) {
      pendingOptimisticIdRef.current = null
    }

    setMessages((prev) => prev.filter((m) => !allRemovedIds.has(m.info.id)))

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
      isAutoRetry: true,
    })
  }, [sessionId, sendPrompt, loadSessionData, commitTerminalError])

  useEffect(() => {
    retryRef.current = retry
  }, [retry])

  const { reverting, revertToMessage, unrevert } = useChatRevert({
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
  })

  return {
    messages,
    loading: loading || Boolean(sessionId && sessionId !== '__draft__' && loadedSessionId !== sessionId),
    runKnown,
    sessionStatus,
    todos,
    error,
    autoRecoveryState,
    isErrorTerminal,
    turnEpoch,
    turnEnd,
    isSending,
    isReconcilingIdle,
    sendPrompt,
    abort,
    retry,
    revertToMessage,
    unrevert,
    reverting,
    reload: () => sessionId && loadSessionData(sessionId),
  }
}
