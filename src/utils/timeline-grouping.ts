import type { Message, MessageInfo } from '../types/opencode'

export interface GroupedUserMessage {
  type: 'user'
  message: Message
  index: number
}

export interface GroupedSystemMessage {
  type: 'system'
  message: Message
  index: number
}

export interface GroupedAssistantMessage {
  type: 'assistant'
  messages: Message[]
  primaryMessage: Message
  allMessageIds: string[]
  compositeMessage: Message
  index: number
}

export type GroupedTimelineItem =
  | GroupedUserMessage
  | GroupedAssistantMessage
  | GroupedSystemMessage

/**
 * Groups contiguous assistant messages following a user turn into a single composite turn.
 * This prevents fragmented "Worked for xx s" bubbles by consolidating all tool executions,
 * intermediate thoughts, and the final response under a single unified assistant bubble.
 */
export function groupTimelineMessages(
  messages: Message[],
  revertMessageId?: string
): GroupedTimelineItem[] {
  const items: GroupedTimelineItem[] = []
  let currentAssistantMessages: Message[] = []
  let assistantStartIndex = -1

  const flushAssistant = () => {
    if (currentAssistantMessages.length === 0) return

    const first = currentAssistantMessages[0]
    const last = currentAssistantMessages[currentAssistantMessages.length - 1]
    const compositeParts = currentAssistantMessages.flatMap((m) => m.parts)
    const allMessageIds = currentAssistantMessages.map((m) => m.info.id)

    // Aggregate tokens across all assistant turns in this interaction
    let inputTokens = 0
    let outputTokens = 0
    let reasoningTokens = 0
    let cacheRead = 0
    let cacheWrite = 0
    let totalCost = 0

    for (const m of currentAssistantMessages) {
      if (m.info.tokens) {
        inputTokens += m.info.tokens.input || 0
        outputTokens += m.info.tokens.output || 0
        reasoningTokens += m.info.tokens.reasoning || 0
        if (m.info.tokens.cache) {
          cacheRead += m.info.tokens.cache.read || 0
          cacheWrite += m.info.tokens.cache.write || 0
        }
      }
      if (typeof m.info.cost === 'number') {
        totalCost += m.info.cost
      }
    }

    const compositeInfo: MessageInfo = {
      ...last.info,
      id: last.info.id,
      sessionID: first.info.sessionID,
      role: 'assistant',
      time: {
        created: first.info.time.created,
        completed: last.info.time.completed,
      },
      tokens: {
        input: inputTokens,
        output: outputTokens,
        reasoning: reasoningTokens,
        cache: {
          read: cacheRead,
          write: cacheWrite,
        },
      },
      cost: totalCost > 0 ? totalCost : last.info.cost,
    }

    const compositeMessage: Message = {
      info: compositeInfo,
      parts: compositeParts,
    }

    items.push({
      type: 'assistant',
      messages: currentAssistantMessages,
      primaryMessage: last,
      allMessageIds,
      compositeMessage,
      index: assistantStartIndex,
    })

    currentAssistantMessages = []
    assistantStartIndex = -1
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.info.role === 'assistant') {
      if (currentAssistantMessages.length === 0) {
        assistantStartIndex = i
      }
      currentAssistantMessages.push(msg)

      // If this message is the revert boundary, flush here so post-checkpoint messages stay separate
      if (revertMessageId && msg.info.id === revertMessageId) {
        flushAssistant()
      }
    } else {
      flushAssistant()
      items.push({
        type: msg.info.role === 'user' ? 'user' : 'system',
        message: msg,
        index: i,
      })
    }
  }

  flushAssistant()
  return items
}
