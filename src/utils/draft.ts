import type { Message, TextPart, FilePart } from '../types/opencode'
import type { PromptAttachment } from '../hooks/useChatStream'
import { createPastedAttachment, parsePastedSnippetsFromText } from './pasted-snippets'

export function extractDraftFromMessage(message: Message): { text: string; attachments: PromptAttachment[] } {
  const textParts = message.parts.filter((p): p is TextPart => p.type === 'text')
  const fileParts = message.parts.filter((p): p is FilePart => p.type === 'file')

  const rawJoined = textParts.map((p) => p.text).join('\n').trim()
  const { snippets, cleanText } = parsePastedSnippetsFromText(rawJoined)

  const imageAttachments: PromptAttachment[] = fileParts.map((f) => ({
    name: f.filename || 'attachment',
    mime: f.mime,
    url: f.url,
  }))

  const pastedAttachments: PromptAttachment[] = []
  for (const s of snippets) {
    pastedAttachments.push(createPastedAttachment(s.content, pastedAttachments, s.pastedId))
  }

  return {
    text: cleanText,
    attachments: [...imageAttachments, ...pastedAttachments],
  }
}
