import type { TalkMap } from "../schema/talk-map"

/**
 * Pure Undo / Redo history state machine for Dialogue Map canvas.
 * Records user mutations (drag position changes, dagre layout, deletions, group operations)
 * while strictly isolating external backend SSE sync events from the user undo stack.
 */

export interface MapHistory {
  readonly past: readonly TalkMap[]
  readonly future: readonly TalkMap[]
}

export const INITIAL_MAP_HISTORY: MapHistory = {
  past: [],
  future: [],
}

export const MAX_HISTORY_LENGTH = 50

/**
 * Record a snapshot into the past history stack and clear redo future.
 */
export function recordHistorySnapshot(
  history: MapHistory,
  snapshot: TalkMap,
  maxHistory: number = MAX_HISTORY_LENGTH,
): MapHistory {
  const nextPast = [...history.past, snapshot]
  const trimmed =
    nextPast.length > maxHistory ? nextPast.slice(nextPast.length - maxHistory) : nextPast
  return {
    past: trimmed,
    future: [],
  }
}

export interface HistoryTransitionResult {
  readonly history: MapHistory
  readonly map: TalkMap | null
}

/**
 * Step back to the previous map snapshot, pushing current state into future stack.
 */
export function undoHistory(
  history: MapHistory,
  currentMap: TalkMap,
): HistoryTransitionResult {
  if (history.past.length === 0) {
    return { history, map: null }
  }
  const previousMap = history.past[history.past.length - 1]
  const newPast = history.past.slice(0, -1)
  const newFuture = [currentMap, ...history.future]
  return {
    history: {
      past: newPast,
      future: newFuture,
    },
    map: previousMap,
  }
}

/**
 * Step forward to the next future map snapshot, pushing current state into past stack.
 */
export function redoHistory(
  history: MapHistory,
  currentMap: TalkMap,
): HistoryTransitionResult {
  if (history.future.length === 0) {
    return { history, map: null }
  }
  const nextMap = history.future[0]
  const newFuture = history.future.slice(1)
  const newPast = [...history.past, currentMap]
  return {
    history: {
      past: newPast,
      future: newFuture,
    },
    map: nextMap,
  }
}
