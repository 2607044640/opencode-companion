import type {
  Message,
  MessageInfo,
  MessagePart,
  TextPart,
  ReasoningPart,
  PartDeltaPayload,
} from '../types/opencode'
import { mergeMessageInfo, normalizeMessageInfo } from '../services/api'
import { sanitizeMessageRepetition } from '../utils/repetition-fuse'

export function messageProgressSignature(msgs: readonly Message[]): string {
  const last = msgs[msgs.length - 1]
  if (!last) return '0'
  const partsSig = last.parts
    .map((p) => {
      const len = typeof (p as any).text === 'string' ? (p as any).text.length : 0
      const st = (p as any).state?.status || ''
      const outLen = typeof (p as any).state?.output === 'string' ? (p as any).state.output.length : 0
      return `${p.id}:${p.type}:${len}:${st}:${outLen}`
    })
    .join('|')
  return `${msgs.length}:${last.info.id}:${last.info.finish || ''}:${last.info.time?.completed || 0}:${partsSig}`
}

export function stripAssistantErrors(
  messages: readonly Message[],
  targetMessageId?: string
): Message[] {
  return messages.map((m) => {
    const matchesTarget = targetMessageId
      ? m.info.id === targetMessageId
      : m.info.role === 'assistant'
    if (matchesTarget && m.info.error) {
      return { ...m, info: { ...m.info, error: undefined } }
    }
    return m
  })
}

export function stampRelayErrorOnLastAssistant(
  messages: readonly Message[],
  relayError: NonNullable<MessageInfo['error']>
): Message[] {
  return messages.map((msg, index, all) => {
    if (index !== all.length - 1) return msg
    if (msg.info.role !== 'assistant' || msg.info.error) return msg
    return { ...msg, info: { ...msg.info, error: relayError } }
  })
}

export function preserveInFlightAssistantError(
  reconciled: Message[],
  prevMsgs: readonly Message[],
  goOnFlight: boolean
): Message[] {
  if (!goOnFlight || reconciled.length === 0 || prevMsgs.length === 0) {
    return reconciled
  }
  const prevLast = prevMsgs[prevMsgs.length - 1]
  const recLast = reconciled[reconciled.length - 1]
  if (
    prevLast.info.role === 'assistant' &&
    recLast.info.role === 'assistant' &&
    prevLast.info.id === recLast.info.id &&
    prevLast.info.error &&
    !recLast.info.error
  ) {
    return [
      ...reconciled.slice(0, -1),
      { ...recLast, info: { ...recLast.info, error: prevLast.info.error } },
    ]
  }
  return reconciled
}

export function stampRepetitionLoopOnMessage(
  messages: readonly Message[],
  targetMessageId: string,
  errorName: string,
  errorMessage: string,
  forceFinishAbort = false
): Message[] {
  return messages.map((msg) => {
    if (msg.info.id !== targetMessageId) return msg
    if (!forceFinishAbort && msg.info.error) return msg
    const { message, hasLoop } = sanitizeMessageRepetition(msg)
    if (forceFinishAbort && !hasLoop) return msg
    return {
      ...message,
      info: {
        ...message.info,
        ...(forceFinishAbort ? { finish: message.info.finish || 'abort' } : {}),
        error: message.info.error || {
          name: errorName,
          message: errorMessage,
          data: { message: errorMessage, kind: 'repetition_loop' },
        },
      },
    }
  })
}

function buildTextOrReasoningPart(data: PartDeltaPayload): MessagePart {
  return data.field === 'reasoning'
    ? {
        id: data.partID,
        sessionID: data.sessionID,
        messageID: data.messageID,
        type: 'reasoning',
        text: data.delta,
      }
    : {
        id: data.partID,
        sessionID: data.sessionID,
        messageID: data.messageID,
        type: 'text',
        text: data.delta,
      }
}

export function applyPartDeltaToMessages(
  prev: readonly Message[],
  data: PartDeltaPayload,
  onRepetitionDetected?: (messageId: string) => void
): Message[] {
  let msgFound = false
  const next = prev.map((msg) => {
    if (msg.info.id !== data.messageID) return msg
    msgFound = true

    let partFound = false
    const nextParts = msg.parts.map((p) => {
      if (p.id !== data.partID) return p
      partFound = true

      if (p.type === 'text') {
        return { ...p, text: (p as TextPart).text + data.delta }
      }
      if (p.type === 'reasoning') {
        return { ...p, text: (p as ReasoningPart).text + data.delta }
      }
      return p
    })

    if (!partFound) {
      nextParts.push(buildTextOrReasoningPart(data))
    }

    return { ...msg, parts: nextParts }
  })

  const grown = next.find((msg) => msg.info.id === data.messageID)
  if (grown && onRepetitionDetected && sanitizeMessageRepetition(grown).hasLoop) {
    queueMicrotask(() => onRepetitionDetected(data.messageID))
  }

  if (!msgFound) {
    return [
      ...next,
      {
        info: {
          id: data.messageID,
          sessionID: data.sessionID,
          role: 'assistant',
          time: { created: Date.now() },
        },
        parts: [buildTextOrReasoningPart(data)],
      },
    ]
  }

  return next
}

export function applyPartUpdatedToMessages(
  prev: readonly Message[],
  cleanPart: MessagePart,
  sessionID: string,
  pendingOptimisticId: string | null,
  onRepetitionDetected?: (messageId: string) => void
): Message[] {
  let msgFound = false
  const next = prev.map((msg) => {
    const isPendingMatch = Boolean(pendingOptimisticId && msg.info.id === pendingOptimisticId)
    if (msg.info.id !== cleanPart.messageID && !isPendingMatch) return msg
    msgFound = true

    let partFound = false
    const nextParts: MessagePart[] = []
    let replacedOptimistic = false

    for (const p of msg.parts) {
      if (p.id === cleanPart.id) {
        partFound = true
        nextParts.push(cleanPart)
      } else if ((p as any).isOptimistic && p.type === cleanPart.type && !replacedOptimistic) {
        partFound = true
        replacedOptimistic = true
        nextParts.push(cleanPart)
      } else {
        nextParts.push(p)
      }
    }

    if (!partFound) {
      nextParts.push(cleanPart)
    }

    return { ...msg, parts: nextParts }
  })

  const grown = next.find((msg) => msg.info.id === cleanPart.messageID)
  if (grown && onRepetitionDetected && sanitizeMessageRepetition(grown).hasLoop) {
    queueMicrotask(() => onRepetitionDetected(cleanPart.messageID))
  }

  if (!msgFound && cleanPart.messageID) {
    const isUserPart = cleanPart.type === 'file'
    return [
      ...next,
      {
        info: normalizeMessageInfo({
          id: cleanPart.messageID,
          sessionID,
          role: isUserPart ? 'user' : 'assistant',
          time: { created: Date.now() },
        }),
        parts: [cleanPart],
      },
    ]
  }

  return next
}

export function applyMessageUpdatedToMessages(
  prev: readonly Message[],
  cleanInfo: MessageInfo,
  pendingOptimisticIdRef: { current: string | null }
): Message[] {
  let found = false
  const next = prev.map((msg) => {
    if (msg.info.id !== cleanInfo.id) return msg
    found = true
    return { ...msg, info: mergeMessageInfo(msg.info, cleanInfo) }
  })

  if (!found) {
    const pendingId = pendingOptimisticIdRef.current
    if (pendingId && cleanInfo.role === 'user') {
      pendingOptimisticIdRef.current = null
      return next.map((msg) =>
        msg.info.id === pendingId
          ? {
              ...msg,
              info: mergeMessageInfo(msg.info, cleanInfo),
              parts: msg.parts.map((p) => ({
                ...p,
                messageID: cleanInfo.id,
              })),
            }
          : msg
      )
    }
    return [...next, { info: cleanInfo, parts: [] }]
  }
  return next
}

export function collectRetryDeletionIds(
  msgs: readonly Message[],
  lastUserIndex: number,
  freshHistory: readonly Message[] | null
): {
  assistantIdsToDelete: Set<string>
  userIdsToDelete: Set<string>
  allRemovedIds: Set<string>
} {
  const lastUserMsg = msgs[lastUserIndex]
  const subsequentAssistantMsgs = msgs
    .slice(lastUserIndex + 1)
    .filter((m) => m.info.role === 'assistant')

  const assistantIdsToDelete = new Set<string>(
    subsequentAssistantMsgs.map((m) => m.info.id).filter((id) => !id.startsWith('usr_'))
  )
  const userIdsToDelete = new Set<string>(
    lastUserMsg.info.id.startsWith('usr_') ? [] : [lastUserMsg.info.id]
  )
  const allRemovedIds = new Set<string>([
    lastUserMsg.info.id,
    ...subsequentAssistantMsgs.map((m) => m.info.id),
  ])

  if (freshHistory && freshHistory.length > 0) {
    let backendUserIdx = -1
    for (let i = freshHistory.length - 1; i >= 0; i--) {
      if (freshHistory[i].info.role === 'user') {
        backendUserIdx = i
        break
      }
    }
    if (backendUserIdx !== -1) {
      const backendUserMsg = freshHistory[backendUserIdx]
      const matchesUser =
        backendUserMsg.info.id === lastUserMsg.info.id || lastUserMsg.info.id.startsWith('usr_')
      if (matchesUser) {
        userIdsToDelete.add(backendUserMsg.info.id)
        allRemovedIds.add(backendUserMsg.info.id)
        for (const m of freshHistory.slice(backendUserIdx + 1)) {
          if (m.info.role === 'assistant') {
            assistantIdsToDelete.add(m.info.id)
            allRemovedIds.add(m.info.id)
          }
        }
      }
    }
  }

  return { assistantIdsToDelete, userIdsToDelete, allRemovedIds }
}
