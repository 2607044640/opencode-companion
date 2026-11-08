/**
 * Center Dialogue Finder
 *
 * Accurately finds the dialogue block closest to the vertical center of the user's screen/viewport,
 * specifically prioritizing collapsible blocks so mouse side button or shortcut triggers
 * smoothly expand/collapse the dialogue block right in front of the user.
 */

export interface DialogueElementBounds {
  top: number
  bottom: number
  height: number
}

export interface DialogueCandidateMeta {
  messageId: string
  role: 'user' | 'assistant'
  isCollapsible: boolean
  isExpanded: boolean
  bounds: DialogueElementBounds
}

export interface CenterDialogueResult {
  messageId: string
  role: 'user' | 'assistant'
  isCollapsible: boolean
  isExpanded: boolean
  distanceToCenter: number
}

/**
 * Calculates vertical distance between a candidate element and targetCenterY.
 * Returns 0 if targetCenterY falls strictly within [top, bottom].
 */
export function computeDistanceToCenter(bounds: DialogueElementBounds, targetCenterY: number): number {
  if (targetCenterY < bounds.top) {
    return bounds.top - targetCenterY
  }
  if (targetCenterY > bounds.bottom) {
    return targetCenterY - bounds.bottom
  }
  return 0
}

/**
 * Pure algorithm to select the best dialogue block given candidates and targetCenterY.
 * Priority:
 * 1. Collapsible candidate covering targetCenterY (distance === 0).
 * 2. If center element is not collapsible, the closest collapsible candidate.
 * 3. Fallback to closest non-collapsible candidate if no collapsible candidates exist.
 */
export function findCenterDialogue(
  candidates: DialogueCandidateMeta[],
  targetCenterY: number
): CenterDialogueResult | null {
  if (!candidates || candidates.length === 0) return null

  // Calculate distance for all candidates
  const scored = candidates.map((cand) => {
    const dist = computeDistanceToCenter(cand.bounds, targetCenterY)
    const elementCenter = (cand.bounds.top + cand.bounds.bottom) / 2
    const centerOffset = Math.abs(elementCenter - targetCenterY)
    return {
      cand,
      dist,
      centerOffset,
    }
  })

  // 1. Check for collapsible candidates
  const collapsibleCandidates = scored.filter((s) => s.cand.isCollapsible)

  if (collapsibleCandidates.length > 0) {
    // Sort by: distance to center line first, then center offset
    collapsibleCandidates.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist
      return a.centerOffset - b.centerOffset
    })

    const best = collapsibleCandidates[0]
    return {
      messageId: best.cand.messageId,
      role: best.cand.role,
      isCollapsible: best.cand.isCollapsible,
      isExpanded: best.cand.isExpanded,
      distanceToCenter: best.dist,
    }
  }

  // 2. Fallback: No collapsible candidates exist, return the closest candidate
  scored.sort((a, b) => {
    if (a.dist !== b.dist) return a.dist - b.dist
    return a.centerOffset - b.centerOffset
  })

  const best = scored[0]
  return {
    messageId: best.cand.messageId,
    role: best.cand.role,
    isCollapsible: best.cand.isCollapsible,
    isExpanded: best.cand.isExpanded,
    distanceToCenter: best.dist,
  }
}

/**
 * DOM helper: Finds the center dialogue block inside a container element.
 */
export function findCenterDialogueElement(
  container: HTMLElement | null,
  viewportHeight: number = typeof window !== 'undefined' ? window.innerHeight : 800
): {
  element: HTMLElement
  messageId: string
  role: 'user' | 'assistant'
  isCollapsible: boolean
  isExpanded: boolean
} | null {
  if (!container) return null

  const containerRect = container.getBoundingClientRect()
  if (containerRect.height <= 0 || containerRect.width <= 0) return null

  // Compute the visible vertical boundaries of the container
  const visibleTop = Math.max(0, containerRect.top)
  const visibleBottom = Math.min(viewportHeight, containerRect.bottom)
  if (visibleBottom <= visibleTop) return null

  // Target center Y: Screen center if inside visible container, otherwise container center
  const screenCenterY = viewportHeight / 2
  const targetCenterY =
    screenCenterY >= visibleTop && screenCenterY <= visibleBottom
      ? screenCenterY
      : (visibleTop + visibleBottom) / 2

  // Query message bubbles
  const bubbleEls = Array.from(
    container.querySelectorAll<HTMLElement>('[data-message-role="user"], [data-message-role="assistant"]')
  )

  const candidates: { el: HTMLElement; meta: DialogueCandidateMeta }[] = []

  for (const el of bubbleEls) {
    const rect = el.getBoundingClientRect()
    if (rect.height <= 0) continue

    const messageId = el.getAttribute('data-message-id') || el.id.replace(/^msg_/, '')
    if (!messageId) continue

    const role = (el.getAttribute('data-message-role') || 'assistant') as 'user' | 'assistant'
    const isCollapsible = el.getAttribute('data-collapsible') === 'true'
    const isExpanded = el.getAttribute('data-expanded') === 'true'

    candidates.push({
      el,
      meta: {
        messageId,
        role,
        isCollapsible,
        isExpanded,
        bounds: {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
        },
      },
    })
  }

  if (candidates.length === 0) return null

  const result = findCenterDialogue(
    candidates.map((c) => c.meta),
    targetCenterY
  )

  if (!result) return null

  const match = candidates.find((c) => c.meta.messageId === result.messageId)
  if (!match) return null

  return {
    element: match.el,
    messageId: result.messageId,
    role: result.role,
    isCollapsible: result.isCollapsible,
    isExpanded: result.isExpanded,
  }
}
