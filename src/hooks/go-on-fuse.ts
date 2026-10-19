import type { Message, TodoItem, ToolPart } from '../types/opencode'
import { isAbortError } from '../services/api'
import { isTodoCompleted } from '../components/chat/todo-state'

/**
 * Silence must outlast a tool call and a thinking pause.
 * Three seconds is a stall, not a death. Ninety seconds with zero SSE
 * (text, reasoning, tool, status) is the only quiet that counts.
 */
export const GO_ON_SILENCE_MS = 90_000

/** Cap automatic nudges for one user turn. A loop that never converges must stop. */
export const GO_ON_MAX_PER_TURN = 8

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
  if (isAbortError(error)) return false
  return true
}

/**
 * One clock, four reasons to nudge, and an explicit stop.
 *
 * Send only when the daemon has stopped the turn (idle, or a relay error that
 * forced idle) for a reason that is not "the model finished" and not "the user
 * stopped it" and not "the model is asking a question".
 * Silence is the same idea with no idle event: nothing arrived for GO_ON_SILENCE_MS
 * while the daemon still claims the turn is running.
 *
 * Do not send because a todo is still open. The model can finish a turn and
 * leave the list for the user. Do not send because the stream paused for a
 * few seconds. Thinking and tool execution are allowed to be quiet.
 */
export function decideGoOn(clock: GoOnClock): GoOnVerdict {
  if (clock.userAborted) return { act: 'wait', reason: 'user_abort' }
  if (!clock.runKnown) return { act: 'wait', reason: 'status_unknown' }
  if (clock.sentThisTurn >= GO_ON_MAX_PER_TURN) return { act: 'wait', reason: 'cap' }

  const assistant = lastAssistant(clock.messages)
  if (!assistant) return { act: 'wait', reason: 'no_assistant' }
  if (isWaitingOnUser(assistant)) return { act: 'wait', reason: 'user_question' }

  const quietFor = clock.now - clock.lastActivityAt
  if (quietFor < 0) return { act: 'wait', reason: 'clock_skew' }

  if (!clock.daemonIdle) {
    if (quietFor >= GO_ON_SILENCE_MS) return { act: 'send', reason: 'silence' }
    return { act: 'wait', reason: 'still_running' }
  }

  if (finishMeansStop(assistant.info.finish) && !assistant.info.error) {
    return { act: 'wait', reason: 'model_finished' }
  }
  if (hasRelayError(assistant)) return { act: 'send', reason: 'relay_error' }
  if (finishMeansCut(assistant.info.finish)) return { act: 'send', reason: 'cut_finish' }
  if (hasOpenTool(assistant)) return { act: 'send', reason: 'open_tool' }

  // Idle with no finish and no error is a clean stop the daemon already closed.
  // Open todos do not reopen it. A missing finish on an empty shell is the
  // empty-idle fuse's job (it resends the original prompt), not a go-on.
  return { act: 'wait', reason: 'settled' }
}
