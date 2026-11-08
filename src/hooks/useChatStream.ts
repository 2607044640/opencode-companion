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
import { postExternalFileRollback } from '../services/host-api'
import { executeRevertWithTimeout, withRevertTimeout, type RevertMode as EngineRevertMode } from '../utils/revert-engine'
import {
  buildPromptParts,
  buildOptimisticMessage,
  reconcileHistoryWithOptimistic,
} from '../utils/prompt-parts'
import { partitionAssistantTurn } from '../utils/worked-summary'
import { isRunningStatus } from '../utils/session-run-state'
import { decideGoOn, GO_ON_SILENCE_MS, GO_ON_TEXT, type GoOnActivity } from './go-on-fuse'

import type {
  PromptAttachment,
} from '../types/opencode'

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

  // Track the ID of the pending optimistic user message so we can swap it with the
  // real backend message when SSE fires — prevents the "sent twice" duplicate bug.
  const pendingOptimisticIdRef = useRef<string | null>(null)
  const userAbortedRef = useRef(false)
  const transitioningSessionIdRef = useRef<string | null>(null)
  const currentSessionIdRef = useRef<string | null>(sessionId)
  const sessionBusyRef = useRef(false)
  const isSendingRef = useRef(false)
  const lastSendTimestampRef = useRef(0)
  /** Bumps on every status write so a late /session/status snapshot cannot clobber SSE, send, or abort. */
  const statusEpochRef = useRef(0)
  const autoRetriedTurnKeyRef = useRef<string | null>(null)
  const autoRecoveryCountRef = useRef(0)
  const autoRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryRef = useRef<() => Promise<void>>(async () => {})
  /** One abort per user send. A live copier must not keep the SSE socket open. */
  const repetitionArmedRef = useRef(false)
  /** Last SSE or local send. A few quiet seconds are not a dead relay. */
  const lastActivityAtRef = useRef(0)
  /** How many automatic "go on" nudges this user turn already spent. */
  const goOnSentRef = useRef(0)
  const goOnFlightRef = useRef(false)
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
    // Clean transitions are gated by callers checking wasBusy before commitSessionStatus
    sessionBusyRef.current = false
    setTurnEnd(kind)
    setTurnEpoch((n) => n + 1)
  }, [])

  const commitSessionStatus = useCallback((next: SessionStatusPayload, known = true) => {
    statusEpochRef.current += 1
    if (isRunningStatus(next)) {
      sessionBusyRef.current = true
    } else {
      sessionBusyRef.current = false
    }
    sessionStatusRef.current = next
    setSessionStatus(next)
    if (known) {
      runKnownRef.current = true
      setRunKnown(true)
    }
  }, [])

  const noteActivity = useCallback((kind: GoOnActivity) => {
    lastActivityAtRef.current = Date.now()
    if (kind === 'delta' || kind === 'part') {
      setAutoRecoveryState(null)
    }
  }, [])

  /**
   * Unified automatic recovery engine:
   * - If the turn has 0 output (`!turnHasAnyOutput`), automatically retries the turn (up to 5 times).
   * - If the turn already has output (`turnHasAnyOutput`), NEVER deletes messages; automatically sends `go on` (up to 5 times).
   * - Suppresses red error UI while auto-recovery is active (< 5 attempts).
   * - Only surfaces a terminal error after 5 failed attempts or on a fatal non-retryable error.
   * Returns `true` if an automatic recovery action was scheduled or is in flight.
   */
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
      if (rawErr && isAbortError(rawErr)) {
        return false
      }

      // 1. Check repetition loop first
      if (turn.lastAssistantMessage && sanitizeMessageRepetition(turn.lastAssistantMessage).hasLoop) {
        setIsErrorTerminal(true)
        setAutoRecoveryState(null)
        setError(REPETITION_LOOP_ERROR_MESSAGE)
        noteTurnEnd('error')
        return 'terminal'
      }

      // 2. Check fatal non-retryable errors (context overflow, invalid API key, quota)
      if (rawErr && isFatalNonRetryableError(rawErr)) {
        const fatalText = extractRelayErrorMessage(rawErr as any) || String(rawErr)
        setIsErrorTerminal(true)
        setAutoRecoveryState(null)
        setError(fatalText)
        noteTurnEnd('error')
        return 'terminal'
      }

      // If a prompt or "go on" was just dispatched within the last 2.5s and no error fired, wait
      if (
        !rawErrorInput &&
        lastMsg?.info.role === 'user' &&
        Date.now() - lastSendTimestampRef.current < 2500
      ) {
        return false
      }

      // 4. Branch A: Completely empty turn (0 characters, 0 tool calls emitted in this turn)
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
          (Boolean(rawErr) && !isAbortError(rawErr)) ||
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
          setIsErrorTerminal(false)
          setAutoRecoveryState({
            attempt: nextAttempt,
            max: MAX_AUTO_RECOVERY_ATTEMPTS,
            mode: 'retry',
          })

          // Strip transient error from the empty shell so no red card flashes during backoff
          if (turn.lastAssistantMessage?.info.error) {
            const cleaned = messagesRef.current.map((m) =>
              m.info.id === turn.lastAssistantMessage?.info.id
                ? { ...m, info: { ...m.info, error: undefined } }
                : m
            )
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
              // Content arrived in the meantime -> never delete; send go on instead
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

        // Empty-turn retries exhausted (>= 5 attempts)
        const errMsg =
          (rawErr ? extractRelayErrorMessage(rawErr as any) : null) ||
          (fuse.kind === 'system_abort' ? SYSTEM_ABORT_MESSAGE : EMPTY_RESPONSE_MESSAGE)
        setIsErrorTerminal(true)
        setAutoRecoveryState(null)
        setError(errMsg)
        noteTurnEnd('error')
        return 'terminal'
      }

      // 5. Branch B: Turn already has output (>= 1 char or tool call) -> NEVER delete; auto-send 'go on'
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
        (Boolean(rawErr) && !isAbortError(rawErr) && usedAttempts < MAX_AUTO_RECOVERY_ATTEMPTS)

      if (needsGoOn) {
        const nextAttempt = usedAttempts + 1
        autoRecoveryCountRef.current = nextAttempt
        goOnSentRef.current = nextAttempt
        goOnFlightRef.current = true
        setError(null)
        setIsErrorTerminal(false)
        setAutoRecoveryState({
          attempt: nextAttempt,
          max: MAX_AUTO_RECOVERY_ATTEMPTS,
          mode: 'go_on',
        })

        // Keep info.error in messagesRef so the 1500ms recheck (decideGoOn) still sees the relay error;
        // only strip transient error from React UI state during backoff.
        setMessages((prev) =>
          prev.map((m) =>
            m.info.role === 'assistant' && m.info.error
              ? { ...m, info: { ...m.info, error: undefined } }
              : m
          )
        )

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
            // External watcher (e.g. opencode_ctl.py) already sent 'go on'
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
              !isAbortError(rawErr) &&
              (!last || last.info.finish !== 'stop' || Boolean(last.info.error)))
          if (!stillNeedsGoOn) {
            goOnFlightRef.current = false
            setAutoRecoveryState(null)
            return
          }
          // Strip transient error from messagesRef right before dispatching 'go on'
          messagesRef.current = messagesRef.current.map((m) =>
            m.info.role === 'assistant' && m.info.error
              ? { ...m, info: { ...m.info, error: undefined } }
              : m
          )
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
        (Boolean(rawErr) && !isAbortError(rawErr) && usedAttempts >= MAX_AUTO_RECOVERY_ATTEMPTS)
      ) {
        const rawText = rawErr ? extractRelayErrorMessage(rawErr as any) : null
        const capMsg = rawText
          ? `已自动发送 go on / 重试 ${MAX_AUTO_RECOVERY_ATTEMPTS} 次仍失败：${rawText}`
          : SYSTEM_ABORT_MESSAGE
        setIsErrorTerminal(true)
        setAutoRecoveryState(null)
        setError(capMsg)
        noteTurnEnd('error')
        return 'terminal'
      }

      // Clean stop
      setAutoRecoveryState(null)
      setIsErrorTerminal(false)
      setError(null)
      return false
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
      // Merge options when both session.status(idle) and session.idle arrive back-to-back
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
          const reconciled = reconcileHistoryWithOptimistic(history, messagesRef.current)
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
          const recovering = maybeSendGoOn()
          if (recovering === false) {
            const latest = reconciled[reconciled.length - 1]
            const turnMsgId = latest?.info.id || '__empty__'
            if (mergedOpts.commitCheckpointOnCleanAssistant) {
              const postFuse = classifyEmptyIdleFuse({ lastMessage: latest, userAborted: false })
              if (postFuse.kind === 'none' && latest?.info.role === 'assistant' && !latest.info.error) {
                if (lastCleanTurnMsgIdRef.current !== turnMsgId) {
                  lastCleanTurnMsgIdRef.current = turnMsgId
                  void maybeCommitGitCheckpoint(activeId, reconciled)
                  noteTurnEnd('clean')
                }
              }
            } else if (mergedOpts.markCleanWhenWasBusy) {
              if (lastCleanTurnMsgIdRef.current !== turnMsgId) {
                lastCleanTurnMsgIdRef.current = turnMsgId
                noteTurnEnd('clean')
              }
            }
          }
        })
        .catch((err) => {
          const mergedOpts = reconcilingOptionsRef.current
          console.warn('[useChatStream] Background history reconciliation on idle failed:', err)
          if (mergedOpts.abortedByUser || userAbortedRef.current || revertingRef.current) return
          const recovering = maybeSendGoOn()
          if (recovering === false) {
            const fallbackMsgs = mergedOpts.fallbackMessages || messagesRef.current
            const lastMsg = fallbackMsgs[fallbackMsgs.length - 1]
            const turnMsgId = lastMsg?.info.id || '__empty__'
            if (mergedOpts.commitCheckpointOnCleanAssistant) {
              if (mergedOpts.fallbackFuseKind === 'none' && lastMsg?.info.role === 'assistant' && !lastMsg.info.error) {
                if (lastCleanTurnMsgIdRef.current !== turnMsgId) {
                  lastCleanTurnMsgIdRef.current = turnMsgId
                  void maybeCommitGitCheckpoint(activeId, fallbackMsgs)
                  noteTurnEnd('clean')
                }
              }
            } else if (mergedOpts.markCleanWhenWasBusy) {
              if (lastCleanTurnMsgIdRef.current !== turnMsgId) {
                lastCleanTurnMsgIdRef.current = turnMsgId
                noteTurnEnd('clean')
              }
            }
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
    [maybeSendGoOn, noteTurnEnd]
  )

  const stopRepetitionLoop = useCallback((messageId: string) => {
    if (repetitionArmedRef.current) return
    repetitionArmedRef.current = true
    setError(REPETITION_LOOP_ERROR_MESSAGE)
    setMessages((prev) => prev.map((msg) => {
      if (msg.info.id !== messageId) return msg
      const { message, hasLoop } = sanitizeMessageRepetition(msg)
      if (!hasLoop) return msg
      return {
        ...message,
        info: {
          ...message.info,
          finish: message.info.finish || 'abort',
          error: message.info.error || {
            name: REPETITION_LOOP_ERROR_NAME,
            message: REPETITION_LOOP_ERROR_MESSAGE,
            data: { message: REPETITION_LOOP_ERROR_MESSAGE, kind: 'repetition_loop' },
          },
        },
      }
    }))
    noteTurnEnd('error')
    commitSessionStatus({ type: 'idle' })
    const id = currentSessionIdRef.current
    if (!id || id === '__draft__') return
    void api.abortSession(id).catch((err) => {
      console.error('Failed to abort repetition loop:', err)
    })
  }, [noteTurnEnd, commitSessionStatus])

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
      // A send that already marked this session running wins over an immediate stale idle snapshot
      // (only within the first 2.5s of dispatching prompt before backend records busy).
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
      setMessages((prev) => reconcileHistoryWithOptimistic(history, prev))
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
  }, [commitSessionStatus])

  useEffect(() => {
    currentSessionIdRef.current = sessionId

    // If an in-flight prompt initiated this session switch, preserve optimistic messages and status!
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
      setIsErrorTerminal(false)
      setTurnEnd(null)
      userAbortedRef.current = false
      autoRecoveryCountRef.current = 0
      goOnSentRef.current = 0
      goOnFlightRef.current = false
      lastActivityAtRef.current = 0
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

    // Ctrl+W then Ctrl+Shift+T restores a frozen page (bfcache). The painted
    // checkmark or retry banner is stale until /session/status answers again.
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

    // Subscribe to SSE events
    const unsubDelta = sseManager.onPartDelta((data) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return
      noteActivity('delta')

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

        const grown = next.find((msg) => msg.info.id === data.messageID)
        if (grown && sanitizeMessageRepetition(grown).hasLoop) {
          queueMicrotask(() => stopRepetitionLoop(data.messageID))
        }

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
      noteActivity('part')
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

        const grown = next.find((msg) => msg.info.id === cleanPart.messageID)
        if (grown && sanitizeMessageRepetition(grown).hasLoop) {
          queueMicrotask(() => stopRepetitionLoop(cleanPart.messageID))
        }

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
      noteActivity('message')
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
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return
      if (data.status.type === 'idle' && isSendingRef.current) return
      const wasBusyOnStatus = sessionBusyRef.current
      noteActivity('status')

      // If daemon's internal retry loop exceeds 5 attempts, abort and surface terminal error
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
        setIsErrorTerminal(true)
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

    // SSE Error Fuse: break out of busy state immediately on backend errors
    const unsubError = sseManager.onSessionError((data) => {
      const activeId = currentSessionIdRef.current || sessionId
      if (data.sessionID !== activeId) return
      noteActivity('error')
      commitSessionStatus({ type: 'idle' })

      // User-initiated or backend abort is not a relay failure
      if (userAbortedRef.current || isAbortError(data.error)) {
        clearAutoRecoveryTimer()
        setError(null)
        setAutoRecoveryState(null)
        setIsErrorTerminal(false)
        noteTurnEnd('user')
        return
      }

      const errorMsg = extractRelayErrorMessage(data.error) || 'Session error occurred'
      if (isAbortError(errorMsg)) {
        clearAutoRecoveryTimer()
        setError(null)
        setAutoRecoveryState(null)
        setIsErrorTerminal(false)
        noteTurnEnd('user')
        return
      }

      const relayError = {
        name: data.error?.name || 'SessionError',
        message: errorMsg,
        data: data.error?.data || {},
      }
      // Stamp error for decision inspection; maybeSendGoOn will strip it from UI state if < 5 attempts
      const stamped = messagesRef.current.map((msg, index, all) => {
        if (index !== all.length - 1) return msg
        if (msg.info.role !== 'assistant' || msg.info.error) return msg
        return { ...msg, info: { ...msg.info, error: relayError } }
      })
      messagesRef.current = stamped
      setMessages(stamped)
      queueMicrotask(() => {
        maybeSendGoOn(relayError)
      })
    })

    // Safely finalize to idle when backend signals session.idle + Empty-idle Fuse
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
        setIsErrorTerminal(false)
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
        setIsErrorTerminal(true)
        setAutoRecoveryState(null)
        setError(fuse.message)
        noteTurnEnd('error')
        setMessages((prev) => {
          if (prev.length === 0) return prev
          const last = prev[prev.length - 1]
          if (last.info.id !== lastMsg.info.id || last.info.error) return prev
          const { message } = sanitizeMessageRepetition(last)
          return [
            ...prev.slice(0, -1),
            {
              ...message,
              info: {
                ...message.info,
                error: {
                  name: fuse.errorName,
                  message: fuse.message,
                  data: { message: fuse.message, kind: fuse.kind },
                },
              },
            },
          ]
        })
        return
      }

      reconcileIdleHistory(activeId, {
        abortedByUser,
        commitCheckpointOnCleanAssistant: true,
        fallbackMessages: currentMsgs,
        fallbackFuseKind: fuse.kind,
      })
    })

    // Subscribe to message.removed to synchronize deletions
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

    // Ninety seconds of nothing. A 3s pause is a tool or a thought, not a death.
    // Confirm with the daemon before nudging: if the daemon is still busy/retrying
    // (e.g. long reasoning pause on gpt-6-astra), refresh the activity clock and wait;
    // only reconcile and recover when the daemon has actually transitioned to idle.
    const silenceTimer = window.setInterval(() => {
      const activeId = currentSessionIdRef.current || sessionId
      if (!activeId || activeId === '__draft__') return
      if (!isRunningStatus(sessionStatusRef.current)) return
      if (goOnFlightRef.current) return
      const quietFor = Date.now() - lastActivityAtRef.current
      if (quietFor < GO_ON_SILENCE_MS) return
      const askedAt = lastActivityAtRef.current
      const activeDir =
        sessionDir ||
        messagesRef.current[0]?.info.path?.root ||
        messagesRef.current[0]?.info.path?.cwd
      void api.getSessionStatus(activeId, activeDir).then((status) => {
        if (!status || currentSessionIdRef.current !== activeId) return
        if (lastActivityAtRef.current !== askedAt) return
        commitSessionStatus(status)
        if (!isRunningStatus(status)) {
          // Backend has transitioned to idle while silence timer was running.
          // Trigger authoritative history reconciliation to recover from missed SSE idle events.
          reconcileIdleHistory(activeId, { markCleanWhenWasBusy: true })
          return
        }
        // Daemon explicitly confirms the turn is still running (e.g. silent reasoning or step retry).
        // Advance activity timestamp so we re-probe after the next silence window without injecting "go on".
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
  }, [sessionId, loadSessionData, noteTurnEnd, commitSessionStatus, stopRepetitionLoop, noteActivity, maybeSendGoOn, reconcileIdleHistory, clearAutoRecoveryTimer])

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
      repetitionArmedRef.current = false
      lastSendTimestampRef.current = Date.now()
      noteActivity('send')
      if (text.trim() !== GO_ON_TEXT && !options?.isAutoRetry) {
        clearAutoRecoveryTimer()
        autoRecoveryCountRef.current = 0
        goOnSentRef.current = 0
        setAutoRecoveryState(null)
        setIsErrorTerminal(false)
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
    [sessionId, noteTurnEnd, commitSessionStatus, noteActivity, clearAutoRecoveryTimer]
  )

  useEffect(() => {
    sendPromptRef.current = sendPrompt
  }, [sendPrompt])

  const abort = useCallback(async (opts?: { preempt?: boolean }) => {
    if (!sessionId) return
    clearAutoRecoveryTimer()
    setAutoRecoveryState(null)
    setIsErrorTerminal(false)
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
  }, [sessionId, noteTurnEnd, commitSessionStatus, clearAutoRecoveryTimer])

  const retry = useCallback(async () => {
    setError(null)
    setIsErrorTerminal(false)
    if (!sessionId) return

    const msgs = messagesRef.current
    const turn = inspectCurrentTurnRecovery(msgs, GO_ON_TEXT)

    // HARD INVARIANT: Never delete messages if the assistant has already output >= 1 character or tool call!
    // Route directly to sending "go on" instead.
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
    const subsequentAssistantMsgs = msgs.slice(lastUserIndex + 1).filter((m) => m.info.role === 'assistant')

    // 0. Abort any lingering in-flight stream on the backend before deleting messages
    // so an active generator cannot re-upsert deleted turn messages into SQLite.
    await api.abortSession(sessionId).catch(() => {})

    // 0b. Fetch authoritative backend history so we delete real persisted msg_... IDs
    // even when retry() triggers before SSE replaced the local optimistic usr_... ID.
    const assistantIdsToDelete = new Set<string>(
      subsequentAssistantMsgs.map((m) => m.info.id).filter((id) => !id.startsWith('usr_'))
    )
    const userIdsToDelete = new Set<string>(
      lastUserMsg.info.id.startsWith('usr_') ? [] : [lastUserMsg.info.id]
    )
    const allRemovedIds = new Set<string>([
      lastUserMsg.info.id,
      ...subsequentAssistantMsgs.map((m) => m.info.id),
    ])

    const freshHistory = await api.getMessages(sessionId, { fresh: true }).catch(() => null)
    if (freshHistory && freshHistory.length > 0) {
      let backendUserIdx = -1
      for (let i = freshHistory.length - 1; i >= 0; i--) {
        if (freshHistory[i].info.role === 'user') {
          backendUserIdx = i
          break
        }
      }
      if (backendUserIdx !== -1) {
        const backendUserMsg = freshHistory[backendUserIdx]
        const matchesUser =
          backendUserMsg.info.id === lastUserMsg.info.id ||
          lastUserMsg.info.id.startsWith('usr_')
        if (matchesUser) {
          userIdsToDelete.add(backendUserMsg.info.id)
          allRemovedIds.add(backendUserMsg.info.id)
          for (const m of freshHistory.slice(backendUserIdx + 1)) {
            if (m.info.role === 'assistant') {
              assistantIdsToDelete.add(m.info.id)
              allRemovedIds.add(m.info.id)
            }
          }
        }
      }
    }

    // 1. Physically delete failed/empty assistant messages from backend SQLite
    for (const aId of assistantIdsToDelete) {
      try {
        await api.deleteMessage(sessionId, aId)
      } catch (err) {
        console.warn(`[Retry] Failed to delete assistant message ${aId}:`, err)
      }
    }

    // 2. Also delete the old user message from backend SQLite to prevent duplicate user turns
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

    // 3. Immediately strip the failed assistant messages and old user message locally
    setMessages((prev) => prev.filter((m) => !allRemovedIds.has(m.info.id)))

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
      isAutoRetry: true,
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
      clearAutoRecoveryTimer()
      setAutoRecoveryState(null)
      setIsErrorTerminal(false)
      revertingRef.current = true
      setReverting(true)

      // If session is actively generating or retrying, abort it first so the daemon releases the session prompt lock
      if (sessionBusyRef.current || isRunningStatus(sessionStatusRef.current)) {
        console.log('[Revert:Hook] Active prompt/retry in flight during revert, aborting session first:', sessionId)
        userAbortedRef.current = true
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
    [sessionId, loadSessionData, onSessionUpdate, sessionDir, clearAutoRecoveryTimer, commitSessionStatus]
  )

  /**
   * Restore all previously reverted messages and file state
   */
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
  }, [sessionId, loadSessionData, onSessionUpdate, clearAutoRecoveryTimer])

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
