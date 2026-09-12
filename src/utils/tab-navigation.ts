/**
 * Tab navigation pure utilities for OpenCode Companion
 */

/**
 * Returns the session ID of the next tab to the right, wrapping around to the first tab.
 * Returns null if there are 0 or 1 tabs.
 */
export function getNextTabId(openTabIds: string[], activeSessionId: string | null): string | null {
  if (!openTabIds || openTabIds.length <= 1) return null
  const currentIndex = activeSessionId ? openTabIds.indexOf(activeSessionId) : -1
  if (currentIndex === -1 || currentIndex >= openTabIds.length - 1) {
    return openTabIds[0]
  }
  return openTabIds[currentIndex + 1]
}

/**
 * Returns the session ID of the previous tab to the left, wrapping around to the last tab.
 * Returns null if there are 0 or 1 tabs.
 */
export function getPrevTabId(openTabIds: string[], activeSessionId: string | null): string | null {
  if (!openTabIds || openTabIds.length <= 1) return null
  const currentIndex = activeSessionId ? openTabIds.indexOf(activeSessionId) : -1
  if (currentIndex <= 0) {
    return openTabIds[openTabIds.length - 1]
  }
  return openTabIds[currentIndex - 1]
}

export interface CloseTabResult {
  nextTabs: string[]
  nextActiveId: string | null
}

/**
 * Calculates the resulting open tabs and new active session ID after closing a tab.
 * Matches standard Chrome/VS Code editor behavior:
 * - If the closed tab is active, activates the adjacent tab that slides into its index.
 * - If closing the last tab on the right, activates the preceding tab.
 * - If closing the sole tab, nextActiveId becomes null without breaking the app.
 * - If closing a background tab, activeSessionId remains unchanged.
 */
export function calculateCloseTabState(
  openTabIds: string[],
  activeSessionId: string | null,
  targetIdToClose: string
): CloseTabResult {
  const index = openTabIds.indexOf(targetIdToClose)
  const nextTabs = openTabIds.filter((id) => id !== targetIdToClose)

  if (activeSessionId !== targetIdToClose) {
    return {
      nextTabs,
      nextActiveId: activeSessionId,
    }
  }

  if (nextTabs.length === 0) {
    return {
      nextTabs,
      nextActiveId: null,
    }
  }

  const nextActiveIndex = index >= 0 && index < nextTabs.length ? index : nextTabs.length - 1
  return {
    nextTabs,
    nextActiveId: nextTabs[nextActiveIndex],
  }
}

/**
 * Returns the tab ID for a 1-based index (1-9).
 * Following Chrome/VS Code convention:
 * - 1 to 8: returns the tab at (n - 1)
 * - 9: always returns the last open tab
 */
export function getTabIdByIndex(openTabIds: string[], indexNumber: number): string | null {
  if (!openTabIds || openTabIds.length === 0) return null
  if (indexNumber === 9) {
    return openTabIds[openTabIds.length - 1]
  }
  const zeroBased = indexNumber - 1
  if (zeroBased >= 0 && zeroBased < openTabIds.length) {
    return openTabIds[zeroBased]
  }
  return null
}

/**
 * Calculates new tab list and closed IDs when closing other tabs.
 */
export function closeOtherTabsState(
  openTabIds: string[],
  keepId: string
): { nextTabs: string[]; closedIds: string[] } {
  if (!openTabIds.includes(keepId)) {
    return { nextTabs: openTabIds, closedIds: [] }
  }
  const nextTabs = [keepId]
  const closedIds = openTabIds.filter((id) => id !== keepId)
  return { nextTabs, closedIds }
}

/**
 * Calculates new tab list and closed IDs when closing all tabs to the right of targetId.
 */
export function closeTabsToRightState(
  openTabIds: string[],
  targetId: string
): { nextTabs: string[]; closedIds: string[] } {
  const index = openTabIds.indexOf(targetId)
  if (index === -1) {
    return { nextTabs: openTabIds, closedIds: [] }
  }
  const nextTabs = openTabIds.slice(0, index + 1)
  const closedIds = openTabIds.slice(index + 1)
  return { nextTabs, closedIds }
}

