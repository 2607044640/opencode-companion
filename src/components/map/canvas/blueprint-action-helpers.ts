import type { TalkMap } from "../schema/talk-map"

export type ProjectSessionItem = {
  readonly cardId: string
  readonly sessionId?: string
  readonly title: string
  readonly nextStep?: string
}

export function filterProjectSessions(input: {
  readonly cards: TalkMap["cards"]
  readonly titles: Record<string, string>
  readonly directory: string
  readonly query: string
  readonly excludeCardId?: string
}): ProjectSessionItem[] {
  const normQuery = input.query.trim().toLowerCase()
  const results: ProjectSessionItem[] = []

  for (const card of Object.values(input.cards)) {
    if (card.directory !== input.directory) {
      continue
    }
    if (input.excludeCardId && card.cardId === input.excludeCardId) {
      continue
    }

    const sessionId = card.sessionId
    const title = card.label ?? (sessionId ? input.titles[sessionId] ?? sessionId : "Untitled")
    const searchTarget = `${title} ${sessionId ?? ""}`.toLowerCase()

    if (normQuery.length === 0 || searchTarget.includes(normQuery)) {
      results.push({
        cardId: card.cardId,
        ...(sessionId ? { sessionId } : {}),
        title,
      })
    }
  }

  return results
}
