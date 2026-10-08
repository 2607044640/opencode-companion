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

const LINE_COPIES = 8
const CYCLE_COPIES = 3
const MAX_PERIOD = 30
const MIN_LINE = 4
const SHORT_ACKS = new Set(['ok', 'okay', 'yes', 'no', 'done', 'hmm', '...', '…'])
const SENTENCE_SPLIT = /(?<=[。！？.!?])\s*/
const STATUS_PREFIX = /^(?:正在确认|正在发送|正在)/
const STATUS_WINDOW = 36
const STATUS_MAX_UNIQUE = 14
const STATUS_MIN_TOP = 6

function loopUnits(text: string): string[] {
  const units: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const pieces = line.split(SENTENCE_SPLIT).map((part) => part.trim()).filter(Boolean)
    // Only split a line of short sentences. A real paragraph stays one unit.
    if (pieces.length >= CYCLE_COPIES && pieces.every((part) => part.length < 40)) units.push(...pieces)
    else units.push(line)
  }
  return units
}

function lineCounts(line: string): boolean {
  return line.length >= MIN_LINE && !SHORT_ACKS.has(line.toLowerCase())
}

/** Eight identical lines, or a 2..30 line block copied three times. */
function detectLineCycle(text: string): RepetitionMatch {
  const units = loopUnits(text)
  let run = 0
  let previous = ''
  let runStart = 0
  let bestRun = 1
  let bestStart = -1
  for (let i = 0; i < units.length; i++) {
    const line = units[i]
    if (!lineCounts(line)) {
      run = 0
      previous = ''
      continue
    }
    if (line === previous) {
      run += 1
    } else {
      run = 1
      previous = line
      runStart = i
    }
    if (run > bestRun) {
      bestRun = run
      bestStart = runStart
    }
  }
  if (bestRun >= LINE_COPIES && bestStart >= 0) {
    return {
      isLoop: true,
      pattern: units[bestStart],
      repeatCount: bestRun,
      cleanText: `${units.slice(0, bestStart + 1).join('\n').trim()}\n\n${REPETITION_LOOP_NOTICE}`,
      truncatedCount: bestRun - 1,
    }
  }

  const count = units.length
  const maxPeriod = Math.min(MAX_PERIOD, Math.floor(count / CYCLE_COPIES))
  for (let period = 2; period <= maxPeriod; period++) {
    const usable = count - (count % period)
    if (usable < period * CYCLE_COPIES) continue
    const block = units.slice(usable - period, usable)
    if (new Set(block).size < 2) continue
    if (!block.some(lineCounts)) continue
    let matched = 1
    let index = usable - 2 * period
    while (index >= 0 && units.slice(index, index + period).every((value, key) => value === block[key])) {
      matched += 1
      index -= period
    }
    if (matched >= CYCLE_COPIES) {
      const cut = index + 2 * period
      return {
        isLoop: true,
        pattern: block.join('\n'),
        repeatCount: matched,
        cleanText: `${units.slice(0, cut).join('\n').trim()}\n\n${REPETITION_LOOP_NOTICE}`,
        truncatedCount: matched - 1,
      }
    }
  }
  const shuffled = detectShuffledStatus(units)
  if (shuffled) return shuffled
  return { isLoop: false, cleanText: text }
}

function statusKey(line: string): string {
  return line.replace(STATUS_PREFIX, '').trim() || line
}

/** Same confirmation set, order changing. A fixed period does not match. */
function detectShuffledStatus(units: string[]): RepetitionMatch | null {
  const counted = units.filter(lineCounts)
  if (counted.length < STATUS_WINDOW) return null
  const window = counted.slice(-STATUS_WINDOW)
  const counts = new Map<string, number>()
  for (const line of window) {
    const key = statusKey(line)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  let top = 0
  for (const value of counts.values()) {
    if (value > top) top = value
  }
  if (counts.size > STATUS_MAX_UNIQUE || top < STATUS_MIN_TOP) return null
  const keep = counted.slice(0, -STATUS_WINDOW)
  return {
    isLoop: true,
    repeatCount: top,
    cleanText: `${keep.join('\n').trim()}\n\n${REPETITION_LOOP_NOTICE}`,
    truncatedCount: STATUS_WINDOW,
  }
}

/**
 * Detects degenerate repeats: a short confirmation line copied 8 times,
 * a multi-line block copied 3 times, or a >=40 character n-gram copied 3 times.
 */
export function detectRepetitionLoop(
  text: string,
  minWindow = 40,
  minRepeats = 3
): RepetitionMatch {
  if (!text) {
    return { isLoop: false, cleanText: text }
  }
  const lineHit = detectLineCycle(text)
  if (lineHit.isLoop) return lineHit
  if (text.length < minWindow * minRepeats) {
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
