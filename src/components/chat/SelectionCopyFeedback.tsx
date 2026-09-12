import { useState, useEffect, useRef, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import {
  calculatePopoverPosition,
  isValidTextSelection,
  isNodeInsideContainer,
  type PopoverPosition,
} from './selection-copy'

export interface SelectionCopyFeedbackProps {
  /** Target container to scope selection listening (defaults to document) */
  containerRef?: React.RefObject<HTMLElement | null>
  /** Auto-dismiss duration in milliseconds after copy (default: 1000ms / 1s) */
  durationMs?: number
}

export function SelectionCopyFeedback({
  containerRef,
  durationMs = 1000,
}: SelectionCopyFeedbackProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const [position, setPosition] = useState<PopoverPosition | null>(null)

  const popoverRef = useRef<HTMLDivElement>(null)
  const isCopiedRef = useRef(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentRangeRef = useRef<Range | null>(null)

  isCopiedRef.current = isCopied

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
  }, [])

  // Recalculate position from current selection range
  const updatePositionFromRange = useCallback(
    (range: Range) => {
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

      const pos = calculatePopoverPosition(rect, viewport, {
        minMargin: 75,
        popoverHeight: 32,
        offset: 8,
      })

      setPosition(pos)
      return true
    },
    []
  )

  // Trigger copy feedback state with auto-dismiss
  const triggerCopiedFeedback = useCallback(() => {
    clearDismissTimer()
    setIsCopied(true)
    setIsVisible(true)

    dismissTimerRef.current = setTimeout(() => {
      setIsVisible(false)
      setIsCopied(false)
      currentRangeRef.current = null
    }, durationMs)
  }, [clearDismissTimer, durationMs])

  // Check text selection in DOM
  const checkSelection = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      if (!isCopiedRef.current) {
        setIsVisible(false)
        currentRangeRef.current = null
      }
      return
    }

    const text = selection.toString()
    if (!isValidTextSelection(text, document.activeElement)) {
      if (!isCopiedRef.current) {
        setIsVisible(false)
        currentRangeRef.current = null
      }
      return
    }

    const range = selection.getRangeAt(0)

    // Scope check if containerRef is provided
    if (containerRef?.current) {
      const commonNode = range.commonAncestorContainer
      if (!isNodeInsideContainer(commonNode, containerRef.current)) {
        if (!isCopiedRef.current) {
          setIsVisible(false)
          currentRangeRef.current = null
        }
        return
      }
    }

    currentRangeRef.current = range.cloneRange()
    const valid = updatePositionFromRange(range)
    if (!valid) {
      if (!isCopiedRef.current) {
        setIsVisible(false)
      }
      return
    }

    setSelectedText(text.trim())
    if (!isCopiedRef.current) {
      setIsVisible(true)
      setIsCopied(false)
    }
  }, [containerRef, updatePositionFromRange])

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

    triggerCopiedFeedback()
  }

  useEffect(() => {
    const handleMouseUp = () => {
      // Brief timeout to let the browser finalize selection range
      setTimeout(checkSelection, 20)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
        setTimeout(checkSelection, 20)
      }
    }

    const handleMouseDown = (e: MouseEvent) => {
      // If clicked inside the popover itself, do not hide
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        return
      }
      if (!isCopiedRef.current) {
        setIsVisible(false)
        currentRangeRef.current = null
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

      // Update position to the current selection range if available
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        currentRangeRef.current = range.cloneRange()
        updatePositionFromRange(range)
      }

      setSelectedText(text)
      triggerCopiedFeedback()
    }

    const handleScroll = () => {
      if (currentRangeRef.current && isVisible) {
        const valid = updatePositionFromRange(currentRangeRef.current)
        if (!valid && !isCopiedRef.current) {
          setIsVisible(false)
        }
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('keyup', handleKeyUp)
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('copy', handleCopyEvent)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      clearDismissTimer()
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('copy', handleCopyEvent)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [checkSelection, triggerCopiedFeedback, updatePositionFromRange, clearDismissTimer, isVisible, containerRef])

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
        isCopied
          ? 'bg-[#0f1d15]/95 border border-emerald-500/70 text-emerald-300 shadow-emerald-950/40 animate-in zoom-in-95 duration-100'
          : 'bg-[#181a20]/95 backdrop-blur-md border border-[#30363d] text-zinc-200 hover:border-zinc-500 shadow-black/70 animate-in fade-in zoom-in-95 duration-100'
      }`}
    >
      {isCopied ? (
        <div className="flex items-center gap-1.5 font-medium text-[11px] text-emerald-300">
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>已复制</span>
        </div>
      ) : (
        <button
          type="button"
          onMouseDown={(e) => {
            // Crucial: prevent losing selection on mouse down before click
            e.preventDefault()
          }}
          onClick={handleCopyClick}
          className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer group"
          title="复制所选文字 (Ctrl+C)"
        >
          <Copy className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors shrink-0" />
          <span className="font-medium text-[11px]">复制</span>
          <span className="text-[9px] text-zinc-500 font-mono ml-0.5 group-hover:text-zinc-400">
            Ctrl+C
          </span>
        </button>
      )}
    </div>
  )
}
