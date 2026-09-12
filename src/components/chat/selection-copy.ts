/**
 * Utilities for calculating text selection popover coordinates and validation.
 */

export interface RectLike {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

export interface ViewportLike {
  width: number
  height: number
}

export interface PopoverPosition {
  x: number
  y: number
  placement: 'top' | 'bottom'
}

/**
 * Calculates clamped floating popover coordinates relative to the viewport.
 */
export function calculatePopoverPosition(
  rect: RectLike,
  viewport: ViewportLike,
  options: {
    minMargin?: number
    popoverHeight?: number
    offset?: number
  } = {}
): PopoverPosition {
  const minMargin = options.minMargin ?? 75
  const offset = options.offset ?? 8
  const popoverHeight = options.popoverHeight ?? 36

  const centerX = rect.left + rect.width / 2
  const clampedX = Math.max(minMargin, Math.min(viewport.width - minMargin, centerX))

  // If there's enough space above the selection, position above, otherwise below
  const hasSpaceAbove = rect.top >= popoverHeight + offset
  const placement: 'top' | 'bottom' = hasSpaceAbove ? 'top' : 'bottom'
  const y = placement === 'top' ? rect.top - offset : rect.bottom + offset

  return {
    x: Math.round(clampedX),
    y: Math.round(y),
    placement,
  }
}

/**
 * Validates whether the text selection should trigger the floating copy menu.
 */
export function isValidTextSelection(
  text: string,
  activeElement?: { tagName?: string; isContentEditable?: boolean } | null
): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  if (activeElement) {
    const tag = activeElement.tagName?.toUpperCase()
    if (tag === 'INPUT' || tag === 'TEXTAREA' || activeElement.isContentEditable) {
      return false
    }
  }

  return true
}

/**
 * Checks if a DOM node is contained within the specified container element.
 */
export function isNodeInsideContainer(node: Node | null, container: HTMLElement | null): boolean {
  if (!container) return true
  if (!node) return false
  return container.contains(node)
}
