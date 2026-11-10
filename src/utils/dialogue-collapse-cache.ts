/**
 * Dialogue Collapse Cache (对话折叠状态临时缓存)
 * 
 * Preserves the user's manual expand/collapse operations across tab switches (Ctrl+Tab / Ctrl+Shift+Tab)
 * or session re-renders within the browser session, without polluting persistent backend state.
 */

const STORAGE_KEY = 'opencode_dialogue_collapse_cache'
const MAX_ENTRIES = 1000

// In-memory lookup map for zero-latency synchronous access during React component render
const memoryCache = new Map<string, boolean>()

// Initialize from sessionStorage if available
let isInitialized = false

function initFromSessionStorage(): void {
  if (isInitialized) return
  isInitialized = true
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, boolean>
      for (const [key, val] of Object.entries(parsed)) {
        memoryCache.set(key, Boolean(val))
      }
    }
  } catch {
    // sessionStorage not accessible or quota exceeded, in-memory cache remains active
  }
}

function persistToSessionStorage(): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return

  try {
    // Keep entries within limit
    if (memoryCache.size > MAX_ENTRIES) {
      const keysToDelete = Array.from(memoryCache.keys()).slice(0, memoryCache.size - MAX_ENTRIES)
      for (const k of keysToDelete) {
        memoryCache.delete(k)
      }
    }

    const obj: Record<string, boolean> = {}
    for (const [key, val] of memoryCache.entries()) {
      obj[key] = val
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch {
    // Ignore quota errors safely
  }
}

/**
 * Gets the cached expand/collapse state for a dialogue message.
 * Returns the manually toggled state if one exists; otherwise returns fallbackDefault.
 */
export function getDialogueExpandedState(
  messageId: string,
  allMessageIds?: string[],
  fallbackDefault: boolean = false
): boolean {
  initFromSessionStorage()

  if (memoryCache.has(messageId)) {
    return memoryCache.get(messageId)!
  }

  if (allMessageIds && allMessageIds.length > 0) {
    for (const id of allMessageIds) {
      if (memoryCache.has(id)) {
        return memoryCache.get(id)!
      }
    }
  }

  return fallbackDefault
}

/**
 * Records a manual expand/collapse action for a dialogue message.
 */
export function setDialogueExpandedState(
  messageId: string,
  expanded: boolean,
  allMessageIds?: string[]
): void {
  initFromSessionStorage()

  memoryCache.set(messageId, expanded)
  if (allMessageIds && allMessageIds.length > 0) {
    for (const id of allMessageIds) {
      memoryCache.set(id, expanded)
    }
  }

  persistToSessionStorage()
}

/**
 * Cache for WorkedSummaryCard (tool calls & thinking bar) per message.
 */
export function getWorkedCardExpandedState(
  messageId: string,
  fallbackDefault: boolean = false
): boolean {
  initFromSessionStorage()
  const key = `worked_${messageId}`
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!
  }
  return fallbackDefault
}

export function setWorkedCardExpandedState(
  messageId: string,
  expanded: boolean
): void {
  initFromSessionStorage()
  const key = `worked_${messageId}`
  memoryCache.set(key, expanded)
  persistToSessionStorage()
}

/**
 * Clears the cache. Primarily used in unit tests or session reset.
 */
export function clearDialogueExpandedCache(): void {
  memoryCache.clear()
  if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }
}

/**
 * Master toggle switch for collapsing / expanding all collapsible dialogue blocks.
 * Logic:
 * - If ANY collapsible dialogue is currently expanded -> Collapse ALL dialogues ('opencode-collapse-all-dialogues').
 * - If ALL collapsible dialogues are currently collapsed -> Expand ALL dialogues ('opencode-expand-all-dialogues').
 *
 * @param root Optional DOM container/root for testing or scoped lookup (defaults to global document)
 * @returns 'collapsed' if action was to collapse, 'expanded' if action was to expand
 */
export function toggleAllDialogues(root?: ParentNode): 'collapsed' | 'expanded' {
  const targetRoot = root ?? (typeof document !== 'undefined' ? document : null)
  if (!targetRoot) return 'collapsed'

  const collapsibleElements = Array.from(
    targetRoot.querySelectorAll<HTMLElement>('[data-collapsible="true"]')
  )
  if (collapsibleElements.length === 0) {
    return 'collapsed'
  }

  const hasAnyExpanded = collapsibleElements.some(
    (el) => el.getAttribute('data-expanded') === 'true'
  )

  if (hasAnyExpanded) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('opencode-collapse-all-dialogues'))
    }
    return 'collapsed'
  } else {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('opencode-expand-all-dialogues'))
    }
    return 'expanded'
  }
}
