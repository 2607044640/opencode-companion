import type { Message, MessagePart, ReasoningPart, TextPart } from '../types/opencode'

export const REPETITION_LOOP_ERROR_NAME = 'RepetitionLoopError' as const
export const REPETITION_LOOP_NOTICE = '*(检测到模型进入自回归重复生成死循环，已自动截断后续重复内容)*' as const
export const REPETITION_LOOP_ERROR_MESSAGE =
  '模型进入自回归重复生成死循环（已自动截断重复内容，建议点击重试或调整采样温度）' as const

export interface RepetitionMatch {
  readonly isLoop: boolean
  readonly pattern?: string
  readonly repeatCount?: number
  readonly cleanText: string
  readonly truncatedCount?: number
}

/**
 * Detects if a text string contains degenerate repeated n-gram blocks
 * (e.g. repeating a >=40 character sentence/paragraph 3 or more times).
 */
export function detectRepetitionLoop(
  text: string,
  minWindow = 40,
  minRepeats = 3
): RepetitionMatch {
  if (!text || text.length < minWindow * minRepeats) {
    return { isLoop: false, cleanText: text }
  }

  const trimmed = text.trim()
  const len = trimmed.length

  // Check possible anchor window sizes from 40 up to 100
  const anchorSize = Math.min(80, Math.max(minWindow, Math.floor(len / (minRepeats * 2))))

  // Scan starting points (allowing preambles)
  for (let start = 0; start <= Math.min(len - minWindow * minRepeats, 1000); start += 20) {
    const anchor = trimmed.slice(start, start + anchorSize)
    if (anchor.trim().length < 20) continue

    const positions: number[] = []
    let searchPos = start
    while (searchPos <= len - anchorSize) {
      const found = trimmed.indexOf(anchor, searchPos)
      if (found === -1) break
      positions.push(found)
      searchPos = found + anchorSize
    }

    if (positions.length >= minRepeats) {
      // Check if distance between consecutive positions is roughly equal
      const period = positions[1] - positions[0]
      if (period >= minWindow) {
        let isPeriodic = true
        for (let k = 1; k < positions.length - 1; k++) {
          const delta = positions[k + 1] - positions[k]
          if (Math.abs(delta - period) > 10) {
            isPeriodic = false
            break
          }
        }

        if (isPeriodic) {
          const firstEnd = positions[1]
          const cleanBefore = trimmed.slice(0, firstEnd)
          return {
            isLoop: true,
            pattern: anchor,
            repeatCount: positions.length,
            cleanText: cleanBefore.trim() + '\n\n' + REPETITION_LOOP_NOTICE,
            truncatedCount: positions.length - 1,
          }
        }
      }
    }
  }

  return { isLoop: false, cleanText: text }
}

/**
 * Truncates repetition loops across text and reasoning parts of an assistant message.
 */
export function sanitizeMessageRepetition(msg: Message): {
  message: Message
  hasLoop: boolean
} {
  if (!msg.parts || msg.parts.length === 0) {
    return { message: msg, hasLoop: false }
  }

  let hasLoop = false
  const sanitizedParts: MessagePart[] = msg.parts.map((p) => {
    if (p.type === 'text') {
      const textPart = p as TextPart
      const match = detectRepetitionLoop(textPart.text || '')
      if (match.isLoop) {
        hasLoop = true
        return { ...textPart, text: match.cleanText }
      }
    } else if (p.type === 'reasoning') {
      const reasoningPart = p as ReasoningPart
      const match = detectRepetitionLoop(reasoningPart.text || '')
      if (match.isLoop) {
        hasLoop = true
        return { ...reasoningPart, text: match.cleanText }
      }
    }
    return p
  })

  return {
    message: hasLoop ? { ...msg, parts: sanitizedParts } : msg,
    hasLoop,
  }
}
