export interface CalculatePreviewPositionParams {
  mouseX: number
  mouseY: number
  previewWidth?: number
  previewHeight?: number
  viewportWidth?: number
  viewportHeight?: number
  margin?: number
  cursorOffset?: number
}

export interface PreviewPositionResult {
  x: number
  y: number
  placement: 'right' | 'left'
  maxHeight: number
  maxWidth: number
}

/**
 * Calculates viewport-aware floating coordinates for the session preview popover
 * based on the user's cursor position.
 */
export function calculatePreviewPosition({
  mouseX,
  mouseY,
  previewWidth = 520,
  previewHeight = 560,
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800,
  margin = 16,
  cursorOffset = 20,
}: CalculatePreviewPositionParams): PreviewPositionResult {
  const effectiveWidth = Math.min(previewWidth, Math.max(280, viewportWidth - margin * 2))
  const effectiveHeight = Math.min(previewHeight, Math.max(200, viewportHeight - margin * 2))

  const spaceOnRight = viewportWidth - (mouseX + cursorOffset)
  const spaceOnLeft = mouseX - cursorOffset

  let x: number
  let placement: 'right' | 'left'

  if (spaceOnRight >= effectiveWidth + margin) {
    x = mouseX + cursorOffset
    placement = 'right'
  } else if (spaceOnLeft >= effectiveWidth + margin) {
    x = mouseX - cursorOffset - effectiveWidth
    placement = 'left'
  } else {
    placement = spaceOnRight >= spaceOnLeft ? 'right' : 'left'
    x = Math.max(margin, Math.min(viewportWidth - effectiveWidth - margin, mouseX - effectiveWidth / 2))
  }

  // Vertically place near cursor level (slightly above by default so cursor is near upper body)
  let y = mouseY - 48
  y = Math.max(margin, Math.min(viewportHeight - effectiveHeight - margin, y))

  return {
    x: Math.round(x),
    y: Math.round(y),
    placement,
    maxHeight: Math.max(200, viewportHeight - y - margin),
    maxWidth: effectiveWidth,
  }
}
