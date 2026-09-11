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
