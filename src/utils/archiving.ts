/**
 * Session Archiving (会话归档与恢复) Persistence & Partition Utility
 */

import { getPinnedSessionIds, savePinnedSessionIds } from './pinning'

export const ARCHIVED_SESSIONS_STORAGE_KEY = 'opencode_archived_sessions'

/**
 * Reads archived session IDs safely from storage
 */
export function getArchivedSessionIds(storage?: Storage): string[] {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    if (!store) return []
    const raw = store.getItem(ARCHIVED_SESSIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return Array.from(new Set(parsed.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))))
  } catch (err) {
    console.error('Failed to parse archived sessions from storage:', err)
    return []
  }
}

/**
 * Persists archived session IDs safely to storage
 */
export function saveArchivedSessionIds(ids: string[], storage?: Storage): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    if (!store) return
    const uniqueIds = Array.from(new Set(ids.filter((id) => typeof id === 'string' && Boolean(id.trim()))))
    store.setItem(ARCHIVED_SESSIONS_STORAGE_KEY, JSON.stringify(uniqueIds))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('opencode_archived_sessions_updated'))
    }
  } catch (err) {
    console.error('Failed to save archived sessions to storage:', err)
  }
}

/**
 * Checks if a session ID is archived
 */
export function isSessionArchived(sessionId: string, archivedIds: string[]): boolean {
  if (!sessionId) return false
  return archivedIds.includes(sessionId)
}

/**
 * Archives a session. Also unpins the session if it was previously pinned.
 */
export function archiveSessionId(
  sessionId: string,
  storage?: Storage
): { archived: boolean; archivedIds: string[] } {
  if (!sessionId || !sessionId.trim()) {
    const current = getArchivedSessionIds(storage)
    return { archived: false, archivedIds: current }
  }

  const current = getArchivedSessionIds(storage)
  const isAlreadyArchived = current.includes(sessionId)
  const updated = isAlreadyArchived ? current : [sessionId, ...current]

  saveArchivedSessionIds(updated, storage)

  // When archiving, remove from pinned sessions if present
  const pinned = getPinnedSessionIds(storage)
  if (pinned.includes(sessionId)) {
    savePinnedSessionIds(
      pinned.filter((id) => id !== sessionId),
      storage
    )
  }

  return {
    archived: true,
    archivedIds: updated,
  }
}

/**
 * Unarchives a session, restoring it to the active list.
 */
export function unarchiveSessionId(
  sessionId: string,
  storage?: Storage
): { archived: boolean; archivedIds: string[] } {
  if (!sessionId || !sessionId.trim()) {
    const current = getArchivedSessionIds(storage)
    return { archived: false, archivedIds: current }
  }

  const current = getArchivedSessionIds(storage)
  const updated = current.filter((id) => id !== sessionId)

  saveArchivedSessionIds(updated, storage)
  return {
    archived: false,
    archivedIds: updated,
  }
}

/**
 * Toggles archive status for a given session ID
 */
export function toggleArchiveSessionId(
  sessionId: string,
  storage?: Storage
): { archived: boolean; archivedIds: string[] } {
  if (!sessionId || !sessionId.trim()) {
    const current = getArchivedSessionIds(storage)
    return { archived: false, archivedIds: current }
  }

  const current = getArchivedSessionIds(storage)
  const isCurrentlyArchived = current.includes(sessionId)

  return isCurrentlyArchived
    ? unarchiveSessionId(sessionId, storage)
    : archiveSessionId(sessionId, storage)
}

/**
 * Splits a list of sessions into active (non-archived) and archived groups
 */
export function partitionArchivedSessions<T extends { id: string }>(
  sessions: T[],
  archivedIds: string[]
): { activeSessions: T[]; archivedSessions: T[] } {
  const archivedSet = new Set(archivedIds)
  const active: T[] = []
  const archivedMap = new Map<string, T>()

  for (const session of sessions) {
    if (archivedSet.has(session.id)) {
      archivedMap.set(session.id, session)
    } else {
      active.push(session)
    }
  }

  // Preserve ordering in archivedIds
  const archived: T[] = []
  for (const id of archivedIds) {
    const sess = archivedMap.get(id)
    if (sess) {
      archived.push(sess)
    }
  }

  return {
    activeSessions: active,
    archivedSessions: archived,
  }
}
