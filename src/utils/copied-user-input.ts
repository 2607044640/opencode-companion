import type { Message, FilePart, TextPart, PromptAttachment } from '../types/opencode'
import {
  isPastedAttachment,
  isImageAttachment,
  createPastedAttachment,
  parsePastedSnippetsFromText,
  getNextPastedId,
  formatPastedSnippetCursorPlaceholder,
} from './pasted-snippets'
import { parseQuotesFromText } from './quote'

export interface CopiedUserInputSnapshot {
  messageId?: string
  /** The clean prompt text (e.g. "Check this: [Here, user inserted p1 text]") */
  displayText: string
  /** The full text from the message parts */
  fullText: string
  /** The exact text copied to the clipboard */
  copiedText: string
  /** All associated attachments (p1, images, quotes) in exact order */
  attachments: PromptAttachment[]
  /** Timestamp when copied */
  timestamp: number
}

// In-memory singletons for copied user messages and sent attachments
let currentCopiedUserInput: CopiedUserInputSnapshot | null = null
const recentCopiedUserInputs: CopiedUserInputSnapshot[] = []
const sentAttachmentsByMessageId = new Map<string, PromptAttachment[]>()
const sentAttachmentsByText = new Map<string, PromptAttachment[]>()

/**
 * Normalizes text for comparison by trimming and normalizing CRLF to LF.
 */
export function normalizeCopyText(text: string): string {
  if (typeof text !== 'string') return ''
  return text.replace(/\r\n/g, '\n').trim()
}

/**
 * Registers the attachments associated with a user message when it is sent or queued,
 * ensuring 100% exact original attachment ordering is preserved.
 */
export function registerSentMessageAttachments(
  textOrId: string,
  attachments: ReadonlyArray<PromptAttachment>,
  messageId?: string
): void {
  if (!attachments || attachments.length === 0) return
  const cloned = attachments.map((a) => ({ ...a }))

  if (messageId) {
    sentAttachmentsByMessageId.set(messageId, cloned)
  }
  const norm = normalizeCopyText(textOrId)
  if (norm) {
    sentAttachmentsByText.set(norm, cloned)
  }
}

/**
 * Reconstructs or retrieves attachments (p1 snippets, images, quotes) belonging to a user message.
 */
export function extractAttachmentsFromUserMessage(
  message?: Message | null,
  fallbackFullText?: string
): PromptAttachment[] {
  if (!message && !fallbackFullText) return []

  const msgId = message?.info?.id
  if (msgId && sentAttachmentsByMessageId.has(msgId)) {
    return sentAttachmentsByMessageId.get(msgId)!.map((a) => ({ ...a }))
  }

  // Extract text and file parts from message
  const textParts = message ? (message.parts.filter((p) => p.type === 'text') as TextPart[]) : []
  const fileParts = message ? (message.parts.filter((p) => p.type === 'file') as FilePart[]) : []

  const joinedText =
    textParts.length > 0
      ? textParts.map((p) => p.text).join('\n\n')
      : fallbackFullText || ''

  const norm = normalizeCopyText(joinedText)
  if (norm && sentAttachmentsByText.has(norm)) {
    return sentAttachmentsByText.get(norm)!.map((a) => ({ ...a }))
  }

  // Fallback reconstruction from raw parts
  const { snippets, cleanText } = parsePastedSnippetsFromText(joinedText)
  const { quotes } = parseQuotesFromText(cleanText)

  const pastedAttachments: PromptAttachment[] = []
  for (const s of snippets) {
    pastedAttachments.push(
      createPastedAttachment(s.content, pastedAttachments, s.pastedId)
    )
  }

  const imageAttachments: PromptAttachment[] = fileParts.map((f, idx) => ({
    id: f.id || `img_${Date.now()}_${idx}`,
    name: f.filename || `image_${idx + 1}.png`,
    mime: f.mime || 'image/png',
    url: f.url,
    kind: 'image',
  }))

  const quoteAttachments: PromptAttachment[] = quotes.map((q) => ({
    id: q.id,
    pastedId: q.quoteId,
    name: q.quoteId,
    mime: 'text/x-quote-snippet',
    url: '',
    content: q.content,
    kind: 'quote',
  }))

  // Determine order: if pasted snippet placeholder appears before images, keep p1 then images;
  // otherwise keep p1 then images as requested (连带 p1（如有），图片（如有）也都一连并都粘贴上去（顺序也要一样哈）)
  return [...pastedAttachments, ...imageAttachments, ...quoteAttachments]
}

/**
 * Records a user message copy event, preserving the text placed on the clipboard
 * and its associated attachments for automatic restoration on paste.
 */
export function recordCopiedUserInput(params: {
  message?: Message
  displayText?: string
  fullText?: string
  copiedText?: string
  attachments?: PromptAttachment[]
  messageId?: string
}): CopiedUserInputSnapshot {
  const messageId = params.messageId || params.message?.info?.id
  const fullText = params.fullText || (params.message ? params.message.parts.filter((p) => p.type === 'text').map((p) => (p as TextPart).text).join('\n\n') : '')
  const displayText = params.displayText || fullText
  const copiedText = params.copiedText || displayText || fullText

  const attachments =
    params.attachments && params.attachments.length > 0
      ? params.attachments.map((a) => ({ ...a }))
      : extractAttachmentsFromUserMessage(params.message, fullText)

  const snapshot: CopiedUserInputSnapshot = {
    messageId,
    displayText,
    fullText,
    copiedText,
    attachments,
    timestamp: Date.now(),
  }

  currentCopiedUserInput = snapshot

  // Keep up to 20 recent snapshots
  recentCopiedUserInputs.unshift(snapshot)
  if (recentCopiedUserInputs.length > 20) {
    recentCopiedUserInputs.pop()
  }

  if (messageId && attachments.length > 0) {
    sentAttachmentsByMessageId.set(messageId, attachments)
  }
  if (displayText && attachments.length > 0) {
    sentAttachmentsByText.set(normalizeCopyText(displayText), attachments)
  }
  if (copiedText && attachments.length > 0) {
    sentAttachmentsByText.set(normalizeCopyText(copiedText), attachments)
  }

  return snapshot
}

/**
 * Returns the currently active copied user input snapshot, if any.
 */
export function getCopiedUserInput(): CopiedUserInputSnapshot | null {
  return currentCopiedUserInput
}

/**
 * Clears the active copied user input memory (useful in tests).
 */
export function clearCopiedUserInputMemory(): void {
  currentCopiedUserInput = null
  recentCopiedUserInputs.length = 0
  sentAttachmentsByMessageId.clear()
  sentAttachmentsByText.clear()
}

export interface MatchedCopiedUserInputResult {
  matched: boolean
  /** Clean prompt text to insert into textarea */
  text: string
  /** The restored attachments (p1, images) */
  attachments: PromptAttachment[]
  messageId?: string
}

/**
 * Detects if the pasted text exactly matches a copied user input segment
 * (from the copy memory or historical messages), and returns the associated attachments.
 */
export function matchCopiedUserInput(
  pastedText: string,
  messages?: ReadonlyArray<Message>
): MatchedCopiedUserInputResult | null {
  const normPasted = normalizeCopyText(pastedText)
  if (!normPasted) return null

  // 1. Check currentCopiedUserInput
  if (currentCopiedUserInput && currentCopiedUserInput.attachments.length > 0) {
    const normCopied = normalizeCopyText(currentCopiedUserInput.copiedText)
    const normDisplay = normalizeCopyText(currentCopiedUserInput.displayText)
    const normFull = normalizeCopyText(currentCopiedUserInput.fullText)

    if (normPasted === normCopied || normPasted === normDisplay || normPasted === normFull) {
      return {
        matched: true,
        text: currentCopiedUserInput.displayText || currentCopiedUserInput.copiedText || pastedText,
        attachments: currentCopiedUserInput.attachments.map((a) => ({ ...a })),
        messageId: currentCopiedUserInput.messageId,
      }
    }
  }

  // 2. Check recent copied snapshots
  for (const item of recentCopiedUserInputs) {
    if (item.attachments.length === 0) continue
    const normCopied = normalizeCopyText(item.copiedText)
    const normDisplay = normalizeCopyText(item.displayText)
    const normFull = normalizeCopyText(item.fullText)

    if (normPasted === normCopied || normPasted === normDisplay || normPasted === normFull) {
      return {
        matched: true,
        text: item.displayText || item.copiedText || pastedText,
        attachments: item.attachments.map((a) => ({ ...a })),
        messageId: item.messageId,
      }
    }
  }

  // 3. Check registered sent attachments by exact text match
  if (sentAttachmentsByText.has(normPasted)) {
    const atts = sentAttachmentsByText.get(normPasted)!
    if (atts.length > 0) {
      return {
        matched: true,
        text: pastedText,
        attachments: atts.map((a) => ({ ...a })),
      }
    }
  }

  // 4. Check historical user messages in active session (newest to oldest)
  if (messages && messages.length > 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.info?.role !== 'user') continue

      const rawTextParts = msg.parts
        .filter((p) => p.type === 'text')
        .map((p) => (p as TextPart).text)
      const fullText = rawTextParts.join('\n\n')
      const { cleanText } = parsePastedSnippetsFromText(fullText)

      const normClean = normalizeCopyText(cleanText)
      const normFull = normalizeCopyText(fullText)

      if (normPasted === normClean || normPasted === normFull) {
        const atts = extractAttachmentsFromUserMessage(msg, fullText)
        if (atts.length > 0) {
          return {
            matched: true,
            text: cleanText || pastedText,
            attachments: atts,
            messageId: msg.info?.id,
          }
        }
      }
    }
  }

  return null
}

export interface MergePastedUserInputResult {
  attachments: PromptAttachment[]
  text: string
}

/**
 * Merges incoming attachments from a copied user input into existing composer attachments,
 * avoiding duplicate images, cleanly resolving pasted snippet ID collisions (e.g. p1 -> p2),
 * and updating any [Here, user inserted p1 text] markers accordingly.
 */
export function mergePastedUserInputAttachments(
  incomingAttachments: ReadonlyArray<PromptAttachment>,
  existingAttachments: ReadonlyArray<PromptAttachment> = [],
  text: string = ''
): MergePastedUserInputResult {
  if (!incomingAttachments || incomingAttachments.length === 0) {
    return { attachments: [...existingAttachments], text }
  }

  const resultAttachments: PromptAttachment[] = [...existingAttachments]
  let updatedText = text

  for (const inc of incomingAttachments) {
    if (isPastedAttachment(inc)) {
      const existingSameId = resultAttachments.find(
        (a) => isPastedAttachment(a) && (a.pastedId || '').toLowerCase() === (inc.pastedId || 'p1').toLowerCase()
      )

      if (existingSameId) {
        if (existingSameId.content === inc.content) {
          // Exactly the same snippet content: reuse without duplicating
          continue
        }

        // Collision with different content: allocate next available pX
        const newPastedId = getNextPastedId(resultAttachments)
        const oldId = (inc.pastedId || 'p1').toLowerCase()
        const oldPlaceholder = formatPastedSnippetCursorPlaceholder(oldId)
        const newPlaceholder = formatPastedSnippetCursorPlaceholder(newPastedId)

        // Replace marker in the text
        if (updatedText.includes(oldPlaceholder)) {
          updatedText = updatedText.replaceAll(oldPlaceholder, newPlaceholder)
        }

        const newAttachment: PromptAttachment = {
          ...inc,
          id: `paste_${Date.now()}_${newPastedId}_${Math.random().toString(36).slice(2, 6)}`,
          pastedId: newPastedId,
          name: newPastedId,
        }
        resultAttachments.push(newAttachment)
      } else {
        // No collision: append with fresh unique ID
        const targetId = (inc.pastedId || getNextPastedId(resultAttachments)).toLowerCase()
        const newAttachment: PromptAttachment = {
          ...inc,
          id: `paste_${Date.now()}_${targetId}_${Math.random().toString(36).slice(2, 6)}`,
          pastedId: targetId,
          name: targetId,
        }
        resultAttachments.push(newAttachment)
      }
    } else if (isImageAttachment(inc)) {
      // Avoid duplicate identical image URLs
      const exists = resultAttachments.some(
        (a) => isImageAttachment(a) && a.url && a.url === inc.url
      )
      if (!exists) {
        resultAttachments.push({
          ...inc,
          id: `img_${Date.now()}_${resultAttachments.length}_${Math.random().toString(36).slice(2, 6)}`,
        })
      }
    } else {
      // Other attachment kinds (quotes, etc.)
      resultAttachments.push({
        ...inc,
        id: `att_${Date.now()}_${resultAttachments.length}_${Math.random().toString(36).slice(2, 6)}`,
      })
    }
  }

  return {
    attachments: resultAttachments,
    text: updatedText,
  }
}
