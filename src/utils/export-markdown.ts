import type { Message, Session, TextPart } from '../types/opencode'
import { formatUserMessageTime } from '../components/chat/MessageBubble'

export interface MarkdownExportOptions {
  includeReasoning?: boolean
  includeTimestamps?: boolean
}

/**
 * Extracts clean user prompts from a session's messages list.
 */
export function extractSessionPrompts(messages: Message[] = []): string[] {
  const prompts: string[] = []
  for (const m of messages) {
    if (m.info?.role === 'user' && Array.isArray(m.parts)) {
      const texts = m.parts
        .filter((p): p is TextPart => p.type === 'text' && typeof (p as any).text === 'string')
        .map((p) => p.text.trim())
        .filter(Boolean)
      if (texts.length > 0) {
        prompts.push(texts.join('\n\n'))
      }
    }
  }
  return prompts
}

/**
 * Formats a session and its messages into clean, well-structured GitHub-flavored Markdown.
 */
export function exportSessionToMarkdown(
  session: Session | null | undefined,
  messages: Message[] = [],
  options: MarkdownExportOptions = {}
): string {
  const { includeReasoning = false, includeTimestamps = true } = options
  const title = session?.title?.trim() || 'OpenCode Conversation'
  const sessionId = session?.id || ''
  const directory = session?.directory || ''
  const createdMs = session?.time?.created ? (session.time.created < 1e11 ? session.time.created * 1000 : session.time.created) : Date.now()
  const exportDateStr = new Date(createdMs).toLocaleString()

  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push('')
  lines.push('> **OpenCode Companion Conversation Export**')
  if (sessionId) lines.push(`> - **Session ID:** \`${sessionId}\``)
  if (directory) lines.push(`> - **Directory:** \`${directory}\``)
  if (includeTimestamps) lines.push(`> - **Date:** ${exportDateStr}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const m of messages) {
    const role = m.info?.role
    if (role === 'system') continue

    const timestampStr = includeTimestamps && m.info?.time?.created ? formatUserMessageTime(m.info.time.created) : ''

    if (role === 'user') {
      const header = timestampStr ? `### 👤 User (${timestampStr})` : '### 👤 User'
      lines.push(header)
      lines.push('')

      const textParts = (m.parts || [])
        .filter((p): p is TextPart => p.type === 'text' && typeof (p as any).text === 'string')
        .map((p) => p.text.trim())
        .filter(Boolean)

      if (textParts.length > 0) {
        lines.push(textParts.join('\n\n'))
      } else {
        lines.push('*(No text)*')
      }
      lines.push('')
      lines.push('---')
      lines.push('')
    } else if (role === 'assistant') {
      const agent = m.info?.agent || 'Assistant'
      const model = m.info?.modelID || session?.model?.id || ''
      const authorInfo = model ? `${agent} · ${model}` : agent
      const header = timestampStr ? `### 🤖 ${authorInfo} (${timestampStr})` : `### 🤖 ${authorInfo}`
      lines.push(header)
      lines.push('')

      // Optional reasoning
      if (includeReasoning) {
        const reasoningParts = (m.parts || [])
          .filter((p) => p.type === 'reasoning' && typeof (p as any).text === 'string')
          .map((p) => (p as any).text.trim())
          .filter(Boolean)

        if (reasoningParts.length > 0) {
          lines.push('<details><summary>Thinking Process</summary>')
          lines.push('')
          lines.push(reasoningParts.join('\n\n'))
          lines.push('')
          lines.push('</details>')
          lines.push('')
        }
      }

      // Main answer text
      const textParts = (m.parts || [])
        .filter((p): p is TextPart => p.type === 'text' && typeof (p as any).text === 'string')
        .map((p) => p.text.trim())
        .filter(Boolean)

      if (textParts.length > 0) {
        lines.push(textParts.join('\n\n'))
      } else {
        lines.push('*(No text response)*')
      }
      lines.push('')
      lines.push('---')
      lines.push('')
    }
  }

  return lines.join('\n').trim() + '\n'
}

/**
 * Downloads a text content string as a file in the browser.
 */
export function downloadTextFile(filename: string, content: string, mimeType = 'text/markdown;charset=utf-8') {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
