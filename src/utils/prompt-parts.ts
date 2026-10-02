import type {
  Message,
  MessagePart,
  MessagePartInput,
  PromptAttachment,
  FilePart,
  TextPart,
  SessionModel,
} from '../types/opencode'

/**
 * Builds canonical MessagePartInput[] payload for OpenCode backend.
 * Single source of truth for converting prompt text and attachments.
 */
export function buildPromptParts(
  input: string | MessagePartInput[],
  attachments?: PromptAttachment[]
): MessagePartInput[] {
  const parts: MessagePartInput[] = []

  if (typeof input === 'string') {
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        if (att.url) {
          parts.push({
            type: 'file',
            mime: att.mime || 'image/png',
            filename: att.name || 'image.png',
            url: att.url,
          })
        }
      }
    }
    const trimmed = input.trim()
    if (trimmed) {
      parts.push({ type: 'text', text: trimmed })
    } else if (parts.length === 0) {
      parts.push({ type: 'text', text: input })
    }
    return parts
  }

  // Input is already MessagePartInput[]
  const combined = [...input]
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (!att.url) continue
      const exists = combined.some(
        (p) => p.type === 'file' && (p as any).url === att.url
      )
      if (!exists) {
        combined.unshift({
          type: 'file',
          mime: att.mime || 'image/png',
          filename: att.name || 'image.png',
          url: att.url,
        })
      }
    }
  }
  return combined
}

export interface BuildOptimisticMessageParams {
  sessionId: string
  text: string
  attachments?: PromptAttachment[]
  agent?: string
  model?: { providerID: string; modelID: string } | SessionModel
}

/**
 * Builds an optimistic user message containing optimistic file and text parts
 * to display immediately in the chat timeline while backend requests are in-flight.
 */
export function buildOptimisticMessage(params: {
  sessionId: string
  text: string
  attachments?: PromptAttachment[]
  agent?: string
  model?: any
}): Message {
  const userMsgId = `usr_${Date.now()}`
  const optimisticParts: MessagePart[] = []

  if (params.attachments && params.attachments.length > 0) {
    params.attachments.forEach((att, idx) => {
      optimisticParts.push({
        id: `prt_${Date.now()}_att_${idx}`,
        sessionID: params.sessionId,
        messageID: userMsgId,
        type: 'file',
        mime: att.mime || 'image/png',
        filename: att.name || 'image.png',
        url: att.url,
        isOptimistic: true,
      } as FilePart)
    })
  }

  const trimmedText = params.text.trim()
  if (trimmedText) {
    optimisticParts.push({
      id: `prt_${Date.now()}_txt`,
      sessionID: params.sessionId,
      messageID: userMsgId,
      type: 'text',
      text: trimmedText,
      isOptimistic: true,
    } as TextPart)
  }

  return {
    info: {
      id: userMsgId,
      sessionID: params.sessionId,
      role: 'user',
      time: { created: Date.now() },
      ...(params.agent ? { agent: params.agent } : {}),
      ...(params.model ? { model: params.model } : {}),
    },
    parts: optimisticParts,
  }
}

/**
 * Resolves session message history against previous local state.
 * Prevents wiping active optimistic parts if backend history has not yet materialized them.
 */
export function reconcileHistoryWithOptimistic(
  history: Message[],
  prev: Message[]
): Message[] {
  // If backend history is still empty (in-flight new prompt), retain current timeline
  if (history.length === 0 && prev.length > 0) {
    return prev
  }

  // If backend returned history, merge optimistic file parts into the user message
  // if backend hasn't populated them yet
  if (history.length > 0 && prev.length > 0) {
    const prevOptimistic = prev.find(
      (p) => p.info.role === 'user' && p.parts.some((pt) => pt.type === 'file')
    )
    if (prevOptimistic) {
      const fileParts = prevOptimistic.parts.filter((pt) => pt.type === 'file')
      if (fileParts.length > 0) {
        return history.map((hMsg) => {
          if (hMsg.info.role === 'user' && !hMsg.parts.some((pt) => pt.type === 'file')) {
            return {
              ...hMsg,
              parts: [
                ...fileParts.map((fp) => ({ ...fp, messageID: hMsg.info.id })),
                ...hMsg.parts,
              ],
            }
          }
          return hMsg
        })
      }
    }
  }

  return history
}
