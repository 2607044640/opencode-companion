import type { Message, MessagePart, ReasoningPart, TextPart } from '../types/opencode'
import { extractRelayErrorMessage, isAbortError } from '../services/api'
import {
  sanitizeMessageRepetition,
  REPETITION_LOOP_ERROR_NAME,
  REPETITION_LOOP_ERROR_MESSAGE,
} from '../utils/repetition-fuse'

export const EMPTY_RESPONSE_ERROR_NAME = 'EmptyResponseError' as const
export const SYSTEM_ABORT_ERROR_NAME = 'SystemAbortError' as const
export { REPETITION_LOOP_ERROR_NAME, REPETITION_LOOP_ERROR_MESSAGE }

/** Maximum automatic recovery attempts (empty-turn retry or mid-turn go on) per user turn. */
export const MAX_AUTO_RECOVERY_ATTEMPTS = 5

export const EMPTY_RESPONSE_MESSAGE =
  '中转服务连续 5 次未返回有效响应（空响应），已停止自动重试' as const

export const SYSTEM_ABORT_MESSAGE =
  '生成被中断且自动恢复已达 5 次上限，已停止自动重试' as const

const FATAL_NON_RETRYABLE_PATTERNS = [
  /context[_\s-]*length[_\s-]*exceeded/i,
  /maximum\s+context\s+length/i,
  /prompt\s+is\s+too\s+long/i,
  /context\s+window\s+exceeded/i,
  /token\s+limit\s+(?:exceeded|reached)/i,
  /max[_\s-]*tokens?[_\s-]*exceeded/i,
  /request\s+too\s+large/i,
  /invalid[_\s-]*api[_\s-]*key/i,
  /incorrect\s+api\s+key/i,
  /insufficient[_\s-]*quota/i,
  /billing[_\s-]*not[_\s-]*active/i,
  /account[_\s-]*deactivated/i,
  /重复生成熔断/,
  /repetition_loop/i,
]

export function isFatalNonRetryableError(error: unknown): boolean {
  if (!error) return false
  const text =
    typeof error === 'string'
      ? error
      : extractRelayErrorMessage(error as any) || JSON.stringify(error)
  if (!text) return false
  return FATAL_NON_RETRYABLE_PATTERNS.some((re) => re.test(text))
}

export type EmptyIdleFuseKind =
  | 'none'
  | 'empty_response'
  | 'system_abort'
  | 'user_abort'
  | 'repetition_loop'

export type EmptyIdleFuseVerdict =
  | { readonly kind: 'none' }
  | { readonly kind: 'user_abort' }
  | {
      readonly kind: 'empty_response'
      readonly errorName: typeof EMPTY_RESPONSE_ERROR_NAME
      readonly message: string
    }
  | {
      readonly kind: 'system_abort'
      readonly errorName: typeof SYSTEM_ABORT_ERROR_NAME
      readonly message: string
    }
  | {
      readonly kind: 'repetition_loop'
      readonly errorName: typeof REPETITION_LOOP_ERROR_NAME
      readonly message: string
    }

export interface EmptyIdleFuseInput {
  readonly lastMessage: Message | undefined
  readonly userAborted: boolean
}

function partHasVisibleContent(part: MessagePart): boolean {
  switch (part.type) {
    case 'text':
      return Boolean((part as TextPart).text?.trim())
    case 'reasoning': {
      const reasoning = part as ReasoningPart
      return Boolean(reasoning.text?.trim())
    }
    case 'file':
    case 'tool':
      return true
    default:
      return false
  }
}

export function hasTurnContent(msg: Message): boolean {
  if (!msg.parts || msg.parts.length === 0) return false
  return msg.parts.some(partHasVisibleContent)
}

export function extractUserMessageText(msg: Message): string {
  return msg.parts
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()
}

export function isGoOnUserMessage(msg: Message, goOnText = 'go on'): boolean {
  if (msg.info.role !== 'user') return false
  const text = extractUserMessageText(msg).toLowerCase()
  return text === goOnText.toLowerCase() || text.startsWith(`${goOnText.toLowerCase()} (`)
}

export interface CurrentTurnInspection {
  readonly rootUserIndex: number
  readonly rootUserMessage: Message | null
  readonly turnKey: string | null
  readonly turnMessages: readonly Message[]
  readonly assistantMessages: readonly Message[]
  readonly lastAssistantMessage: Message | undefined
  readonly goOnCount: number
  readonly turnHasAnyOutput: boolean
}

/**
 * Inspects all messages belonging to the current user turn (from the last non-"go on"
 * user message onwards). Determines whether ANY assistant message in this turn has
 * emitted even a single character or tool call (`turnHasAnyOutput`).
 */
export function inspectCurrentTurnRecovery(
  messages: readonly Message[],
  goOnText = 'go on'
): CurrentTurnInspection {
  let rootUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.info.role === 'user' && !isGoOnUserMessage(msg, goOnText)) {
      rootUserIndex = i
      break
    }
  }

  if (rootUserIndex === -1) {
    // Fallback if all user messages are "go on" or only assistant messages exist (e.g. unit test fixtures)
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].info.role === 'user') {
        rootUserIndex = i
        break
      }
    }
  }

  const rootUserMessage = rootUserIndex !== -1 ? messages[rootUserIndex] : null
  const turnMessages = rootUserIndex !== -1 ? messages.slice(rootUserIndex + 1) : messages
  const assistantMessages = turnMessages.filter((m) => m.info.role === 'assistant')
  const lastAssistantMessage =
    assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1] : undefined
  const goOnCount = turnMessages.filter((m) => isGoOnUserMessage(m, goOnText)).length
  const anyAssistantContent = assistantMessages.some((m) => hasTurnContent(m))
  const turnHasAnyOutput = anyAssistantContent || goOnCount > 0

  const turnKey = rootUserMessage
    ? extractUserMessageText(rootUserMessage) || rootUserMessage.info.id
    : null

  return {
    rootUserIndex,
    rootUserMessage,
    turnKey,
    turnMessages,
    assistantMessages,
    lastAssistantMessage,
    goOnCount,
    turnHasAnyOutput,
  }
}

export interface AutoRetryDecision {
  readonly retry: boolean
  readonly reason:
    | 'empty_response'
    | 'system_abort'
    | 'already_retried'
    | 'cap_exceeded'
    | 'not_empty'
    | 'fatal_error'
}

export function userTurnKey(messages: readonly Message[]): string | null {
  return inspectCurrentTurnRecovery(messages).turnKey
}

/**
 * Decides whether to automatically retry an empty turn from scratch.
 * STRICT INVARIANT:
 * - Only retries when the turn has ZERO output (`!turnHasAnyOutput`).
 * - Retries even if the relay attached a 502/504/timeout error to the empty shell,
 *   unless the error is a fatal non-retryable error (e.g. context length overflow).
 * - Stops retrying once `attemptCount >= MAX_AUTO_RECOVERY_ATTEMPTS` (5).
 */
export function decideEmptyTurnAutoRetry(input: {
  readonly fuseKind: EmptyIdleFuseKind
  readonly turnKey: string | null
  readonly alreadyRetriedTurnKey?: string | null
  readonly attemptCount?: number
  readonly maxAttempts?: number
  readonly assistantHasError?: boolean
  readonly errorText?: unknown
  readonly turnHasAnyOutput?: boolean
}): AutoRetryDecision {
  if (input.turnHasAnyOutput) {
    return { retry: false, reason: 'not_empty' }
  }
  if (input.fuseKind !== 'empty_response' && input.fuseKind !== 'system_abort') {
    return { retry: false, reason: 'not_empty' }
  }
  if (input.turnKey === null) {
    return { retry: false, reason: 'not_empty' }
  }
  if (isFatalNonRetryableError(input.errorText)) {
    return { retry: false, reason: 'fatal_error' }
  }
  const max = input.maxAttempts ?? MAX_AUTO_RECOVERY_ATTEMPTS
  if (typeof input.attemptCount === 'number') {
    if (input.attemptCount >= max) {
      return { retry: false, reason: 'cap_exceeded' }
    }
  } else if (input.alreadyRetriedTurnKey && input.turnKey === input.alreadyRetriedTurnKey) {
    return { retry: false, reason: 'already_retried' }
  }
  return { retry: true, reason: input.fuseKind }
}

export function classifyEmptyIdleFuse(input: EmptyIdleFuseInput): EmptyIdleFuseVerdict {
  const last = input.lastMessage
  if (!last || last.info.role !== 'assistant') {
    return { kind: 'none' }
  }
  if (hasTurnContent(last)) {
    // A loop that stopped on its own (finish=stop) is the same failure as an abort.
    const { hasLoop } = sanitizeMessageRepetition(last)
    if (hasLoop) {
      return {
        kind: 'repetition_loop',
        errorName: REPETITION_LOOP_ERROR_NAME,
        message: REPETITION_LOOP_ERROR_MESSAGE,
      }
    }
    return { kind: 'none' }
  }
  if (last.info.finish === 'abort' || isAbortError(last.info.error)) {
    if (input.userAborted || isAbortError(last.info.error)) {
      return { kind: 'user_abort' }
    }
    return {
      kind: 'system_abort',
      errorName: SYSTEM_ABORT_ERROR_NAME,
      message: SYSTEM_ABORT_MESSAGE,
    }
  }
  return {
    kind: 'empty_response',
    errorName: EMPTY_RESPONSE_ERROR_NAME,
    message: EMPTY_RESPONSE_MESSAGE,
  }
}
