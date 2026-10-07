/**
 * Tab Persistence Utility for OpenCode Companion
 * Ensures open tabs and the active tab remain persistent across F5 refreshes,
 * app closes, and PWA restarts.
 */

export const OPEN_TABS_STORAGE_KEY = 'opencode_open_tabs'
export const ACTIVE_TAB_STORAGE_KEY = 'opencode_active_tab'

/**
 * Safely resolves the storage instance (window.localStorage by default)
 */
function resolveStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return undefined
}

/**
 * Reads stored open tab session IDs safely from localStorage.
 * Deduplicates and filters out invalid or empty strings while preserving tab order.
 */
export function getStoredOpenTabs(storage?: Storage): string[] {
  try {
    const store = resolveStorage(storage)
    if (!store) return []
    const raw = store.getItem(OPEN_TABS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const valid = parsed.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    return Array.from(new Set(valid.map((id) => id.trim())))
  } catch (err) {
    console.error('Failed to parse open tabs from storage:', err)
    return []
  }
}

/**
 * Persists open tab session IDs safely to localStorage.
 */
export function saveStoredOpenTabs(tabIds: string[], storage?: Storage): void {
  try {
    const store = resolveStorage(storage)
    if (!store) return
    const uniqueIds = Array.from(
      new Set(
        tabIds
          .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
          .map((id) => id.trim())
      )
    )
    store.setItem(OPEN_TABS_STORAGE_KEY, JSON.stringify(uniqueIds))
  } catch (err) {
    console.error('Failed to save open tabs to storage:', err)
  }
}

/**
 * Reads the last active tab session ID from localStorage.
 */
export function getStoredActiveTab(storage?: Storage): string | null {
  try {
    const store = resolveStorage(storage)
    if (!store) return null
    const raw = store.getItem(ACTIVE_TAB_STORAGE_KEY)
    if (!raw || typeof raw !== 'string' || !raw.trim()) return null
    return raw.trim()
  } catch (err) {
    console.error('Failed to parse active tab from storage:', err)
    return null
  }
}

/**
 * Persists the current active tab session ID to localStorage.
 */
export function saveStoredActiveTab(activeId: string | null, storage?: Storage): void {
  try {
    const store = resolveStorage(storage)
    if (!store) return
    if (!activeId || !activeId.trim()) {
      store.removeItem(ACTIVE_TAB_STORAGE_KEY)
    } else {
      store.setItem(ACTIVE_TAB_STORAGE_KEY, activeId.trim())
    }
  } catch (err) {
    console.error('Failed to save active tab to storage:', err)
  }
}

export interface InitialTabsState {
  initialTabs: string[]
  initialActiveId: string | null
}

/**
 * Pure calculation resolving the initial open tabs and active session ID on mount / F5 refresh.
 *
 * Rules:
 * 1. If URL has ?session=..., that session takes immediate precedence for active display.
 *    If saved tabs exist from previous session, that session is appended if not already present,
 *    preserving all previously open tabs across F5 or restart.
 * 2. If URL does NOT have ?session=... (e.g. desktop app reopened or bare localhost:5173),
 *    restores all previously open tabs, and reactivates the last active tab (or the last tab).
 * 3. If no tabs are stored and no URL param exists, returns empty initial tabs (falling back to backend default).
 */
export function resolveInitialTabsState(options?: {
  urlSearch?: string
  storage?: Storage
  draftSessionId?: string
}): InitialTabsState {
  const draftId = options?.draftSessionId ?? '__draft__'
  let urlSessionId: string | null = null

  try {
    const search =
      options?.urlSearch !== undefined
        ? options.urlSearch
        : typeof window !== 'undefined'
          ? window.location.search
          : ''
    if (search) {
      const id = new URLSearchParams(search).get('session')
      if (id && id !== draftId && Boolean(id.trim())) {
        urlSessionId = id.trim()
      }
    }
  } catch {}

  const storedTabs = getStoredOpenTabs(options?.storage)
  const storedActive = getStoredActiveTab(options?.storage)

  let initialTabs: string[]
  if (storedTabs.length > 0) {
    if (urlSessionId) {
      initialTabs = storedTabs.includes(urlSessionId) ? storedTabs : [...storedTabs, urlSessionId]
    } else {
      initialTabs = storedTabs
    }
  } else {
    initialTabs = urlSessionId ? [urlSessionId] : []
  }

  let initialActiveId: string | null = null
  if (urlSessionId) {
    initialActiveId = urlSessionId
  } else if (storedActive && initialTabs.includes(storedActive)) {
    initialActiveId = storedActive
  } else if (initialTabs.length > 0) {
    initialActiveId = initialTabs[initialTabs.length - 1]
  }

  return { initialTabs, initialActiveId }
}
