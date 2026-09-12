import type { Message, TextPart, FilePart } from '../types/opencode'
import type { PromptAttachment } from '../hooks/useChatStream'

export function extractDraftFromMessage(message: Message): { text: string; attachments: PromptAttachment[] } {
  const textParts = message.parts.filter((p): p is TextPart => p.type === 'text')
  const fileParts = message.parts.filter((p): p is FilePart => p.type === 'file')

  return {
    text: textParts.map((p) => p.text).join('\n').trim(),
    attachments: fileParts.map((f) => ({
      name: f.filename || 'attachment',
      mime: f.mime,
      url: f.url,
    })),
  }
}
