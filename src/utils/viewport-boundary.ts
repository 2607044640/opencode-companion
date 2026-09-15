export type VerticalPlacement = 'top' | 'bottom'
export type HorizontalAlign = 'start' | 'end' // 'start' = left-aligned, 'end' = right-aligned

export interface RectLike {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

export interface ViewportBoundaryOptions {
  triggerRect: RectLike
  dropdownRect: { width: number; height: number }
  viewport: { width: number; height: number }
  defaultPlacement?: VerticalPlacement
  defaultAlign?: HorizontalAlign
  margin?: number // Spacing between trigger and dropdown (default: 6)
  padding?: number // Safe distance from viewport edge (default: 8)
}

export interface ViewportBoundaryResult {
  placement: VerticalPlacement
  align: HorizontalAlign
  maxHeight?: number
  isFlippedVertical: boolean
  isFlippedHorizontal: boolean
}

/**
 * Computes whether a floating dropdown/popover overflows the viewport boundaries,
 * and if so, automatically flips it to the opposite side (e.g. bottom -> top, left -> right).
 * Clamps maximum available height if neither side fits entirely within the viewport.
 */
export function computeFlippedPosition(
  options: ViewportBoundaryOptions
): ViewportBoundaryResult {
  const {
    triggerRect,
    dropdownRect,
    viewport,
    defaultPlacement = 'bottom',
    defaultAlign = 'start',
    margin = 6,
    padding = 8,
  } = options

  const spaceBelow = Math.max(0, viewport.height - triggerRect.bottom - margin - padding)
  const spaceAbove = Math.max(0, triggerRect.top - margin - padding)
  const dropdownHeight = dropdownRect.height || 0
  const dropdownWidth = dropdownRect.width || 0

  let placement: VerticalPlacement = defaultPlacement
  let isFlippedVertical = false

  if (defaultPlacement === 'bottom') {
    // If downward opening overflows bottom edge and top offers more vertical headroom, flip up!
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      placement = 'top'
      isFlippedVertical = true
    }
  } else {
    // If upward opening overflows top edge and bottom offers more vertical headroom, flip down!
    if (spaceAbove < dropdownHeight && spaceBelow > spaceAbove) {
      placement = 'bottom'
      isFlippedVertical = true
    }
  }

  // Available vertical space based on chosen placement
  const availableSpace = placement === 'top' ? spaceAbove : spaceBelow
  let maxHeight: number | undefined
  if (dropdownHeight > availableSpace && availableSpace >= 60) {
    maxHeight = Math.floor(availableSpace)
  }

  // Horizontal alignment calculation
  let align: HorizontalAlign = defaultAlign
  let isFlippedHorizontal = false

  if (defaultAlign === 'start') {
    // Left-aligned: dropdown starts at triggerRect.left and extends to right
    const expectedRight = triggerRect.left + dropdownWidth
    if (expectedRight > viewport.width - padding) {
      const spaceIfEnd = triggerRect.right - dropdownWidth
      if (spaceIfEnd >= padding || (viewport.width - padding - expectedRight) < 0) {
        align = 'end'
        isFlippedHorizontal = true
      }
    }
  } else {
    // Right-aligned: dropdown ends at triggerRect.right and extends to left
    const expectedLeft = triggerRect.right - dropdownWidth
    if (expectedLeft < padding) {
      const spaceIfStart = viewport.width - (triggerRect.left + dropdownWidth)
      if (spaceIfStart >= padding) {
        align = 'start'
        isFlippedHorizontal = true
      }
    }
  }

  return {
    placement,
    align,
    maxHeight,
    isFlippedVertical,
    isFlippedHorizontal,
  }
}

/**
 * Returns Tailwind positioning utility classes based on boundary calculation result.
 */
export function getBoundaryPlacementClasses(
  result: ViewportBoundaryResult
): { placementClass: string; alignClass: string } {
  return {
    placementClass: result.placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
    alignClass: result.align === 'end' ? 'right-0' : 'left-0',
  }
}
