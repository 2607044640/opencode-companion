import type { PromptAttachment } from '../types/opencode'

export const QUOTE_MIME = 'text/x-quote'
export const DEFAULT_QUOTE_ID = 'Quote'

export interface QuoteStats {
  charCount: number
  lineCount: number
  previewText: string
}

export interface ParsedQuoteItem {
  id: string
  quoteId: string
  tag: string
  content: string
  lineCount: number
  charCount: number
}

/**
 * Checks whether an attachment is a quote attachment.
 */
export function isQuoteAttachment(att?: PromptAttachment | null): boolean {
  if (!att) return false
  return att.kind === 'quote' || att.mime === QUOTE_MIME
}

/**
 * Formats a canonical quote tag, e.g. @[Quote] or @[Quote 2].
 */
export function formatQuoteTag(quoteId: string): string {
  const clean = (quoteId || DEFAULT_QUOTE_ID).trim()
  return `@[${clean}]`
}

/**
 * Calculates line count, char count, and a concise preview string for a quote.
 */
export function getQuoteStats(content: string): QuoteStats {
  const safe = typeof content === 'string' ? content : ''
  const normalized = safe.replace(/\r\n/g, '\n')
  const lines = normalized.length > 0 ? normalized.split('\n') : ['']
  const lineCount = normalized.length > 0 ? lines.length : 0
  const charCount = safe.length

  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean).slice(0, 3)
  const joined = nonEmpty.join(' ')
  const previewText = joined.length > 100 ? `${joined.slice(0, 100)}...` : joined

  return {
    charCount,
    lineCount,
    previewText,
  }
}

/**
 * Parses all quote tags (e.g. @[Quote], @[Quote 2]) from a string.
 */
export function extractQuoteTagsFromText(text: string): string[] {
  if (!text || !text.includes('@[Quote')) return []
  const regex = /@\[(Quote(?:\s+\d+)?)\]/gi
  const matches: string[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    if (m[1]) {
      matches.push(m[1])
    }
  }
  return matches
}

/**
 * Allocates the next sequential quote ID ('Quote', 'Quote 2', 'Quote 3'...).
 */
export function allocateNextQuoteId(
  existingText = '',
  existingAttachments: ReadonlyArray<PromptAttachment> = []
): string {
  const usedNumbers = new Set<number>()

  // 1. Scan existing attachments
  for (const att of existingAttachments) {
    if (!isQuoteAttachment(att)) continue
    const raw = (att.pastedId || att.name || '').trim()
    if (/^quote$/i.test(raw)) {
      usedNumbers.add(1)
    } else {
      const match = raw.match(/^quote\s+(\d+)$/i)
      if (match) {
        const num = parseInt(match[1], 10)
        if (num > 0) usedNumbers.add(num)
      }
    }
  }

  // 2. Scan existing text tags
  const tags = extractQuoteTagsFromText(existingText)
  for (const raw of tags) {
    const trimmed = raw.trim()
    if (/^quote$/i.test(trimmed)) {
      usedNumbers.add(1)
    } else {
      const match = trimmed.match(/^quote\s+(\d+)$/i)
      if (match) {
        const num = parseInt(match[1], 10)
        if (num > 0) usedNumbers.add(num)
      }
    }
  }

  if (!usedNumbers.has(1)) {
    return DEFAULT_QUOTE_ID
  }

  let candidate = 2
  while (usedNumbers.has(candidate)) {
    candidate += 1
  }
  return `Quote ${candidate}`
}

/**
 * Creates a PromptAttachment representing a quoted text snippet.
 */
export function createQuoteAttachment(
  content: string,
  existingAttachments: ReadonlyArray<PromptAttachment> = [],
  explicitQuoteId?: string,
  existingText = ''
): PromptAttachment {
  const quoteId = explicitQuoteId || allocateNextQuoteId(existingText, existingAttachments)
  return {
    id: `quote_${Date.now()}_${quoteId.replace(/\s+/g, '_')}_${Math.random().toString(36).slice(2, 6)}`,
    kind: 'quote',
    name: quoteId,
    pastedId: quoteId,
    mime: QUOTE_MIME,
    url: '',
    content,
  }
}

/**
 * Inserts a quote mention tag (@[Quote]) into the input text at the cursor position.
 * Preserves smart whitespace around the tag.
 */
export function insertQuoteMentionIntoText(
  currentText: string,
  quoteTag: string,
  cursorPosition?: number
): { newText: string; newCursor: number } {
  const cleanTag = quoteTag.trim()
  if (!currentText || !currentText.trim()) {
    return {
      newText: `${cleanTag} `,
      newCursor: cleanTag.length + 1,
    }
  }

  const cursor =
    typeof cursorPosition === 'number' && cursorPosition >= 0 && cursorPosition <= currentText.length
      ? cursorPosition
      : currentText.length

  const before = currentText.slice(0, cursor)
  const after = currentText.slice(cursor)

  const needsLeadingSpace = before.length > 0 && !/\s$/.test(before)
  const afterStartsWithSpace = /^\s/.test(after)

  const prefix = needsLeadingSpace ? ' ' : ''
  const suffix = afterStartsWithSpace ? '' : ' '

  const insertion = `${prefix}${cleanTag}${suffix}`
  const newText = `${before}${insertion}${after}`
  const newCursor = before.length + insertion.length

  return {
    newText,
    newCursor,
  }
}

function escapeQuoteXml(content: string): string {
  return content.replace(/<\/quote_content>/gi, '<\\/quote_content>')
}

function unescapeQuoteXml(content: string): string {
  return content.replace(/<\\\/quote_content>/gi, '</quote_content>')
}

/**
 * Regex matching serialized <quote_content> blocks.
 */
export const QUOTE_BLOCK_REGEX =
  /<quote_content\s+id="([^"]+)"(?:\s+lines="(\d+)")?(?:\s+chars="(\d+)")?>([\s\S]*?)<\/quote_content>/gi

/**
 * Serializes quote attachments into prompt payload with <quote_content> blocks
 * providing complete contextual grounding for LLMs while allowing clean UI display.
 */
export function serializePromptWithQuotes(
  text: string,
  attachments?: ReadonlyArray<PromptAttachment>
): string {
  const quotes = (attachments || []).filter(isQuoteAttachment)
  if (quotes.length === 0) {
    return text
  }

  const blocks = quotes.map((att) => {
    const qid = (att.pastedId || att.name || DEFAULT_QUOTE_ID).trim()
    const rawContent = att.content || ''
    const stats = getQuoteStats(rawContent)
    const escaped = escapeQuoteXml(rawContent)

    return `<quote_content id="${qid}" lines="${stats.lineCount}" chars="${stats.charCount}">\nThe user quoted the following text:\n@[${qid}]:\n"""\n${escaped}\n"""\n</quote_content>`
  })

  const trimmedText = text.trim()
  if (trimmedText) {
    return `${blocks.join('\n\n')}\n\n${trimmedText}`
  }
  return blocks.join('\n\n')
}

/**
 * Extracts quote blocks from raw prompt text and returns clean user text + parsed quotes.
 */
export function parseQuotesFromText(rawText: string): {
  quotes: ParsedQuoteItem[]
  cleanText: string
} {
  if (!rawText || !rawText.includes('<quote_content')) {
    return { quotes: [], cleanText: rawText || '' }
  }

  const quotes: ParsedQuoteItem[] = []
  let idx = 0

  const cleanText = rawText
    .replace(
      QUOTE_BLOCK_REGEX,
      (_match, rawId: string, rawLines?: string, rawChars?: string, body?: string) => {
        idx += 1
        const quoteId = (rawId || `Quote ${idx}`).trim()
        const unescaped = unescapeQuoteXml(body ?? '')

        // Extract inside content between """ if present, or whole body
        let innerContent = unescaped
        const contentMatch = unescaped.match(/"""\n?([\s\S]*?)\n?"""/)
        if (contentMatch) {
          innerContent = contentMatch[1]
        }

        const stats = getQuoteStats(innerContent)
        quotes.push({
          id: `parsed_quote_${quoteId}_${idx}`,
          quoteId,
          tag: formatQuoteTag(quoteId),
          content: innerContent,
          lineCount: rawLines ? parseInt(rawLines, 10) : stats.lineCount,
          charCount: rawChars ? parseInt(rawChars, 10) : stats.charCount,
        })
        return ''
      }
    )
    .replace(/^\s+/, '')
    .trim()

  return {
    quotes,
    cleanText,
  }
}
