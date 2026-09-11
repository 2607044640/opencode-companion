export type ResolveLazyConnectInput = {
  readonly fromNodeId: string
  readonly fromHandleType?: "source" | "target"
  readonly targetCardId: string
}

export type LazyConnectResult = {
  readonly finalSource: string
  readonly finalTarget: string
}

/**
 * Determines link direction between fromNode and dropped targetCardId.
 * If user dragged from output/source handle -> fromNode connects to targetCardId.
 * If user dragged from input/target handle -> targetCardId connects to fromNode.
 */
export function resolveLazyConnect(input: ResolveLazyConnectInput): LazyConnectResult {
  if (input.fromHandleType === "target") {
    return {
      finalSource: input.targetCardId,
      finalTarget: input.fromNodeId,
    }
  }
  return {
    finalSource: input.fromNodeId,
    finalTarget: input.targetCardId,
  }
}

export type CardPositionData = {
  readonly cardId: string
  readonly directory: string
  readonly position: { readonly x: number; readonly y: number }
}

export type FindCardAtFlowPosInput = {
  readonly flowPos: { readonly x: number; readonly y: number }
  readonly cards: Record<string, CardPositionData>
  readonly directory: string
  readonly padding?: number
  readonly cardWidth?: number
  readonly cardHeight?: number
}

/**
 * Hit-tests whether flowPos lies inside any session card bounding box in the current directory.
 */
export function findCardAtFlowPosition(input: FindCardAtFlowPosInput): string | undefined {
  const padding = input.padding ?? 12
  const width = input.cardWidth ?? 240
  const height = input.cardHeight ?? 140

  let closestCardId: string | undefined = undefined
  let minDistanceSq = Infinity

  for (const card of Object.values(input.cards)) {
    if (card.directory !== input.directory) {
      continue
    }
    const minX = card.position.x - padding
    const maxX = card.position.x + width + padding
    const minY = card.position.y - padding
    const maxY = card.position.y + height + padding

    if (
      input.flowPos.x >= minX &&
      input.flowPos.x <= maxX &&
      input.flowPos.y >= minY &&
      input.flowPos.y <= maxY
    ) {
      const centerX = card.position.x + width / 2
      const centerY = card.position.y + height / 2
      const distSq =
        (input.flowPos.x - centerX) ** 2 + (input.flowPos.y - centerY) ** 2
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq
        closestCardId = card.cardId
      }
    }
  }
  return closestCardId
}
