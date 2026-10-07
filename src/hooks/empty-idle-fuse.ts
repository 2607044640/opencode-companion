import type { Message, MessagePart, ReasoningPart, TextPart } from '../types/opencode'
import { isAbortError } from '../services/api'
import {
  sanitizeMessageRepetition,
  REPETITION_LOOP_ERROR_NAME,
  REPETITION_LOOP_ERROR_MESSAGE,
} from '../utils/repetition-fuse'

export const EMPTY_RESPONSE_ERROR_NAME = 'EmptyResponseError' as const
export const SYSTEM_ABORT_ERROR_NAME = 'SystemAbortError' as const
export { REPETITION_LOOP_ERROR_NAME, REPETITION_LOOP_ERROR_MESSAGE }

export const EMPTY_RESPONSE_MESSAGE =
  '中转服务未返回有效响应（空响应），请点击重试' as const

export const SYSTEM_ABORT_MESSAGE =
  '生成被中断（备选模型队列耗尽或通道异常），请点击重试' as const

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

export interface AutoRetryDecision {
  readonly retry: boolean
  readonly reason: 'empty_response' | 'system_abort' | 'already_retried' | 'not_empty' | 'has_error_body'
}

/** One automatic resend per user message, only for an empty relay failure.
 * A 502 that already has an error body stays on the banner: Host go-on owns that path.
 * repetition_loop is not a reason here.
 */
export function userTurnKey(messages: readonly Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.info.role !== 'user') continue
    const text = msg.parts
      .filter((part): part is TextPart => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim()
    return text || msg.info.id
  }
  return null
}

export function decideEmptyTurnAutoRetry(input: {
  readonly fuseKind: EmptyIdleFuseKind
  readonly turnKey: string | null
  readonly alreadyRetriedTurnKey: string | null
  readonly assistantHasError: boolean
}): AutoRetryDecision {
  if (input.fuseKind !== 'empty_response' && input.fuseKind !== 'system_abort') {
    return { retry: false, reason: 'not_empty' }
  }
  if (input.turnKey === null) {
    return { retry: false, reason: 'not_empty' }
  }
  if (input.assistantHasError) {
    return { retry: false, reason: 'has_error_body' }
  }
  if (input.turnKey === input.alreadyRetriedTurnKey) {
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
