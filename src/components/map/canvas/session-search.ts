export type SessionSearchFields = {
  readonly title: string
  readonly nextStep: string
  readonly sessionId: string
}

export type SearchableSessionNode = {
  readonly id: string
  readonly position: { readonly x: number; readonly y: number }
  readonly data: {
    readonly sessionId?: string
    readonly title?: string
    readonly nextStep?: string
  }
}

export type MatchedSessionCard = {
  readonly cardId: string
  readonly sessionId: string
  readonly title: string
  readonly position: { readonly x: number; readonly y: number }
}

export type SearchHighlight = {
  readonly isDimmed: boolean
  readonly isHighlighted: boolean
  readonly isSelected: boolean
}

export function normalizeSearchQuery(query: string | undefined): string {
  return (query ?? "").trim().toLowerCase()
}

export function sessionMatchesQuery(query: string, fields: SessionSearchFields): boolean {
  if (query.length === 0) {
    return true
  }
  return (
    fields.title.toLowerCase().includes(query) ||
    fields.nextStep.toLowerCase().includes(query) ||
    fields.sessionId.toLowerCase().includes(query)
  )
}

export function searchHighlight(input: {
  readonly query: string
  readonly matches: boolean
  readonly selected: boolean
}): SearchHighlight {
  return {
    isDimmed: input.query.length > 0 && !input.matches,
    isHighlighted: input.matches && input.query.length > 0,
    isSelected: input.selected,
  }
}

function fieldsFromNode(node: SearchableSessionNode): SessionSearchFields {
  return {
    title: node.data.title ?? "",
    nextStep: node.data.nextStep ?? "",
    sessionId: node.data.sessionId ?? "",
  }
}

export function collectMatchedSessionCards(
  nodes: readonly SearchableSessionNode[],
  query: string,
): MatchedSessionCard[] {
  const cards: MatchedSessionCard[] = []
  for (const node of nodes) {
    const sessionId = node.data.sessionId
    if (sessionId === undefined) {
      continue
    }
    const fields = fieldsFromNode(node)
    if (!sessionMatchesQuery(query, fields)) {
      continue
    }
    cards.push({
      cardId: node.id,
      sessionId,
      title: fields.title,
      position: node.position,
    })
  }
  return cards
}

export function withSearchHighlight<T extends SearchableSessionNode>(
  nodes: readonly T[],
  query: string,
  activeSessionId: string | undefined,
): Array<Omit<T, "data"> & { readonly data: T["data"] & SearchHighlight }> {
  return nodes.map((node) => {
    const fields = fieldsFromNode(node)
    const matches = sessionMatchesQuery(query, fields)
    const selected = activeSessionId !== undefined && fields.sessionId === activeSessionId
    return {
      ...node,
      data: {
        ...node.data,
        ...searchHighlight({ query, matches, selected }),
      },
    }
  })
}
