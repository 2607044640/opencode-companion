/**
 * Tab reorder utility for OpenCode Companion top session tabs.
 * Supports drag-and-drop reordering with boundary safety and preservation of unmanaged items.
 */

export type DropPosition = 'before' | 'after'

/**
 * Reorders a list of tab IDs by moving `sourceId` before or after `targetId`.
 *
 * Edge cases handled:
 * - If sourceId === targetId: returns a copy of array without reordering.
 * - If sourceId or targetId is missing in tabIds: returns original copy.
 * - Preserves all other elements in their relative order.
 */
export function reorderTabIds(
  tabIds: readonly string[],
  sourceId: string,
  targetId: string,
  position: DropPosition
): string[] {
  if (!tabIds || tabIds.length <= 1) return [...tabIds]
  if (sourceId === targetId) return [...tabIds]

  const sourceIndex = tabIds.indexOf(sourceId)
  const targetIndex = tabIds.indexOf(targetId)
  if (sourceIndex === -1 || targetIndex === -1) return [...tabIds]

  const next = [...tabIds]
  next.splice(sourceIndex, 1)

  const newTargetIndex = next.indexOf(targetId)
  if (newTargetIndex === -1) return [...tabIds]

  const insertIndex = position === 'after' ? newTargetIndex + 1 : newTargetIndex
  next.splice(insertIndex, 0, sourceId)

  return next
}

/**
 * Reorders tab IDs by numerical indexes.
 */
export function reorderTabIdsByIndex(
  tabIds: readonly string[],
  fromIndex: number,
  toIndex: number
): string[] {
  if (!tabIds || tabIds.length <= 1) return [...tabIds]
  if (
    fromIndex < 0 ||
    fromIndex >= tabIds.length ||
    toIndex < 0 ||
    toIndex >= tabIds.length ||
    fromIndex === toIndex
  ) {
    return [...tabIds]
  }

  const next = [...tabIds]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

/**
 * Determines whether a drag-over event is on the left half ('before') or right half ('after') of the element.
 */
export function calculateDropPosition(
  clientX: number,
  rect: { left: number; width: number }
): DropPosition {
  if (!rect || rect.width <= 0) return 'before'
  const midpoint = rect.left + rect.width / 2
  return clientX >= midpoint ? 'after' : 'before'
}
