import { z } from "zod"
import { emptyTalkMap, TalkMapSchema, type TalkMap } from "../schema/talk-map"

export const MAP_API_PATH = "/api/map" as const
const STORAGE_KEY = "opencode_talk_map"

function isBenignLoadFailure(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    error instanceof SyntaxError ||
    error instanceof z.ZodError
  )
}

function loadFromLocalStorage(): TalkMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return TalkMapSchema.parse(JSON.parse(raw))
    }
  } catch {
    // ignore
  }
  return emptyTalkMap()
}

export async function loadTalkMapFromApi(): Promise<TalkMap> {
  try {
    const response = await fetch(MAP_API_PATH)
    if (!response.ok) {
      return loadFromLocalStorage()
    }
    const data = await response.json()
    return TalkMapSchema.parse(data)
  } catch (error) {
    if (isBenignLoadFailure(error)) {
      return loadFromLocalStorage()
    }
    return loadFromLocalStorage()
  }
}

export async function saveTalkMapToApi(map: TalkMap): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }

  try {
    await fetch(MAP_API_PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(map),
    })
  } catch (error) {
    if (error instanceof TypeError) {
      return
    }
    // We don't throw here to prevent disrupting user interactions if API server is temporarily offline
  }
}

/**
 * Explicitly adds a session to the talk map for a given directory.
 * Returns the cardId and whether it was already present on the board.
 */
export async function addSessionToTalkMap(
  sessionId: string,
  directory?: string,
  title?: string,
): Promise<{ readonly cardId: string; readonly alreadyExisted: boolean }> {
  const map = await loadTalkMapFromApi()
  const dir = directory || "/workspace/projects/APISpace"

  // Check if an active (non-ghost) card already exists for this session
  for (const card of Object.values(map.cards)) {
    if (card.sessionId === sessionId && !card.ghost) {
      return { cardId: card.cardId, alreadyExisted: true }
    }
  }

  const newCardId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const activeCards = Object.values(map.cards).filter((card) => !card.ghost)
  const index = activeCards.length
  const position = {
    x: 60 + (index % 4) * 280,
    y: 60 + Math.floor(index / 4) * 160,
  }

  const defaultBoard = map.boards.default || { cardIds: [], groupIds: [] }
  const next: TalkMap = {
    ...map,
    cards: {
      ...map.cards,
      [newCardId]: {
        cardId: newCardId,
        sessionId,
        ghost: false,
        position,
        directory: dir,
        ...(title ? { label: title } : {}),
      },
    },
    boards: {
      ...map.boards,
      default: {
        ...defaultBoard,
        cardIds: [...defaultBoard.cardIds, newCardId],
      },
      ...(dir !== "default"
        ? {
            [dir]: {
              cardIds: [...(map.boards[dir]?.cardIds || []), newCardId],
              groupIds: map.boards[dir]?.groupIds || [],
            },
          }
        : {}),
    },
  }

  await saveTalkMapToApi(next)
  return { cardId: newCardId, alreadyExisted: false }
}
