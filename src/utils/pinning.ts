/**
 * Session Pinning (置顶与星标收藏) Persistence & Sorting Utility
 */

export const PINNED_SESSIONS_STORAGE_KEY = 'opencode_pinned_sessions'

/**
 * Reads pinned session IDs safely from storage
 */
export function getPinnedSessionIds(storage?: Storage): string[] {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    if (!store) return []
    const raw = store.getItem(PINNED_SESSIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return Array.from(new Set(parsed.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))))
  } catch (err) {
    console.error('Failed to parse pinned sessions from storage:', err)
    return []
  }
}

/**
 * Persists pinned session IDs safely to storage
 */
export function savePinnedSessionIds(ids: string[], storage?: Storage): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    if (!store) return
    const uniqueIds = Array.from(new Set(ids.filter((id) => typeof id === 'string' && Boolean(id.trim()))))
    store.setItem(PINNED_SESSIONS_STORAGE_KEY, JSON.stringify(uniqueIds))
  } catch (err) {
    console.error('Failed to save pinned sessions to storage:', err)
  }
}

/**
 * Toggles pin status for a given session ID
 */
export function togglePinSessionId(
  sessionId: string,
  storage?: Storage
): { pinned: boolean; pinnedIds: string[] } {
  if (!sessionId || !sessionId.trim()) {
    const current = getPinnedSessionIds(storage)
    return { pinned: false, pinnedIds: current }
  }

  const current = getPinnedSessionIds(storage)
  const isCurrentlyPinned = current.includes(sessionId)
  const updated = isCurrentlyPinned
    ? current.filter((id) => id !== sessionId)
    : [sessionId, ...current] // Newly pinned sessions go to the top

  savePinnedSessionIds(updated, storage)
  return {
    pinned: !isCurrentlyPinned,
    pinnedIds: updated,
  }
}

/**
 * Checks if a session ID is pinned
 */
export function isSessionPinned(sessionId: string, pinnedIds: string[]): boolean {
  if (!sessionId) return false
  return pinnedIds.includes(sessionId)
}

/**
 * Splits a list of sessions into pinned and unpinned groups
 */
export function partitionPinnedSessions<T extends { id: string }>(
  sessions: T[],
  pinnedIds: string[]
): { pinnedSessions: T[]; unpinnedSessions: T[] } {
  const pinnedSet = new Set(pinnedIds)
  const sessionMap = new Map<string, T>()
  const unpinned: T[] = []

  for (const session of sessions) {
    sessionMap.set(session.id, session)
    if (!pinnedSet.has(session.id)) {
      unpinned.push(session)
    }
  }

  // Preserve order in pinnedIds (top of pinned list matches pinnedIds order)
  const pinned: T[] = []
  for (const id of pinnedIds) {
    const sess = sessionMap.get(id)
    if (sess) {
      pinned.push(sess)
    }
  }

  return {
    pinnedSessions: pinned,
    unpinnedSessions: unpinned,
  }
}
