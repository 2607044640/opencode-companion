import { useState, useEffect, useRef, useCallback } from 'react'
import { Copy, Check, Quote as QuoteIcon } from 'lucide-react'
import {
  calculatePopoverPosition,
  isValidTextSelection,
  isNodeInsideContainer,
  shouldDismissOnEscape,
  shouldDismissOnMouseDownOutside,
  shouldDismissOnCollapsedSelection,
  isQuoteShortcut,
  type PopoverPosition,
} from './selection-copy'

export interface SelectionCopyFeedbackProps {
  /** Target container to scope selection listening (defaults to document) */
  containerRef?: React.RefObject<HTMLElement | null>
  /** Auto-dismiss duration in milliseconds after copy or quote (default: 1000ms / 1s) */
  durationMs?: number
  /** Active session ID to auto-dismiss on session switch */
  sessionId?: string
  /** Callback invoked when the user quotes the active text selection */
  onQuote?: (text: string) => void
}

export function SelectionCopyFeedback({
  containerRef,
  durationMs = 1000,
  sessionId,
  onQuote,
}: SelectionCopyFeedbackProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [feedbackState, setFeedbackState] = useState<'copied' | 'quoted' | null>(null)
  const [selectedText, setSelectedText] = useState('')
  const [position, setPosition] = useState<PopoverPosition | null>(null)

  const popoverRef = useRef<HTMLDivElement>(null)
  const isVisibleRef = useRef(false)
  const feedbackStateRef = useRef<'copied' | 'quoted' | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentRangeRef = useRef<Range | null>(null)
  const selectedTextRef = useRef('')

  isVisibleRef.current = isVisible
  feedbackStateRef.current = feedbackState
  selectedTextRef.current = selectedText

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
  }, [])

  const dismiss = useCallback(() => {
    clearDismissTimer()
    setIsVisible(false)
    setFeedbackState(null)
    currentRangeRef.current = null
    setPosition(null)
  }, [clearDismissTimer])

  // Recalculate position from current selection range
  const updatePositionFromRange = useCallback((range: Range) => {
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return false

    // Check if selection is inside viewport
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      return false
    }

    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    }

    // Anchor near the selection's end position if client rects are available
    let anchorX: number | undefined
    try {
      const rects = range.getClientRects()
      if (rects.length > 0) {
        const lastRect = rects[rects.length - 1]
        anchorX = lastRect.right - Math.min(60, lastRect.width / 2)
      }
    } catch {
      // fallback
    }

    const pos = calculatePopoverPosition(rect, viewport, {
      minMargin: 75,
      popoverHeight: 34,
      offset: 8,
      anchorX,
    })

    setPosition(pos)
    return true
  }, [])

  // Trigger feedback state with auto-dismiss
  const triggerFeedback = useCallback(
    (type: 'copied' | 'quoted') => {
      clearDismissTimer()
      setFeedbackState(type)
      setIsVisible(true)

      dismissTimerRef.current = setTimeout(() => {
        dismiss()
      }, durationMs)
    },
    [clearDismissTimer, dismiss, durationMs]
  )

  // Perform Quote action
  const triggerQuote = useCallback(
    (textToQuote: string) => {
      const clean = textToQuote.trim()
      if (!clean) return

      if (onQuote) {
        onQuote(clean)
      }

      try {
        window.dispatchEvent(
          new CustomEvent('companion:quote-selection', {
            detail: { text: clean },
          })
        )
      } catch {
        // ignore
      }

      triggerFeedback('quoted')
    },
    [onQuote, triggerFeedback]
  )

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      clearDismissTimer()
    }
  }, [clearDismissTimer])

  // Dismiss immediately when active session switches
  useEffect(() => {
    if (sessionId) {
      dismiss()
    }
  }, [sessionId, dismiss])

  // Check text selection in DOM
  const checkSelection = useCallback(() => {
    const selection = window.getSelection()
    const isCollapsed = !selection || selection.isCollapsed || selection.rangeCount === 0
    if (shouldDismissOnCollapsedSelection(isCollapsed, Boolean(feedbackStateRef.current))) {
      dismiss()
      return
    }
    if (isCollapsed) return

    const text = selection.toString()
    if (!isValidTextSelection(text, document.activeElement)) {
      if (!feedbackStateRef.current) {
        dismiss()
      }
      return
    }

    const range = selection.getRangeAt(0)

    // Scope check if containerRef is provided
    if (containerRef?.current) {
      const commonNode = range.commonAncestorContainer
      if (!isNodeInsideContainer(commonNode, containerRef.current)) {
        if (!feedbackStateRef.current) {
          dismiss()
        }
        return
      }
    }

    currentRangeRef.current = range.cloneRange()
    const valid = updatePositionFromRange(range)
    if (!valid) {
      if (!feedbackStateRef.current) {
        dismiss()
      }
      return
    }

    const trimmed = text.trim()
    setSelectedText(trimmed)
    selectedTextRef.current = trimmed
    if (!feedbackStateRef.current) {
      setIsVisible(true)
      setFeedbackState(null)
    }
  }, [containerRef, updatePositionFromRange, dismiss])

  // Handle user clicking Quote button
  const handleQuoteClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selectedText) return
    triggerQuote(selectedText)
  }

  // Handle user clicking the floating copy button
  const handleCopyClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!selectedText) return

    try {
      await navigator.clipboard.writeText(selectedText)
    } catch {
      // Fallback using execCommand if clipboard API fails
      try {
        const textarea = document.createElement('textarea')
        textarea.value = selectedText
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      } catch {
        // ignore
      }
    }

    triggerFeedback('copied')
  }

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        return
      }
      setTimeout(checkSelection, 20)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
        setTimeout(checkSelection, 20)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldDismissOnEscape(e.key, isVisibleRef.current)) {
        dismiss()
        return
      }

      // Check Ctrl+L shortcut for Quote
      if (isQuoteShortcut(e)) {
        const textToQuote = selectedTextRef.current || window.getSelection()?.toString().trim()
        if (textToQuote && isValidTextSelection(textToQuote, document.activeElement)) {
          e.preventDefault()
          e.stopPropagation()
          triggerQuote(textToQuote)
        }
      }
    }

    const handleMouseDown = (e: MouseEvent) => {
      const isInside = Boolean(popoverRef.current && popoverRef.current.contains(e.target as Node))
      if (shouldDismissOnMouseDownOutside(isInside, isVisibleRef.current)) {
        dismiss()
      }
    }

    // Capture native copy (Ctrl+C, Cmd+C, or Context Menu -> Copy)
    const handleCopyEvent = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return

      const text = selection.toString().trim()
      if (!text) return

      if (containerRef?.current) {
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null
        if (range && !isNodeInsideContainer(range.commonAncestorContainer, containerRef.current)) {
          return
        }
      }

      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        currentRangeRef.current = range.cloneRange()
        updatePositionFromRange(range)
      }

      setSelectedText(text)
      selectedTextRef.current = text
      triggerFeedback('copied')
    }

    const handleScroll = () => {
      if (currentRangeRef.current && isVisibleRef.current) {
        const valid = updatePositionFromRange(currentRangeRef.current)
        if (!valid) {
          dismiss()
        }
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('keyup', handleKeyUp)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('copy', handleCopyEvent)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('copy', handleCopyEvent)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [checkSelection, triggerFeedback, triggerQuote, updatePositionFromRange, dismiss, containerRef])

  if (!isVisible || !position) {
    return null
  }

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: position.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
        zIndex: 9999,
      }}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-sans shadow-2xl transition-all duration-150 select-none ${
        feedbackState === 'copied'
          ? 'bg-[#0f1d15]/95 border border-emerald-500/70 text-emerald-300 shadow-emerald-950/40 animate-in zoom-in-95 duration-100'
          : feedbackState === 'quoted'
          ? 'bg-[#0d1829]/95 border border-sky-500/70 text-sky-300 shadow-sky-950/40 animate-in zoom-in-95 duration-100'
          : 'bg-[#181a20]/95 backdrop-blur-md border border-[#30363d] text-zinc-200 hover:border-zinc-500 shadow-black/70 animate-in fade-in zoom-in-95 duration-100'
      }`}
    >
      {feedbackState === 'copied' ? (
        <div
          onClick={dismiss}
          className="flex items-center gap-1.5 font-medium text-[11px] text-emerald-300 cursor-pointer"
          title="点击关闭"
        >
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>已复制</span>
        </div>
      ) : feedbackState === 'quoted' ? (
        <div
          onClick={dismiss}
          className="flex items-center gap-1.5 font-medium text-[11px] text-sky-300 cursor-pointer"
          title="点击关闭"
        >
          <QuoteIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>已引用</span>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          {/* Quote Button (Ctrl+L) matching Antigravity design */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
            }}
            onClick={handleQuoteClick}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-zinc-800/80 hover:text-white transition-colors cursor-pointer group"
            title="引用所选文字到输入框 (Ctrl+L)"
          >
            <QuoteIcon className="w-3.5 h-3.5 text-sky-400 group-hover:text-sky-300 transition-colors shrink-0" />
            <span className="font-medium text-[11px] text-zinc-100 group-hover:text-white">Quote</span>
            <span className="text-[9px] text-zinc-400 font-mono ml-0.5 group-hover:text-zinc-300">
              Ctrl+L
            </span>
          </button>

          <div className="w-px h-3 bg-zinc-700/60 mx-0.5" />

          {/* Copy Button (Ctrl+C) */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
            }}
            onClick={handleCopyClick}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-zinc-800/80 hover:text-white transition-colors cursor-pointer group"
            title="复制所选文字 (Ctrl+C)"
          >
            <Copy className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors shrink-0" />
            <span className="font-medium text-[11px] text-zinc-300 group-hover:text-white">复制</span>
            <span className="text-[9px] text-zinc-500 font-mono ml-0.5 group-hover:text-zinc-400">
              Ctrl+C
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
