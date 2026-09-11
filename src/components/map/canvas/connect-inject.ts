import type { TalkMap } from "../schema/talk-map"
import { buildInjectText, type DigestFields } from "../inject/spawn"
import type { ListedSession, TalkMapClient } from "../opencode/client"
import type { ViewState } from "./map-interactions"

export const BRANCH_OFFSET_X = 280

export type InjectSource = {
  readonly cardId: string
  readonly sessionId: string
  readonly title: string
  readonly digest: DigestFields | undefined
  readonly position: { readonly x: number; readonly y: number }
}

export type InjectCreated = {
  readonly id: string
  readonly title: string
  readonly directory: string
}

export function injectPromptText(source: InjectSource): string {
  if (source.digest === undefined) {
    return `${source.title}\n`
  }
  return buildInjectText(source.digest)
}

export function injectEdgeId(sourceCardId: string, targetCardId: string): string {
  return `inject:${sourceCardId}:${targetCardId}`
}

export function applyInjectedBranch(input: {
  readonly current: ViewState
  readonly sourceCardId: string
  readonly sourcePosition: { readonly x: number; readonly y: number }
  readonly targetPosition?: { readonly x: number; readonly y: number }
  readonly cardId: string
  readonly created: InjectCreated
}): ViewState {
  const { current, created } = input
  if (current.kind !== "ready" || current.directory === undefined) {
    return current
  }
  const cardId = input.cardId
  const position = input.targetPosition ?? {
    x: input.sourcePosition.x + BRANCH_OFFSET_X,
    y: input.sourcePosition.y,
  }
  const directory = current.directory
  const board = current.map.boards[directory] ?? { cardIds: [], groupIds: [] }
  const nextBoards = {
    ...current.map.boards,
    [directory]: {
      ...board,
      cardIds: board.cardIds.includes(cardId) ? board.cardIds : [...board.cardIds, cardId],
    },
  }
  const withCard: TalkMap = {
    ...current.map,
    boards: nextBoards,
    cards: {
      ...current.map.cards,
      [cardId]: {
        cardId,
        sessionId: created.id,
        ghost: false,
        position,
        directory,
      },
    },
  }
  const edgeId = injectEdgeId(input.sourceCardId, cardId)
  const nextMap: TalkMap = {
    ...withCard,
    edges: {
      ...withCard.edges,
      [edgeId]: {
        edgeId,
        sourceCardId: input.sourceCardId,
        targetCardId: cardId,
        kind: "inject",
        autoSync: false,
        comment: "",
      },
    },
  }
  return {
    ...current,
    map: nextMap,
    titles: { ...current.titles, [created.id]: created.title },
  }
}

export async function createInjectedBranch(input: {
  readonly client: Pick<TalkMapClient, "createSession" | "promptNoReply">
  readonly directory: string
  readonly source: InjectSource
}): Promise<ListedSession> {
  const created = await input.client.createSession(input.directory, {
    parentID: input.source.sessionId,
    title: `${input.source.title} (branch)`,
  })
  await input.client.promptNoReply({
    sessionID: created.id,
    directory: created.directory,
    text: injectPromptText(input.source),
  })
  return created
}
