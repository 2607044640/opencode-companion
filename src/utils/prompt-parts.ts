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

function extractUserMessageText(msg: Message): string {
  return msg.parts
    .filter((pt): pt is TextPart => pt.type === 'text')
    .map((pt) => pt.text)
    .join('\n')
    .trim()
}

/**
 * Resolves session message history against previous local state.
 * Prevents wiping active optimistic parts if backend history has not yet materialized them.
 *
 * CRITICAL INVARIANT:
 * File parts from an older historical turn MUST NEVER be leaked into a subsequent
 * user message turn. Only pending optimistic user messages that explicitly contain
 * optimistic file parts may reconcile into their corresponding backend message.
 */
export function reconcileHistoryWithOptimistic(
  history: Message[],
  prev: Message[]
): Message[] {
  // If backend history is still empty (in-flight new prompt), retain current timeline
  if (history.length === 0 && prev.length > 0) {
    return prev
  }

  if (history.length === 0 || prev.length === 0) {
    return history
  }

  // Identify only candidate messages in `prev` that contain active optimistic file parts.
  // Historical settled messages (whose ID is already in backend history and have no optimistic parts)
  // must NEVER donate their file parts to any other message.
  const historyIds = new Set(history.map((h) => h.info.id))

  interface PendingOptimisticFileDonor {
    donorMsg: Message
    fileParts: FilePart[]
    text: string
  }

  const optimisticDonors: PendingOptimisticFileDonor[] = []

  for (const prevMsg of prev) {
    if (prevMsg.info.role !== 'user') continue

    // A message is a donor only if it has file parts marked as optimistic,
    // OR if its message ID is not yet in backend history (i.e. in-flight client-generated ID)
    const isUnsettled = !historyIds.has(prevMsg.info.id)
    const fileParts = prevMsg.parts.filter(
      (pt): pt is FilePart =>
        pt.type === 'file' && (Boolean((pt as any).isOptimistic) || isUnsettled)
    )

    if (fileParts.length > 0) {
      optimisticDonors.push({
        donorMsg: prevMsg,
        fileParts,
        text: extractUserMessageText(prevMsg),
      })
    }
  }

  if (optimisticDonors.length === 0) {
    return history
  }

  // Map each history message to matching donor (at most one donor per history message)
  const matchedDonorIndices = new Set<number>()

  return history.map((hMsg) => {
    if (hMsg.info.role !== 'user') return hMsg

    // If backend message already has file parts populated, no reconciliation needed
    const hasFiles = hMsg.parts.some((pt) => pt.type === 'file')
    if (hasFiles) return hMsg

    const hText = extractUserMessageText(hMsg)

    // Find the matching donor:
    // 1. Direct ID match (if prev optimistic message had the same ID)
    // 2. Or text content match for an unsettled optimistic message
    let matchedDonorIdx = -1

    for (let i = 0; i < optimisticDonors.length; i++) {
      if (matchedDonorIndices.has(i)) continue
      const donor = optimisticDonors[i]

      if (donor.donorMsg.info.id === hMsg.info.id) {
        matchedDonorIdx = i
        break
      }

      // If donor is unsettled (client temporary ID), match on exact text
      // (or both empty for image-only prompts)
      if (
        !historyIds.has(donor.donorMsg.info.id) &&
        donor.text === hText
      ) {
        matchedDonorIdx = i
        break
      }
    }

    if (matchedDonorIdx >= 0) {
      matchedDonorIndices.add(matchedDonorIdx)
      const donor = optimisticDonors[matchedDonorIdx]
      return {
        ...hMsg,
        parts: [
          ...donor.fileParts.map((fp) => ({ ...fp, messageID: hMsg.info.id })),
          ...hMsg.parts,
        ],
      }
    }

    return hMsg
  })
}
