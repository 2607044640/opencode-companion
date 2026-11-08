import type { Message, TodoItem, ToolPart } from '../types/opencode'
import { isExplicitUserAbortError } from '../services/api'
import { isTodoCompleted } from '../components/chat/todo-state'
import {
  hasTurnContent,
  inspectCurrentTurnRecovery,
  isFatalNonRetryableError,
  isGoOnUserMessage,
  MAX_AUTO_RECOVERY_ATTEMPTS,
} from './empty-idle-fuse'
import { sanitizeMessageRepetition } from '../utils/repetition-fuse'

/**
 * Silence must outlast a tool call and a thinking pause.
 * Three seconds is a stall, not a death. Ninety seconds with zero SSE
 * (text, reasoning, tool, status) is the only quiet that counts.
 */
export const GO_ON_SILENCE_MS = 90_000

/** Cap automatic nudges for one user turn (5 attempts max per user rule). */
export const GO_ON_MAX_PER_TURN = MAX_AUTO_RECOVERY_ATTEMPTS

export const GO_ON_TEXT = 'go on'

const FINISH_MEANING_STOP = new Set([
  'stop',
  'end_turn',
  'end-turn',
  'complete',
  'completed',
  'done',
])

const FINISH_MEANING_CONTINUE = new Set([
  'tool_calls',
  'tool-calls',
  'length',
  'max_tokens',
  'max-tokens',
])

const QUESTION_TOOLS = new Set(['question', 'ask', 'ask_user', 'askuser'])

export type GoOnActivity = 'delta' | 'part' | 'message' | 'status' | 'error' | 'idle' | 'send'

export interface GoOnClock {
  /** Last SSE or local send. A tool that is still running keeps this fresh via part updates. */
  lastActivityAt: number
  now: number
  /** True only after GET /session/status or an SSE status event. A guess is not idle. */
  runKnown: boolean
  /** Daemon says this session is not generating. */
  daemonIdle: boolean
  userAborted: boolean
  /** This turn already nudged this many times. */
  sentThisTurn: number
  messages: readonly Message[]
  todos: readonly TodoItem[]
}

export type GoOnVerdict =
  | { readonly act: 'wait'; readonly reason: string }
  | { readonly act: 'send'; readonly reason: 'relay_error' | 'silence' | 'cut_finish' | 'open_tool' }

function lastAssistant(messages: readonly Message[]): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.role === 'assistant') return messages[i]
  }
  return undefined
}

function finishMeansStop(finish: string | undefined): boolean {
  if (!finish) return false
  return FINISH_MEANING_STOP.has(finish.trim().toLowerCase())
}

function finishMeansCut(finish: string | undefined): boolean {
  if (!finish) return false
  const value = finish.trim().toLowerCase()
  if (value === 'abort') return false
  return FINISH_MEANING_CONTINUE.has(value)
}

function isQuestionTool(part: ToolPart): boolean {
  return QUESTION_TOOLS.has((part.tool || '').trim().toLowerCase())
}

function hasOpenTool(message: Message): boolean {
  return message.parts.some((part) => {
    if (part.type !== 'tool') return false
    const tool = part as ToolPart
    if (isQuestionTool(tool)) return false
    const status = tool.state?.status
    return status === 'pending' || status === 'running'
  })
}

function isWaitingOnUser(message: Message | undefined): boolean {
  if (!message) return false
  return message.parts.some((part) => part.type === 'tool' && isQuestionTool(part as ToolPart))
}

/** Open todos are a hint for the model, never a completion oracle. */
export function hasOpenTodos(todos: readonly TodoItem[]): boolean {
  return todos.some((todo) => !isTodoCompleted(todo) && todo.status !== 'cancelled')
}

function hasRelayError(message: Message | undefined): boolean {
  const error = message?.info.error
  if (!error) return false
  if (isExplicitUserAbortError(error)) return false
  return true
}

function hasVisibleAnswerText(message: Message): boolean {
  return message.parts.some(
    (part) => part.type === 'text' && Boolean((part as { text?: string }).text?.trim())
  )
}

/**
 * One clock, four reasons to nudge, and an explicit stop.
 *
 * Send only when the daemon has stopped the turn (idle, or a relay error that
 * forced idle) for a reason that is not "the model finished" and not "the user
 * stopped it" and not "the model is asking a question", AND the turn already
 * produced at least 1 character/tool call (`turnHasAnyOutput`).
 * Completely empty turns (`!turnHasAnyOutput`) belong to empty-turn auto-retry,
 * never `go on`.
 */
export function decideGoOn(clock: GoOnClock): GoOnVerdict {
  if (clock.userAborted) return { act: 'wait', reason: 'user_abort' }
  if (!clock.runKnown) return { act: 'wait', reason: 'status_unknown' }

  const turnInspection = inspectCurrentTurnRecovery(clock.messages, GO_ON_TEXT)
  const assistant = turnInspection.rootUserMessage
    ? turnInspection.lastAssistantMessage
    : lastAssistant(clock.messages)
  if (!assistant) return { act: 'wait', reason: 'no_assistant' }
  if (isWaitingOnUser(assistant)) return { act: 'wait', reason: 'user_question' }

  if (isFatalNonRetryableError(assistant.info.error)) {
    return { act: 'wait', reason: 'fatal_error' }
  }
  if (sanitizeMessageRepetition(assistant).hasLoop) {
    return { act: 'wait', reason: 'repetition_loop' }
  }

  if (!turnInspection.turnHasAnyOutput && !hasTurnContent(assistant)) {
    // 0 characters / 0 tools generated so far -> empty-turn auto-retry owns this, not go-on
    return { act: 'wait', reason: 'empty_turn' }
  }

  if (clock.sentThisTurn >= GO_ON_MAX_PER_TURN) return { act: 'wait', reason: 'cap' }

  const quietFor = clock.now - clock.lastActivityAt
  if (quietFor < 0) return { act: 'wait', reason: 'clock_skew' }

  if (!clock.daemonIdle) {
    // Never inject "go on" while the daemon explicitly reports busy/retry
    // (e.g. long reasoning pause on gpt-6-astra or internal step retry).
    return { act: 'wait', reason: 'still_running' }
  }

  const tail = clock.messages[clock.messages.length - 1]
  if (tail && isGoOnUserMessage(tail, GO_ON_TEXT) && !assistant.info.error) {
    // A "go on" user message is already at the tail awaiting its assistant turn
    return { act: 'wait', reason: 'still_running' }
  }

  if (finishMeansStop(assistant.info.finish) && !assistant.info.error) {
    return { act: 'wait', reason: 'model_finished' }
  }
  if (hasRelayError(assistant)) return { act: 'send', reason: 'relay_error' }
  if (finishMeansCut(assistant.info.finish)) return { act: 'send', reason: 'cut_finish' }
  if (hasOpenTool(assistant)) return { act: 'send', reason: 'open_tool' }
  if (assistant.info.finish === 'abort' && !isExplicitUserAbortError(assistant.info.error)) {
    return { act: 'send', reason: 'relay_error' }
  }
  if (!hasTurnContent(assistant) && turnInspection.turnHasAnyOutput) {
    return { act: 'send', reason: 'relay_error' }
  }
  if (!assistant.info.finish && !hasVisibleAnswerText(assistant)) {
    // Assistant stopped mid-turn with no finish reason and no visible answer text
    // (e.g. only step-start, reasoning, or tool calls before stream dropped).
    return { act: 'send', reason: 'cut_finish' }
  }

  // Idle with visible answer text, no finish, and no error is a clean stop the daemon already closed.
  return { act: 'wait', reason: 'settled' }
}
