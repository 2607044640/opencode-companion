import type { Message, MessagePart } from '../types/opencode'

export interface FindOptions {
  matchCase?: boolean
  matchWholeWord?: boolean
  useRegex?: boolean
}

export interface FindMatch {
  id: string
  messageId: string
  matchIndex: number
  textSnippet: string
}

export const FIND_MATCH_FALLBACK_PADDING_PX = 64

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function partStringField(part: MessagePart, field: string): string {
  if (!isRecord(part)) return ''
  const value = part[field]
  return typeof value === 'string' ? value : ''
}

export function compileFindQuery(query: string, options: FindOptions = {}): RegExp | null {
  const trimmed = query.trim()
  if (!trimmed) return null

  const { matchCase = false, matchWholeWord = false, useRegex = false } = options
  try {
    let pattern = useRegex ? query : escapeRegExp(query)
    if (matchWholeWord) {
      pattern = `\\b${pattern}\\b`
    }
    return new RegExp(pattern, matchCase ? 'g' : 'gi')
  } catch {
    return null
  }
}

export function extractMessageSearchableText(message: Message): string {
  const parts = message.parts || []
  const textBlocks: string[] = []

  for (const part of parts) {
    if (part.type === 'text') {
      const text = partStringField(part, 'text')
      if (text) textBlocks.push(text)
    } else if (part.type === 'reasoning') {
      const text = partStringField(part, 'text') || partStringField(part, 'thinking')
      if (text) textBlocks.push(text)
    }
  }

  return textBlocks.join('\n')
}

export function findMatchesInMessages(
  messages: Message[],
  query: string,
  options: FindOptions = {}
): FindMatch[] {
  const regex = compileFindQuery(query, options)
  if (!regex) return []

  const matches: FindMatch[] = []

  for (const msg of messages) {
    const text = extractMessageSearchableText(msg)
    if (!text) continue

    regex.lastIndex = 0
    let match: RegExpExecArray | null
    let matchIdx = 0

    while ((match = regex.exec(text)) !== null) {
      if (match.index === regex.lastIndex) {
        regex.lastIndex++
      }

      const start = Math.max(0, match.index - 24)
      const end = Math.min(text.length, match.index + match[0].length + 24)
      const snippet = text.slice(start, end).replace(/\n+/g, ' ')

      matches.push({
        id: `${msg.info.id}_${matchIdx}`,
        messageId: msg.info.id,
        matchIndex: matchIdx,
        textSnippet: snippet,
      })

      matchIdx++
    }
  }

  return matches
}
