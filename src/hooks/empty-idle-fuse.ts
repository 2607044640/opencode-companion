import type { Message, MessagePart, ReasoningPart, TextPart } from '../types/opencode'
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

export function classifyEmptyIdleFuse(input: EmptyIdleFuseInput): EmptyIdleFuseVerdict {
  const last = input.lastMessage
  if (!last || last.info.role !== 'assistant') {
    return { kind: 'none' }
  }
  if (hasTurnContent(last)) {
    if (last.info.finish === 'abort') {
      const { hasLoop } = sanitizeMessageRepetition(last)
      if (hasLoop) {
        return {
          kind: 'repetition_loop',
          errorName: REPETITION_LOOP_ERROR_NAME,
          message: REPETITION_LOOP_ERROR_MESSAGE,
        }
      }
    }
    return { kind: 'none' }
  }
  if (last.info.finish === 'abort') {
    if (input.userAborted) {
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
