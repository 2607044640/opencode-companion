import type { PromptAttachment } from '../types/opencode'

export const DEFAULT_PASTE_CHAR_THRESHOLD = 600
export const DEFAULT_PASTE_LINE_THRESHOLD = 10
export const PASTED_SNIPPET_MIME = 'text/x-pasted-snippet'

export interface PastedSnippetStats {
  charCount: number
  lineCount: number
  byteSize: number
  formattedSize: string
  previewText: string
  lines: Array<{ lineNo: string; text: string }>
}

export interface ParsedPastedSnippet {
  id: string
  pastedId: string
  content: string
  lineCount: number
  charCount: number
  formattedSize: string
}

/**
 * Checks whether a PromptAttachment represents a pasted text snippet (p1, p2, ...).
 */
export function isPastedAttachment(att?: PromptAttachment | null): boolean {
  if (!att) return false
  return (
    att.kind === 'pasted' ||
    att.mime === PASTED_SNIPPET_MIME ||
    Boolean(att.pastedId && typeof att.content === 'string')
  )
}

/**
 * Checks whether a PromptAttachment represents an image attachment.
 */
export function isImageAttachment(att?: PromptAttachment | null): boolean {
  if (!att) return false
  if (isPastedAttachment(att)) return false
  return typeof att.mime === 'string' && att.mime.startsWith('image/') && Boolean(att.url)
}

/**
 * Determines whether pasted plain text should be converted into a numbered PASTED card (p1, p2...).
 */
export function shouldConvertToPastedSnippet(
  text: string,
  options?: {
    charThreshold?: number
    lineThreshold?: number
    enabled?: boolean
  }
): boolean {
  if (options?.enabled === false) return false
  if (!text || typeof text !== 'string') return false

  const normalized = text.replace(/\r\n/g, '\n')
  const trimmed = normalized.trim()
  if (!trimmed) return false

  const charThreshold = options?.charThreshold ?? DEFAULT_PASTE_CHAR_THRESHOLD
  const lineThreshold = options?.lineThreshold ?? DEFAULT_PASTE_LINE_THRESHOLD

  if (normalized.length >= charThreshold) return true

  const lineCount = normalized.split('\n').length
  if (lineCount >= lineThreshold) return true

  return false
}

/**
 * Allocates the next sequential pasted ID ('p1', 'p2', 'p3'...) based on existing attachments.
 * Reuses the lowest available index if earlier snippets were removed.
 */
export function getNextPastedId(
  existingAttachments: ReadonlyArray<PromptAttachment> = []
): string {
  const usedNumbers = new Set<number>()
  for (const att of existingAttachments) {
    if (!isPastedAttachment(att)) continue
    const rawId = att.pastedId || att.name || ''
    const match = rawId.match(/^p(\d+)$/i)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > 0) usedNumbers.add(num)
    }
  }

  let candidate = 1
  while (usedNumbers.has(candidate)) {
    candidate += 1
  }
  return `p${candidate}`
}

/**
 * Computes line count, UTF-8 byte size, human-readable size (KB/B), and 4-line card preview.
 */
export function getPastedSnippetStats(content: string): PastedSnippetStats {
  const safeContent = typeof content === 'string' ? content : ''
  const normalized = safeContent.replace(/\r\n/g, '\n')
  const rawLines = normalized.length > 0 ? normalized.split('\n') : ['']
  const lineCount = normalized.length > 0 ? rawLines.length : 0
  const charCount = safeContent.length

  let byteSize = charCount
  try {
    if (typeof TextEncoder !== 'undefined') {
      byteSize = new TextEncoder().encode(safeContent).length
    }
  } catch {
    // Fallback to charCount
  }

  const formattedSize =
    byteSize >= 1024
      ? `${(byteSize / 1024).toFixed(2)} KB`
      : `${byteSize} B`

  const nonEmptyLines = rawLines
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5)
  const previewJoined = nonEmptyLines.join(' ')
  const previewText =
    previewJoined.length > 140
      ? `${previewJoined.slice(0, 140)}...`
      : previewJoined

  const lines = rawLines.map((text, idx) => ({
    lineNo: String(idx + 1),
    text,
  }))

  return {
    charCount,
    lineCount,
    byteSize,
    formattedSize,
    previewText,
    lines,
  }
}

/**
 * Creates a PromptAttachment representing a pasted text snippet.
 */
export function createPastedAttachment(
  content: string,
  existingAttachments: ReadonlyArray<PromptAttachment> = [],
  explicitPastedId?: string
): PromptAttachment {
  const pastedId = (explicitPastedId || getNextPastedId(existingAttachments)).toLowerCase()
  return {
    id: `paste_${Date.now()}_${pastedId}_${Math.random().toString(36).slice(2, 7)}`,
    kind: 'pasted',
    pastedId,
    name: pastedId,
    mime: PASTED_SNIPPET_MIME,
    url: '',
    content,
  }
}

function escapeClosingTag(content: string): string {
  return content.replace(/<\/pasted_content>/gi, '<\\/pasted_content>')
}

function unescapeClosingTag(content: string): string {
  return content.replace(/<\\\/pasted_content>/gi, '</pasted_content>')
}

/**
 * Serializes pasted snippet attachments and user prompt text into a single text payload
 * with <pasted_content id="p1" ...> blocks so any LLM natively understands "p1", "p2".
 */
export function serializePromptWithPastedSnippets(
  text: string,
  attachments?: ReadonlyArray<PromptAttachment>
): string {
  const pastedList = (attachments || []).filter(isPastedAttachment)
  if (pastedList.length === 0) {
    return text
  }

  const blocks = pastedList.map((att, idx) => {
    const pid = (att.pastedId || att.name || `p${idx + 1}`).toLowerCase()
    const rawContent = att.content || ''
    const stats = getPastedSnippetStats(rawContent)
    const escaped = escapeClosingTag(rawContent)
    return `<pasted_content id="${pid}" lines="${stats.lineCount}" chars="${stats.charCount}" size="${stats.formattedSize}">\n${escaped}\n</pasted_content>`
  })

  const trimmedText = text.trim()
  if (trimmedText) {
    return `${blocks.join('\n\n')}\n\n${trimmedText}`
  }
  return blocks.join('\n\n')
}

const PASTED_BLOCK_REGEX =
  /<pasted_content\s+id="([^"]+)"(?:\s+lines="(\d+)")?(?:\s+chars="(\d+)")?(?:\s+size="([^"]+)")?[^>]*>\r?\n?([\s\S]*?)\r?\n?<\/pasted_content>/gi

/**
 * Parses <pasted_content id="p1" ...> blocks from a stored or optimistic user message text.
 * Returns extracted snippets and the remaining clean user prompt text.
 */
export function parsePastedSnippetsFromText(rawText: string): {
  snippets: ParsedPastedSnippet[]
  cleanText: string
} {
  if (!rawText || !rawText.includes('<pasted_content')) {
    return { snippets: [], cleanText: rawText || '' }
  }

  const snippets: ParsedPastedSnippet[] = []
  let idx = 0

  const cleanText = rawText
    .replace(
      PASTED_BLOCK_REGEX,
      (_fullMatch, rawId: string, rawLines?: string, rawChars?: string, rawSize?: string, body?: string) => {
        idx += 1
        const pastedId = (rawId || `p${idx}`).toLowerCase()
        const content = unescapeClosingTag(body ?? '')
        const stats = getPastedSnippetStats(content)
        snippets.push({
          id: `parsed_${pastedId}_${idx}`,
          pastedId,
          content,
          lineCount: rawLines ? parseInt(rawLines, 10) : stats.lineCount,
          charCount: rawChars ? parseInt(rawChars, 10) : stats.charCount,
          formattedSize: rawSize || stats.formattedSize,
        })
        return ''
      }
    )
    .replace(/^\s+/, '')
    .trim()

  return {
    snippets,
    cleanText,
  }
}
