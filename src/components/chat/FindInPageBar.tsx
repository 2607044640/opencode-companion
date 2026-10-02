import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'
import type { Message } from '../../types/opencode'
import { useI18n } from '../../utils/i18n'
import { findMatchesInMessages, type FindMatch, type FindOptions } from '../../utils/find-in-page'
import {
  expandCollapsedFindTargets,
  resolveFindMessageElement,
  scrollContainerToMatch,
  locateTextMatchInElement,
  computeOverlayRect,
  collectAllMatchRanges,
  updateCSSHighlights,
  clearCSSHighlights,
  type ActiveMatchOverlayRect,
} from '../../utils/find-in-page-dom'

interface FindInPageBarProps {
  isOpen: boolean
  onClose: () => void
  messages: Message[]
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function FindInPageBar({
  isOpen,
  onClose,
  messages,
  containerRef,
}: FindInPageBarProps) {
  const { lang } = useI18n()
  const isZh = lang?.startsWith('zh') ?? true

  const [query, setQuery] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [matchWholeWord, setMatchWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [overlayRect, setOverlayRect] = useState<ActiveMatchOverlayRect | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const pulseTimerRef = useRef<number | null>(null)
  const jumpFrameRef = useRef<number | null>(null)
  const scrollRefineTimerRef = useRef<number | null>(null)

  const findOptions = useMemo<FindOptions>(
    () => ({ matchCase, matchWholeWord, useRegex }),
    [matchCase, matchWholeWord, useRegex]
  )

  const matches = useMemo(() => {
    return findMatchesInMessages(messages, query, findOptions)
  }, [messages, query, findOptions])

  const pulseHighlight = useCallback((el: HTMLElement) => {
    if (pulseTimerRef.current !== null) {
      window.clearTimeout(pulseTimerRef.current)
      pulseTimerRef.current = null
    }
    el.classList.remove('highlight-pulse', 'find-match-pulse')
    void el.offsetWidth
    el.classList.add('highlight-pulse', 'find-match-pulse')
    pulseTimerRef.current = window.setTimeout(() => {
      el.classList.remove('highlight-pulse', 'find-match-pulse')
      pulseTimerRef.current = null
    }, 1600)
  }, [])

  const jumpToMatch = useCallback(
    (match: FindMatch) => {
      const container = containerRef.current
      if (!match || !container) {
        setOverlayRect(null)
        return
      }

      const targetEl = resolveFindMessageElement(container, match.messageId)
      if (!targetEl) {
        setOverlayRect(null)
        return
      }

      if (jumpFrameRef.current !== null) {
        window.cancelAnimationFrame(jumpFrameRef.current)
        jumpFrameRef.current = null
      }

      const reveal = () => {
        const res = scrollContainerToMatch(container, targetEl, query, match.matchIndex, findOptions)
        pulseHighlight(res.hostEl)

        // Highlight all matches on page, with active match distinctly highlighted
        const allRanges = collectAllMatchRanges(container, query, findOptions)
        updateCSSHighlights(allRanges, res.range)

        if (res.rect && (res.rect.width > 0 || res.rect.height > 0)) {
          setOverlayRect(computeOverlayRect(container, res.rect))
        } else {
          setOverlayRect(null)
        }

        // Refine overlay coordinates once smooth-scroll completes
        if (scrollRefineTimerRef.current !== null) {
          window.clearTimeout(scrollRefineTimerRef.current)
        }
        scrollRefineTimerRef.current = window.setTimeout(() => {
          scrollRefineTimerRef.current = null
          if (!containerRef.current) return
          const fresh = locateTextMatchInElement(targetEl, query, match.matchIndex, findOptions)
          if (fresh?.rect && (fresh.rect.width > 0 || fresh.rect.height > 0)) {
            setOverlayRect(computeOverlayRect(containerRef.current, fresh.rect))
          }
        }, 350)
      }

      if (!expandCollapsedFindTargets(targetEl)) {
        reveal()
        return
      }

      jumpFrameRef.current = window.requestAnimationFrame(() => {
        jumpFrameRef.current = window.requestAnimationFrame(() => {
          jumpFrameRef.current = null
          reveal()
        })
      })
    },
    [containerRef, query, findOptions, pulseHighlight]
  )

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current)
      if (jumpFrameRef.current !== null) window.cancelAnimationFrame(jumpFrameRef.current)
      if (scrollRefineTimerRef.current !== null) window.clearTimeout(scrollRefineTimerRef.current)
      clearCSSHighlights()
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      clearCSSHighlights()
      setOverlayRect(null)
      return
    }

    if (matches.length > 0) {
      const nextIdx = currentIndex >= matches.length ? 0 : currentIndex
      setCurrentIndex(nextIdx)
      jumpToMatch(matches[nextIdx])
    } else {
      setCurrentIndex(0)
      clearCSSHighlights()
      setOverlayRect(null)
    }
  }, [matches, isOpen])

  // Clear highlights if query is emptied
  useEffect(() => {
    if (!query.trim() || matches.length === 0) {
      clearCSSHighlights()
      setOverlayRect(null)
    }
  }, [query, matches.length])

  // Re-anchor active overlay on window resize
  useEffect(() => {
    if (!isOpen || matches.length === 0) return
    const handleResize = () => {
      if (matches[currentIndex]) {
        jumpToMatch(matches[currentIndex])
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isOpen, matches, currentIndex, jumpToMatch])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
    }
  }, [isOpen])

  const goToNext = useCallback(() => {
    if (matches.length === 0) return
    const nextIdx = (currentIndex + 1) % matches.length
    setCurrentIndex(nextIdx)
    jumpToMatch(matches[nextIdx])
  }, [matches, currentIndex, jumpToMatch])

  const goToPrev = useCallback(() => {
    if (matches.length === 0) return
    const prevIdx = (currentIndex - 1 + matches.length) % matches.length
    setCurrentIndex(prevIdx)
    jumpToMatch(matches[prevIdx])
  }, [matches, currentIndex, jumpToMatch])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) {
        goToPrev()
      } else {
        goToNext()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      goToNext()
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      goToPrev()
      return
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="search"
      aria-label={isZh ? '页面内查找' : 'Find in Page'}
      className="absolute top-3 right-6 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#2d3340] bg-[#141720]/95 shadow-2xl backdrop-blur-md text-xs text-zinc-200 select-none animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isZh ? '在当前对话中查找...' : 'Find in conversation...'}
          className="w-48 sm:w-60 pl-7 pr-2.5 py-1 bg-[#0c0e13] border border-[#272b35] focus:border-purple-500/80 focus:ring-1 focus:ring-purple-500/30 rounded-lg text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all"
        />
      </div>

      <div className="flex items-center gap-0.5 border-r border-[#262a33] pr-1.5">
        <button
          type="button"
          onClick={() => setMatchCase((prev) => !prev)}
          className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
            matchCase
              ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
          title={isZh ? '区分大小写 (Match Case)' : 'Match Case'}
        >
          Aa
        </button>
        <button
          type="button"
          onClick={() => setMatchWholeWord((prev) => !prev)}
          className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
            matchWholeWord
              ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
          title={isZh ? '全字匹配 (Match Whole Word)' : 'Match Whole Word'}
        >
          ab
        </button>
        <button
          type="button"
          onClick={() => setUseRegex((prev) => !prev)}
          className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
            useRegex
              ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
          title={isZh ? '正则表达式 (Use Regex)' : 'Use Regular Expression'}
        >
          .*
        </button>
      </div>

      <div className="px-1 text-[11px] font-mono min-w-[55px] text-center shrink-0">
        {!query.trim() ? (
          <span className="text-zinc-600">—</span>
        ) : matches.length === 0 ? (
          <span className="text-zinc-500">{isZh ? 'No Results' : 'No Results'}</span>
        ) : (
          <span className="text-zinc-300">
            {currentIndex + 1} of {matches.length}
          </span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={goToPrev}
          disabled={matches.length === 0}
          className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-25 disabled:hover:bg-transparent rounded transition-colors cursor-pointer"
          title={isZh ? '上一项 (Shift+Enter 或 ↑)' : 'Previous Match (Shift+Enter or ↑)'}
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={goToNext}
          disabled={matches.length === 0}
          className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-25 disabled:hover:bg-transparent rounded transition-colors cursor-pointer"
          title={isZh ? '下一项 (Enter 或 ↓)' : 'Next Match (Enter or ↓)'}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors ml-0.5 cursor-pointer"
        title={isZh ? '关闭 (Esc)' : 'Close (Esc)'}
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {containerRef.current && overlayRect && createPortal(
        <div
          data-find-overlay="active"
          className="find-active-match-overlay"
          style={{
            top: `${overlayRect.top - 2}px`,
            left: `${overlayRect.left - 3}px`,
            width: `${overlayRect.width + 6}px`,
            height: `${overlayRect.height + 4}px`,
          }}
        >
          <span
            className={`find-active-match-badge ${
              overlayRect.top < 32 ? 'badge-below' : 'badge-above'
            }`}
          >
            {currentIndex + 1} / {matches.length}
          </span>
        </div>,
        containerRef.current
      )}
    </div>
  )
}
