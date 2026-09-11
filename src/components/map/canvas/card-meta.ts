import type { TalkMap } from "../schema/talk-map"

export const COLOR_PALETTE = [
  "#f43f5e",
  "#f59e0b",
  "#84cc16",
  "#14b8a6",
  "#0ea5e9",
  "#6366f1",
  "#d946ef",
  "#78716c",
] as const

export const NEXT_STEP_MAX = 80 as const

export function truncateNextStep(nextStep: string | undefined): string | undefined {
  if (nextStep === undefined) {
    return undefined
  }
  const trimmed = nextStep.trim()
  if (trimmed.length === 0) {
    return undefined
  }
  if (trimmed.length <= NEXT_STEP_MAX) {
    return trimmed
  }
  return `${trimmed.slice(0, NEXT_STEP_MAX)}…`
}

export function formatRelativeTime(updatedAt: number, now: number): string | undefined {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return undefined
  }
  const millis = updatedAt < 1_000_000_000_000 ? updatedAt * 1000 : updatedAt
  const delta = Math.max(0, now - millis)
  const seconds = Math.floor(delta / 1000)
  if (seconds < 60) {
    return "just now"
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function applyColorTag(map: TalkMap, cardId: string, colorTag: string): TalkMap {
  const card = map.cards[cardId]
  if (card === undefined) {
    return map
  }
  return {
    ...map,
    cards: {
      ...map.cards,
      [cardId]: { ...card, colorTag },
    },
  }
}
