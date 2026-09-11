import type { TalkMap } from "../schema/talk-map"
import { buildInjectText } from "../inject/spawn"

export async function pushAutoSync(input: {
  readonly map: TalkMap
  readonly sourceSessionId: string
  readonly visible: boolean
  readonly sseConnected: boolean
  readonly promptNoReply: (input: {
    readonly sessionID: string
    readonly directory: string
    readonly text: string
  }) => Promise<void>
}): Promise<void> {
  if (!input.visible || !input.sseConnected) {
    return
  }
  const digest = input.map.digests[input.sourceSessionId]
  if (digest === undefined) {
    return
  }
  const sourceCard = Object.values(input.map.cards).find((card) => card.sessionId === input.sourceSessionId)
  if (sourceCard === undefined) {
    return
  }
  const text = buildInjectText(digest)
  for (const edge of Object.values(input.map.edges)) {
    if (!edge.autoSync || (edge.kind !== "inject" && edge.kind !== "link")) {
      continue
    }
    if (edge.sourceCardId !== sourceCard.cardId) {
      continue
    }
    const target = input.map.cards[edge.targetCardId]
    if (target === undefined || target.ghost || target.sessionId === undefined) {
      continue
    }
    await input.promptNoReply({
      sessionID: target.sessionId,
      directory: target.directory,
      text,
    })
  }
}
