import type { Message, Session, TextPart } from '../types/opencode'

/**
 * Normalizes timestamp into milliseconds (handles seconds vs milliseconds).
 */
export function normalizeTimeMs(time: number | undefined): number {
  if (!time || isNaN(time)) return 0
  return time < 1e11 ? time * 1000 : time
}

/**
 * Formats relative timestamp into clean human-readable string (e.g. 10m ago / 10分钟前).
 */
export function formatSessionRelativeTime(time: number | undefined, isZh = true): string {
  const ms = normalizeTimeMs(time)
  if (!ms) return ''
  const diffSec = Math.floor((Date.now() - ms) / 1000)
  if (diffSec < 60) return isZh ? '刚刚' : 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return isZh ? `${diffMin}分钟前` : `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return isZh ? `${diffHours}小时前` : `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return isZh ? `${diffDays}天前` : `${diffDays}d ago`
  return new Date(ms).toLocaleDateString()
}

export interface ConversationMentionRef {
  rawMention: string
  sessionId: string
}

/**
 * Extracts unique conversation references from text.
 * Matches `@conversation:ses_xxx` or `@conversation/ses_xxx`.
 */
export function extractConversationMentions(text: string): ConversationMentionRef[] {
  if (!text || !text.includes('@conversation')) return []

  const regex = /@conversation[:/]([a-zA-Z0-9_\-]+)/g
  const seen = new Set<string>()
  const results: ConversationMentionRef[] = []

  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const rawMention = match[0]
    const sessionId = match[1]
    if (sessionId && !seen.has(sessionId)) {
      seen.add(sessionId)
      results.push({ rawMention, sessionId })
    }
  }

  return results
}

/**
 * Formats a list of Messages into a clean, concise markdown transcript suitable for context mounting.
 */
export function formatConversationTranscript(
  messages: Message[] = [],
  maxChars = 40000
): string {
  if (!messages || messages.length === 0) {
    return '(No message history in this conversation)'
  }

  const lines: string[] = []

  for (const msg of messages) {
    const role = msg.info?.role === 'user' ? 'User' : 'Assistant'
    const parts = Array.isArray(msg.parts) ? msg.parts : []

    const textPieces: string[] = []
    for (const part of parts) {
      if (part.type === 'text' && typeof (part as TextPart).text === 'string') {
        const t = (part as TextPart).text.trim()
        if (t) textPieces.push(t)
      } else if (part.type === 'tool') {
        const toolName = (part as any).tool || 'tool'
        const state = (part as any).state
        const status = state?.status || 'completed'
        textPieces.push(`[Tool: ${toolName} (${status})]`)
      }
    }

    if (textPieces.length > 0) {
      lines.push(`[${role}]:\n${textPieces.join('\n')}`)
    }
  }

  const joined = lines.join('\n\n')
  if (joined.length <= maxChars) {
    return joined
  }

  // If too long, preserve the head introduction and the most recent tail conversation
  const headSize = Math.floor(maxChars * 0.25)
  const tailSize = Math.floor(maxChars * 0.7)
  const head = joined.slice(0, headSize)
  const tail = joined.slice(joined.length - tailSize)
  return `${head}\n\n... [Middle context truncated to fit prompt budget] ...\n\n${tail}`
}

/**
 * Wraps a conversation transcript in standard XML boundary tags.
 */
export function wrapReferencedConversation(
  session: { id: string; title?: string; directory?: string },
  transcript: string
): string {
  const safeTitle = (session.title || 'Conversation').replace(/[\r\n"<>]/g, ' ')
  const safeDir = session.directory ? ` directory="${session.directory.replace(/[\r\n"<>]/g, ' ')}"` : ''
  return `<referenced_conversation id="${session.id}" title="${safeTitle}"${safeDir}>\n${transcript}\n</referenced_conversation>`
}

export interface ParsedReferencedConversation {
  sessionId: string
  title: string
  directory?: string
  content: string
  rawBlock: string
}

/**
 * Parses out <referenced_conversation> XML blocks from a message text.
 * Returns clean user prompt text and array of parsed referenced conversation blocks.
 */
export function parseReferencedConversationsFromText(text: string): {
  cleanText: string
  references: ParsedReferencedConversation[]
} {
  if (!text || !text.includes('<referenced_conversation')) {
    return { cleanText: text || '', references: [] }
  }

  const regex = /<referenced_conversation\s+id="([^"]+)"(?:\s+title="([^"]*)")?(?:\s+directory="([^"]*)")?>([\s\S]*?)<\/referenced_conversation>/g
  const references: ParsedReferencedConversation[] = []

  let clean = text
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const rawBlock = match[0]
    const sessionId = match[1] || ''
    const title = match[2] || 'Referenced Conversation'
    const directory = match[3] || undefined
    const content = (match[4] || '').trim()

    references.push({
      sessionId,
      title,
      directory,
      content,
      rawBlock,
    })
  }

  // Remove the referenced conversation blocks from clean text
  clean = clean.replace(regex, '').trim()

  return { cleanText: clean, references }
}

/**
 * Resolves all @conversation mentions in a prompt draft.
 * Fetches the transcript for each referenced session, formats it, and mounts it into the final prompt text.
 */
export async function resolvePromptWithConversationMentions(
  text: string,
  sessions: readonly Session[] = [],
  fetchMessages: (sessionId: string) => Promise<Message[]>
): Promise<{ resolvedText: string; mountedCount: number }> {
  const mentions = extractConversationMentions(text)
  if (mentions.length === 0) {
    return { resolvedText: text, mountedCount: 0 }
  }

  const blocks: string[] = []

  for (const mention of mentions) {
    const matchedSession = sessions.find((s) => s.id === mention.sessionId) || {
      id: mention.sessionId,
      title: `Conversation ${mention.sessionId}`,
      directory: undefined,
    }

    try {
      const messages = await fetchMessages(mention.sessionId)
      const transcript = formatConversationTranscript(messages)
      const block = wrapReferencedConversation(matchedSession, transcript)
      blocks.push(block)
    } catch (err) {
      console.warn(`[ConversationMention] Failed to fetch messages for session ${mention.sessionId}:`, err)
      const fallbackBlock = wrapReferencedConversation(
        matchedSession,
        '(Referenced conversation transcript could not be loaded)'
      )
      blocks.push(fallbackBlock)
    }
  }

  const mountedPrefix = blocks.join('\n\n')
  const resolvedText = mountedPrefix ? `${mountedPrefix}\n\n${text}` : text

  return {
    resolvedText,
    mountedCount: blocks.length,
  }
}
