import type { TalkMap } from "../schema/talk-map"

export function removeCardFromMap(map: TalkMap, cardId: string): TalkMap {
  const nextCards = { ...map.cards }
  delete nextCards[cardId]
  const nextEdges = { ...map.edges }
  for (const [edgeId, edge] of Object.entries(nextEdges)) {
    if (edge.sourceCardId === cardId || edge.targetCardId === cardId) {
      delete nextEdges[edgeId]
    }
  }
  return {
    ...map,
    cards: nextCards,
    edges: nextEdges,
  }
}

export function removeNodesFromMap(
  map: TalkMap,
  deleted: readonly { readonly id: string; readonly type?: string }[],
  sessionCardType: string,
  groupType: string,
): TalkMap {
  const nextCards = { ...map.cards }
  const nextGroups = { ...map.groups }
  const nextEdges = { ...map.edges }
  const deletedCardIds = new Set<string>()

  for (const node of deleted) {
    if (node.type === sessionCardType) {
      delete nextCards[node.id]
      deletedCardIds.add(node.id)
    } else if (node.type === groupType) {
      delete nextGroups[node.id]
    }
  }

  for (const [edgeId, edge] of Object.entries(nextEdges)) {
    if (deletedCardIds.has(edge.sourceCardId) || deletedCardIds.has(edge.targetCardId)) {
      delete nextEdges[edgeId]
    }
  }

  return {
    ...map,
    cards: nextCards,
    groups: nextGroups,
    edges: nextEdges,
  }
}

export function removeEdgesFromMap(map: TalkMap, edgeIds: readonly string[]): TalkMap {
  const nextEdges = { ...map.edges }
  for (const edgeId of edgeIds) {
    delete nextEdges[edgeId]
  }
  return {
    ...map,
    edges: nextEdges,
  }
}

export type DisconnectPinResult = {
  readonly map: TalkMap
  readonly removedCount: number
  readonly nativeCount: number
}

export function disconnectPinEdges(
  map: TalkMap,
  cardId: string,
  type: "source" | "target",
): DisconnectPinResult {
  let removedCount = 0
  let nativeCount = 0
  const nextEdges = { ...map.edges }

  for (const [edgeId, edge] of Object.entries(map.edges)) {
    const isMatch = type === "source" ? edge.sourceCardId === cardId : edge.targetCardId === cardId
    if (isMatch) {
      if (edge.kind === "native") {
        nativeCount += 1
      } else {
        delete nextEdges[edgeId]
        removedCount += 1
      }
    }
  }

  return {
    map: { ...map, edges: nextEdges },
    removedCount,
    nativeCount,
  }
}

