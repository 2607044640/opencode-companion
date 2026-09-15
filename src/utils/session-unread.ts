/**
 * Session Unread State & Human Origin Tracker
 *
 * Strict Requirement:
 * "如果是人类发送消息，而不是AI（你使用 /RelayAPIVetting ），我希望在AI结束后，有一个未读标记（蓝色）"
 *
 * Distinguishes human-initiated prompts from automated background AI tasks.
 * When the AI finishes responding to a human prompt, marks the session as UNREAD (blue indicator).
 */

export const UNREAD_SESSIONS_STORAGE_KEY = 'opencode_unread_sessions'
export const HUMAN_PENDING_STORAGE_KEY = 'opencode_human_pending_sessions'
export const UNREAD_UPDATE_EVENT = 'opencode_unread_sessions_updated'

/**
 * Reads pending human-initiated session IDs from storage (resilient to page reloads)
 */
export function getHumanPendingSessionIds(storage?: Storage): Set<string> {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : undefined)
    if (!store) return new Set()
    const raw = store.getItem(HUMAN_PENDING_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))
  } catch {
    return new Set()
  }
}

/**
 * Saves pending human-initiated session IDs to storage
 */
export function saveHumanPendingSessionIds(ids: Set<string>, storage?: Storage): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : undefined)
    if (!store) return
    store.setItem(HUMAN_PENDING_STORAGE_KEY, JSON.stringify(Array.from(ids)))
  } catch {}
}

/**
 * Marks that a human explicitly sent a message in this session from the companion UI.
 */
export function markHumanInitiated(sessionId: string, storage?: Storage): void {
  if (!sessionId || !sessionId.trim()) return
  const pending = getHumanPendingSessionIds(storage)
  pending.add(sessionId)
  saveHumanPendingSessionIds(pending, storage)
}

/**
 * Checks if a session has a pending prompt sent by a human.
 */
export function isHumanInitiated(sessionId: string, storage?: Storage): boolean {
  if (!sessionId) return false
  const pending = getHumanPendingSessionIds(storage)
  return pending.has(sessionId)
}

/**
 * Clears the human-pending flag for a session.
 */
export function clearHumanInitiated(sessionId: string, storage?: Storage): void {
  if (!sessionId) return
  const pending = getHumanPendingSessionIds(storage)
  if (pending.delete(sessionId)) {
    saveHumanPendingSessionIds(pending, storage)
  }
}

/**
 * Reads unread session IDs safely from storage.
 */
export function getUnreadSessionIds(storage?: Storage): string[] {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    if (!store) return []
    const raw = store.getItem(UNREAD_SESSIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return Array.from(
      new Set(parsed.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))
    )
  } catch (err) {
    console.error('Failed to parse unread sessions from storage:', err)
    return []
  }
}

/**
 * Persists unread session IDs safely to storage and dispatches update event.
 */
export function saveUnreadSessionIds(ids: string[], storage?: Storage): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    if (!store) return
    const uniqueIds = Array.from(
      new Set(ids.filter((id) => typeof id === 'string' && Boolean(id.trim())))
    )
    store.setItem(UNREAD_SESSIONS_STORAGE_KEY, JSON.stringify(uniqueIds))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(UNREAD_UPDATE_EVENT, { detail: uniqueIds }))
    }
  } catch (err) {
    console.error('Failed to save unread sessions to storage:', err)
  }
}

/**
 * Marks a session as unread (blue indicator).
 */
export function markSessionUnread(sessionId: string, storage?: Storage): string[] {
  if (!sessionId || !sessionId.trim()) return getUnreadSessionIds(storage)
  const current = getUnreadSessionIds(storage)
  if (!current.includes(sessionId)) {
    const next = [...current, sessionId]
    saveUnreadSessionIds(next, storage)
    return next
  }
  return current
}

/**
 * Clears unread status when a user views or interacts with a session.
 */
export function markSessionRead(sessionId: string, storage?: Storage): string[] {
  if (!sessionId) return getUnreadSessionIds(storage)
  const current = getUnreadSessionIds(storage)
  if (current.includes(sessionId)) {
    const next = current.filter((id) => id !== sessionId)
    saveUnreadSessionIds(next, storage)
    return next
  }
  return current
}

/**
 * Checks if a session has an unread marker.
 */
export function isSessionUnread(sessionId: string, unreadIds: string[]): boolean {
  if (!sessionId) return false
  return unreadIds.includes(sessionId)
}

/**
 * Handles session status / idle transitions.
 * If the session was initiated by human and is now transitioning to idle,
 * marks the session as UNREAD (blue marker).
 * Returns true if unread status was newly marked.
 */
export function handleSessionCompletion(
  sessionId: string,
  storage?: Storage,
  sessionStorage?: Storage
): boolean {
  if (!sessionId) return false

  // Only trigger if human initiated the prompt!
  // Prevents automated AI runs (e.g. /RelayAPIVetting or scripts) from triggering unread dots.
  if (!isHumanInitiated(sessionId, sessionStorage)) {
    return false
  }

  // Clear human-pending flag now that AI has finished
  clearHumanInitiated(sessionId, sessionStorage)

  // Mark session as unread with the blue indicator
  markSessionUnread(sessionId, storage)
  return true
}
