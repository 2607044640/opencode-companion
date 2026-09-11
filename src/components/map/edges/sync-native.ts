import type { TalkMap } from "../schema/talk-map"

export type NativeParent = {
  readonly sessionId: string
  readonly parentId: string | undefined
}

function cardIdForSession(map: TalkMap, sessionId: string): string | undefined {
  for (const card of Object.values(map.cards)) {
    if (card.sessionId === sessionId) {
      return card.cardId
    }
  }
  return undefined
}

export function nativeEdgeId(parentCardId: string, childCardId: string): string {
  return `native:${parentCardId}:${childCardId}`
}

export function syncNativeEdges(map: TalkMap, relations: readonly NativeParent[]): TalkMap {
  const edges = { ...map.edges }
  for (const relation of relations) {
    if (relation.parentId === undefined) {
      continue
    }
    const parentCardId = cardIdForSession(map, relation.parentId)
    const childCardId = cardIdForSession(map, relation.sessionId)
    if (parentCardId === undefined || childCardId === undefined) {
      continue
    }
    const edgeId = nativeEdgeId(parentCardId, childCardId)
    const existing = edges[edgeId]
    edges[edgeId] = {
      edgeId,
      sourceCardId: parentCardId,
      targetCardId: childCardId,
      kind: "native",
      autoSync: existing?.autoSync ?? false,
      comment: existing?.comment ?? "",
    }
  }
  return { ...map, edges }
}

export function upsertLinkEdge(
  map: TalkMap,
  sourceCardId: string,
  targetCardId: string,
  comment = "",
): TalkMap {
  const edgeId = `link:${sourceCardId}:${targetCardId}`
  const existing = map.edges[edgeId]
  return {
    ...map,
    edges: {
      ...map.edges,
      [edgeId]: {
        edgeId,
        sourceCardId,
        targetCardId,
        kind: "link",
        autoSync: existing?.autoSync ?? false,
        comment: existing?.comment ?? comment,
      },
    },
  }
}

export function setEdgeComment(map: TalkMap, edgeId: string, comment: string): TalkMap {
  const edge = map.edges[edgeId]
  if (edge === undefined) {
    return map
  }
  return {
    ...map,
    edges: {
      ...map.edges,
      [edgeId]: { ...edge, comment },
    },
  }
}

export function setEdgeAutoSync(map: TalkMap, edgeId: string, autoSync: boolean): TalkMap {
  const edge = map.edges[edgeId]
  if (edge === undefined || edge.kind === "native") {
    return map
  }
  return {
    ...map,
    edges: {
      ...map.edges,
      [edgeId]: { ...edge, autoSync },
    },
  }
}
