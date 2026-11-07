/**
 * Half-Line Cut Algorithm (图2 文本半行截断对齐算法)
 * 
 * Ensures that when text is collapsed (for both user inputs and AI responses),
 * the bottom-most visible line is ALWAYS sliced horizontally at its vertical midline (~50% glyph height).
 * 
 * This provides an unmistakable visual affordance (matching Figure 2) that content
 * is truncated and continues below, removing any ambiguity about whether the text is collapsed.
 */

import { useState, useLayoutEffect, useEffect, useRef, useCallback } from 'react'

export interface HalfLineCutOptions {
  /**
   * The 1-based index of the line to slice at 50% height.
   * e.g. targetLineIndex = 4 means lines 1-3 are fully shown, and line 4 is cut at 50% height (3.5 lines total).
   * For user input, default is 4 (shows 3.5 lines).
   * For AI response, default is 5 (shows 4.5 lines).
   */
  targetLineIndex?: number
  /**
   * Fallback pixel height if DOM measurement is unavailable (e.g. SSR or initial mount).
   */
  fallbackHeight?: number
  /**
   * Whether the container is currently collapsed.
   */
  isCollapsed?: boolean
}

/**
 * Calculates the exact pixel height to slice content at the vertical midline
 * of targetLineIndex (e.g. line 4 for user input -> 3.5 lines; line 5 for AI response -> 4.5 lines).
 */
export function calculateHalfLineCutHeight(
  container: HTMLElement,
  targetLineIndex: number = 4
): number | null {
  if (!container) return null
  const containerRect = container.getBoundingClientRect()
  if (containerRect.height <= 0) return null

  // Collect line rects using TreeWalker over all visible text nodes
  const lineMap: Map<number, { top: number; bottom: number; height: number }> = new Map()

  const doc = container.ownerDocument || document
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent || !node.textContent.trim()) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  let node = walker.nextNode()
  while (node) {
    try {
      const range = doc.createRange()
      range.selectNodeContents(node)
      const rects = range.getClientRects()
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i]
        // Disregard zero-height or zero-width rects
        if (r.height < 4 || r.width <= 0) continue

        // Group rects into lines by top position (within 4px is considered the same visual line)
        let foundKey: number | null = null
        for (const key of lineMap.keys()) {
          if (Math.abs(key - r.top) < 4) {
            foundKey = key
            break
          }
        }

        if (foundKey !== null) {
          const line = lineMap.get(foundKey)!
          line.bottom = Math.max(line.bottom, r.bottom)
          line.height = line.bottom - line.top
        } else {
          lineMap.set(r.top, {
            top: r.top,
            bottom: r.bottom,
            height: r.height,
          })
        }
      }
    } catch {
      // Ignore range errors on disconnected nodes
    }
    node = walker.nextNode()
  }

  // Sort lines from top to bottom
  const lines = Array.from(lineMap.values()).sort((a, b) => a.top - b.top)

  // If fewer than 2 lines, cannot cut a line in half sensibly
  if (lines.length < 2) {
    return null
  }

  // Target line is at actualTarget - 1 (e.g. index 3 for 4th line)
  // If lines.length is less than targetLineIndex, cut the last line in half so it's visibly collapsed!
  const actualTarget = Math.min(targetLineIndex, lines.length)
  const targetLine = lines[actualTarget - 1]

  // The slice cut point is at the vertical 50% mark of the target line
  const midLine = targetLine.top + targetLine.height * 0.5 - containerRect.top + (container.scrollTop || 0)

  return Math.max(20, Math.round(midLine))
}

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * React hook that dynamically calculates and updates the 50%-line slice height.
 * Attaches a ResizeObserver to re-evaluate on window or container size changes.
 */
export function useHalfLineClipper(options: HalfLineCutOptions = {}) {
  const {
    targetLineIndex = 4,
    fallbackHeight = 84, // 3.5 lines @ 24px line-height = 84px
    isCollapsed = true,
  } = options

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [cutHeight, setCutHeight] = useState<number | null>(null)

  const recompute = useCallback(() => {
    if (!containerRef.current) return
    const h = calculateHalfLineCutHeight(containerRef.current, targetLineIndex)
    if (h !== null && h > 0) {
      setCutHeight((prev) => (prev === h ? prev : h))
    }
  }, [targetLineIndex])

  useIsomorphicLayoutEffect(() => {
    recompute()

    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const ro = new ResizeObserver(() => {
      recompute()
    })

    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [recompute, isCollapsed])

  const effectiveHeight = cutHeight ?? fallbackHeight

  return {
    containerRef,
    cutHeight,
    effectiveHeight,
    recompute,
  }
}
