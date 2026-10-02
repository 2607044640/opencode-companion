import { compileFindQuery, FIND_MATCH_FALLBACK_PADDING_PX, type FindOptions } from './find-in-page'

export interface FindMatchDOMTarget {
  readonly range: Range
  readonly rect: DOMRect
  readonly highlightEl: HTMLElement
}

function clickCollapsedToggle(el: Element): boolean {
  const clickable = el.closest('button, [role="button"], .cursor-pointer')
  if (!(clickable instanceof HTMLElement)) return false
  clickable.click()
  return true
}

export function expandCollapsedFindTargets(messageEl: HTMLElement): boolean {
  let expanded = false

  for (const details of messageEl.querySelectorAll('details')) {
    if (details instanceof HTMLDetailsElement && !details.open) {
      details.open = true
      expanded = true
    }
  }

  for (const svg of messageEl.querySelectorAll('.lucide-chevron-right')) {
    if (clickCollapsedToggle(svg)) expanded = true
  }

  for (const btn of messageEl.querySelectorAll('button')) {
    const label = `${btn.getAttribute('title') ?? ''} ${btn.textContent ?? ''}`
    if (/展开提问内容|Expand prompt|Prompt ausklappen/i.test(label)) {
      btn.click()
      expanded = true
    }
  }

  return expanded
}

function findHighlightHost(node: Text): HTMLElement {
  let el: HTMLElement | null = node.parentElement
  while (el) {
    if (el.hasAttribute('data-message-id')) {
      const inner = el.querySelector(':scope > div')
      return inner instanceof HTMLElement ? inner : el
    }
    const tag = el.tagName
    if (
      tag === 'P' ||
      tag === 'PRE' ||
      tag === 'LI' ||
      tag === 'BLOCKQUOTE' ||
      tag === 'TD' ||
      tag === 'H1' ||
      tag === 'H2' ||
      tag === 'H3' ||
      tag === 'H4'
    ) {
      return el
    }
    el = el.parentElement
  }
  return node.parentElement ?? document.body
}

export function locateTextMatchInElement(
  messageEl: HTMLElement,
  query: string,
  matchIndexInMessage: number,
  options: FindOptions = {}
): FindMatchDOMTarget | null {
  if (typeof document === 'undefined') return null
  const regex = compileFindQuery(query, options)
  if (!regex) return null

  const walker = document.createTreeWalker(messageEl, NodeFilter.SHOW_TEXT)
  let remaining = matchIndexInMessage
  let current = walker.nextNode()

  while (current) {
    if (!(current instanceof Text)) {
      current = walker.nextNode()
      continue
    }

    const parent = current.parentElement
    if (parent?.closest('.sr-only, script, style, .find-active-match-overlay')) {
      current = walker.nextNode()
      continue
    }

    const value = current.data
    regex.lastIndex = 0
    let match = regex.exec(value)
    while (match) {
      if (match[0].length === 0) {
        regex.lastIndex++
        match = regex.exec(value)
        continue
      }

      if (remaining === 0) {
        const range = document.createRange()
        range.setStart(current, match.index)
        range.setEnd(current, match.index + match[0].length)
        return {
          range,
          rect: range.getBoundingClientRect(),
          highlightEl: findHighlightHost(current),
        }
      }

      remaining -= 1
      if (match.index === regex.lastIndex) regex.lastIndex++
      match = regex.exec(value)
    }

    current = walker.nextNode()
  }

  return null
}

export function findMatchDOMTarget(
  messageEl: HTMLElement,
  query: string,
  matchIndexInMessage: number,
  options: FindOptions = {}
): FindMatchDOMTarget | null {
  expandCollapsedFindTargets(messageEl)
  return locateTextMatchInElement(messageEl, query, matchIndexInMessage, options)
}

export function resolveFindMessageElement(
  container: HTMLElement,
  messageId: string
): HTMLElement | null {
  const escaped = CSS.escape(messageId)
  return (
    container.querySelector<HTMLElement>(
      `[data-message-id="${escaped}"]:not(.sr-only)`
    ) ?? container.querySelector<HTMLElement>(`#msg_${escaped}:not(.sr-only)`)
  )
}

export function computeMatchScrollTop(
  container: HTMLElement,
  matchRect: DOMRect | null,
  fallbackEl: HTMLElement
): number {
  const containerRect = container.getBoundingClientRect()
  const matchUsable = matchRect !== null && (matchRect.height > 0 || matchRect.width > 0)
  if (matchUsable && matchRect) {
    const matchTopInContainer = matchRect.top - containerRect.top + container.scrollTop
    return Math.max(
      0,
      matchTopInContainer - container.clientHeight / 2 + matchRect.height / 2
    )
  }
  const elRect = fallbackEl.getBoundingClientRect()
  return Math.max(
    0,
    elRect.top - containerRect.top + container.scrollTop - FIND_MATCH_FALLBACK_PADDING_PX
  )
}

export interface ScrollMatchResult {
  hostEl: HTMLElement
  rect: DOMRect | null
  range: Range | null
}

export function scrollContainerToMatch(
  container: HTMLElement,
  messageEl: HTMLElement,
  query: string,
  matchIndexInMessage: number,
  options: FindOptions = {}
): ScrollMatchResult {
  const located = locateTextMatchInElement(messageEl, query, matchIndexInMessage, options)
  container.scrollTo({
    top: computeMatchScrollTop(container, located?.rect ?? null, messageEl),
    behavior: 'smooth',
  })
  return {
    hostEl: located?.highlightEl ?? messageEl,
    rect: located?.rect ?? null,
    range: located?.range ?? null,
  }
}

export interface ActiveMatchOverlayRect {
  top: number
  left: number
  width: number
  height: number
}

export function computeOverlayRect(
  container: HTMLElement,
  matchRect: DOMRect
): ActiveMatchOverlayRect {
  const containerRect = container.getBoundingClientRect()
  return {
    top: matchRect.top - containerRect.top + container.scrollTop,
    left: matchRect.left - containerRect.left + container.scrollLeft,
    width: Math.max(matchRect.width, 6),
    height: Math.max(matchRect.height, 16),
  }
}

export function collectAllMatchRanges(
  container: HTMLElement,
  query: string,
  options: FindOptions = {}
): Range[] {
  if (typeof document === 'undefined') return []
  const regex = compileFindQuery(query, options)
  if (!regex) return []

  const ranges: Range[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()

  while (current) {
    if (!(current instanceof Text)) {
      current = walker.nextNode()
      continue
    }

    const parent = current.parentElement
    if (
      parent?.closest(
        '.sr-only, script, style, [role="search"], .find-in-page-bar, .find-active-match-overlay'
      )
    ) {
      current = walker.nextNode()
      continue
    }

    const value = current.data
    regex.lastIndex = 0
    let match = regex.exec(value)
    while (match) {
      if (match[0].length === 0) {
        regex.lastIndex++
        match = regex.exec(value)
        continue
      }

      try {
        const range = document.createRange()
        range.setStart(current, match.index)
        range.setEnd(current, match.index + match[0].length)
        ranges.push(range)
      } catch {
        // Range boundary safety
      }

      if (match.index === regex.lastIndex) regex.lastIndex++
      match = regex.exec(value)
    }

    current = walker.nextNode()
  }

  return ranges
}

export function updateCSSHighlights(
  allRanges: Range[],
  activeRange: Range | null = null
): void {
  if (typeof window === 'undefined') return
  const win = window as any
  const css = win.CSS
  const HighlightCtor = win.Highlight

  if (!css || typeof css.highlights === 'undefined' || typeof HighlightCtor !== 'function') {
    return
  }

  try {
    if (allRanges.length > 0) {
      const allHighlight = new HighlightCtor(...allRanges)
      allHighlight.priority = 1
      css.highlights.set('find-match', allHighlight)
    } else {
      css.highlights.delete('find-match')
    }

    if (activeRange) {
      const activeHighlight = new HighlightCtor(activeRange)
      activeHighlight.priority = 2
      css.highlights.set('find-match-active', activeHighlight)
    } else {
      css.highlights.delete('find-match-active')
    }
  } catch (err) {
    console.error('Failed to update CSS highlights:', err)
  }
}

export function clearCSSHighlights(): void {
  if (typeof window === 'undefined') return
  const win = window as any
  const css = win.CSS
  if (!css || typeof css.highlights === 'undefined') return

  try {
    css.highlights.delete('find-match')
    css.highlights.delete('find-match-active')
  } catch {
    // ignore
  }
}
