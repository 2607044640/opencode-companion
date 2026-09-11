import type { TalkMap } from "../schema/talk-map"

export const COLUMN_X = 48
export const COLUMN_GAP_Y = 120
export const COLUMN_ORIGIN_Y = 48

export type SyncSession = {
  readonly id: string
  readonly title: string
  readonly directory: string
  readonly timeUpdated: number
}

export type SyncSessionsInput = {
  readonly map: TalkMap
  readonly sessions: readonly SyncSession[]
  readonly directory: string
  readonly newCardId: () => string
}

export type ApplyCreatedInput = {
  readonly map: TalkMap
  readonly session: SyncSession
  readonly directory: string
  readonly newCardId: () => string
  readonly position?: { readonly x: number; readonly y: number }
}

export function stackPosition(index: number): { readonly x: number; readonly y: number } {
  return { x: COLUMN_X, y: COLUMN_ORIGIN_Y + index * COLUMN_GAP_Y }
}

function boardOf(map: TalkMap, directory: string) {
  const existing = map.boards[directory]
  if (existing !== undefined) {
    return existing
  }
  return { cardIds: [] as string[], groupIds: [] as string[] }
}

function findCardBySession(map: TalkMap, sessionId: string, directory: string) {
  for (const card of Object.values(map.cards)) {
    if (card.sessionId === sessionId && card.directory === directory) {
      return card
    }
  }
  return undefined
}

function withBoardCard(map: TalkMap, directory: string, cardId: string): TalkMap {
  const board = boardOf(map, directory)
  if (board.cardIds.includes(cardId)) {
    return map
  }
  return {
    ...map,
    boards: {
      ...map.boards,
      [directory]: {
        ...board,
        cardIds: [...board.cardIds, cardId],
      },
    },
  }
}

function insertNewCard(
  map: TalkMap,
  session: SyncSession,
  newCardId: () => string,
  position: { readonly x: number; readonly y: number },
): TalkMap {
  const cardId = newCardId()
  if (cardId === session.id) {
    throw new Error("cardId must not equal sessionId")
  }
  const next: TalkMap = {
    ...map,
    cards: {
      ...map.cards,
      [cardId]: {
        cardId,
        sessionId: session.id,
        ghost: false,
        position,
        directory: session.directory,
      },
    },
  }
  return withBoardCard(next, session.directory, cardId)
}

export function syncSessions(input: SyncSessionsInput): TalkMap {
  const listed = input.sessions
    .filter((session) => session.directory === input.directory)
    .slice()
    .sort((a, b) => b.timeUpdated - a.timeUpdated)

  const listedIds = new Set(listed.map((session) => session.id))
  let next = input.map
  let stackIndex = 0

  for (const session of listed) {
    const existing = findCardBySession(next, session.id, input.directory)
    if (existing !== undefined) {
      next = {
        ...next,
        cards: {
          ...next.cards,
          [existing.cardId]: {
            ...existing,
            ghost: false,
            directory: input.directory,
          },
        },
      }
      next = withBoardCard(next, input.directory, existing.cardId)
      continue
    }
    next = insertNewCard(next, session, input.newCardId, stackPosition(stackIndex))
    stackIndex += 1
  }

  for (const card of Object.values(next.cards)) {
    if (card.directory !== input.directory) {
      continue
    }
    if (card.sessionId === undefined) {
      continue
    }
    if (listedIds.has(card.sessionId)) {
      continue
    }
    next = {
      ...next,
      cards: {
        ...next.cards,
        [card.cardId]: { ...card, ghost: true },
      },
    }
  }

  return next
}

export function applySessionDeleted(map: TalkMap, sessionId: string): TalkMap {
  let next = map
  for (const card of Object.values(map.cards)) {
    if (card.sessionId !== sessionId) {
      continue
    }
    next = {
      ...next,
      cards: {
        ...next.cards,
        [card.cardId]: { ...card, ghost: true },
      },
    }
  }
  return next
}

export function applySessionCreated(input: ApplyCreatedInput): TalkMap {
  if (input.session.directory !== input.directory) {
    return input.map
  }
  const existing = findCardBySession(input.map, input.session.id, input.directory)
  if (existing !== undefined) {
    return {
      ...input.map,
      cards: {
        ...input.map.cards,
        [existing.cardId]: {
          ...existing,
          ghost: false,
          ...(input.position === undefined ? {} : { position: input.position }),
        },
      },
    }
  }
  const newCount = Object.values(input.map.cards).filter(
    (card) => card.directory === input.directory && card.sessionId !== undefined && !card.ghost,
  ).length
  return insertNewCard(
    input.map,
    input.session,
    input.newCardId,
    input.position ?? stackPosition(newCount),
  )
}

export function applyCardPosition(
  map: TalkMap,
  cardId: string,
  position: { readonly x: number; readonly y: number },
): TalkMap {
  const card = map.cards[cardId]
  if (card === undefined) {
    return map
  }
  return {
    ...map,
    cards: {
      ...map.cards,
      [cardId]: { ...card, position: { x: position.x, y: position.y } },
    },
  }
}
