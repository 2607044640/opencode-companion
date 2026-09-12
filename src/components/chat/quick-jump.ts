export interface UserMessageRect {
  index: number
  top: number
  bottom: number
}

/**
 * Calculates which user message index to scroll to when jumping UP (previous dialogue).
 * @param containerTop Top of visible container viewport
 * @param userMessages Rects of all user messages relative to the same coordinate system
 * @returns Target user message index, or null to scroll to top (0)
 */
export function findJumpTargetIndex(
  containerTop: number,
  userMessages: UserMessageRect[]
): number | null {
  if (userMessages.length === 0) return null

  // 1. Traverse backwards to find the nearest user message above the visible viewport boundary
  for (let i = userMessages.length - 1; i >= 0; i--) {
    const item = userMessages[i]
    if (item.top < containerTop - 30) {
      return item.index
    }
  }

  // 2. If no user message is above containerTop - 30:
  // If we are already near message 0, return null (signal to scroll to top 0)
  if (Math.abs(userMessages[0].top - containerTop) <= 40) {
    return null
  }
  return userMessages[0].index
}

/**
 * Calculates which user message index to scroll to when jumping DOWN (next dialogue).
 * @param containerTop Top of visible container viewport
 * @param userMessages Rects of all user messages relative to the same coordinate system
 * @returns Target user message index, or null to scroll to the end of timeline
 */
export function findNextJumpTargetIndex(
  containerTop: number,
  userMessages: UserMessageRect[]
): number | null {
  if (userMessages.length === 0) return null

  // Traverse forwards to find the nearest user message below the visible viewport boundary
  for (let i = 0; i < userMessages.length; i++) {
    const item = userMessages[i]
    if (item.top > containerTop + 30) {
      return item.index
    }
  }

  // Reached past the last user message -> return null (signal to scroll to bottom)
  return null
}

/**
 * Checks if a user prompt should be collapsible and whether it starts collapsed.
 */
export function evaluatePromptCollapsing(
  fullText: string,
  options: {
    autoCollapsePrompt?: boolean
    promptCharThreshold?: number
    promptLineThreshold?: number
  } = {}
): {
  lineCount: number
  charCount: number
  isCollapsible: boolean
  defaultCollapsed: boolean
} {
  const lineCount = fullText ? fullText.split('\n').length : 0
  const charCount = fullText.length
  const {
    autoCollapsePrompt = true,
    promptCharThreshold = 240,
    promptLineThreshold = 4,
  } = options

  const isCollapsible =
    charCount > 150 ||
    lineCount > 3 ||
    (autoCollapsePrompt && (charCount > promptCharThreshold || lineCount > promptLineThreshold))

  const defaultCollapsed =
    autoCollapsePrompt && (charCount > promptCharThreshold || lineCount > promptLineThreshold)

  return {
    lineCount,
    charCount,
    isCollapsible,
    defaultCollapsed,
  }
}

export interface DialogueTick {
  index: number
  percentage: number
  offsetTop: number
  isActive: boolean
  snippet: string
}

export interface DialogueElementInfo {
  offsetTop: number
  textContent?: string | null
  promptPreview?: string | null
}

/**
 * Computes the relative vertical positions and preview snippets for all dialogue turns on the navigation rail.
 */
export function computeDialogueTicks(
  container: { scrollHeight: number; scrollTop: number; clientHeight: number },
  userElements: DialogueElementInfo[]
): DialogueTick[] {
  const { scrollHeight, scrollTop, clientHeight } = container
  if (scrollHeight <= 0 || userElements.length === 0) return []

  // Use scrollHeight as base mapping so tick positions correspond directly to the visual track
  return userElements.map((el, idx) => {
    const rawPct = (el.offsetTop / Math.max(1, scrollHeight)) * 100
    const percentage = Math.min(97, Math.max(3, Math.round(rawPct * 10) / 10))

    // Active if message top is within or immediately adjacent to the visible viewport
    const isActive =
      el.offsetTop >= scrollTop - 60 &&
      el.offsetTop <= scrollTop + clientHeight - 40

    const rawText = (el.promptPreview || el.textContent || '').trim().replace(/\s+/g, ' ')
    const snippet = rawText.length > 36 ? rawText.slice(0, 36) + '…' : rawText || `对话 #${idx + 1}`

    return {
      index: idx,
      percentage,
      offsetTop: el.offsetTop,
      isActive,
      snippet,
    }
  })
}

/**
 * Computes the position and size of the viewport indicator thumb on the track rail.
 */
export function computeViewportThumb(container: {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}): { topPct: number; heightPct: number } {
  const { scrollHeight, scrollTop, clientHeight } = container
  if (scrollHeight <= 0 || clientHeight >= scrollHeight) {
    return { topPct: 0, heightPct: 100 }
  }

  const heightPct = Math.max(8, Math.min(100, (clientHeight / scrollHeight) * 100))
  const topPct = (scrollTop / Math.max(1, scrollHeight)) * 100
  const clampedTopPct = Math.max(0, Math.min(100 - heightPct, topPct))

  return {
    topPct: Math.round(clampedTopPct * 10) / 10,
    heightPct: Math.round(heightPct * 10) / 10,
  }
}

/**
 * Dispatches distinct text payloads for command-line string vs. command-output preview.
 */
export function resolveCommandCopyText(
  kind: 'command' | 'output',
  item: { command: string; outputPreview?: string }
): string {
  if (kind === 'command') {
    return item.command
  }
  return item.outputPreview || ''
}


