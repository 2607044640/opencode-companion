import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { useLongPress } from '../../hooks/useLongPress'
import { useI18n } from '../../utils/i18n'
import {
  computeDialogueTicks,
  computeViewportThumb,
  calculateDragScrollTop,
  type DialogueTick,
  type DialogueElementInfo,
} from './quick-jump'

interface TimelineQuickJumpProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  messagesCount: number
  onJumpToRecentUser: () => void
  onJumpToTop: () => void
  onJumpToNextUser: () => void
  onJumpToAbsoluteBottom: () => void
  onJumpToUserIndex: (userIndex: number) => void
  isZenMode?: boolean
}

export function TimelineQuickJump({
  containerRef,
  messagesCount,
  onJumpToRecentUser,
  onJumpToTop,
  onJumpToNextUser,
  onJumpToAbsoluteBottom,
  onJumpToUserIndex,
  isZenMode,
}: TimelineQuickJumpProps) {
  const { t, tr } = useI18n()

  const [ticks, setTicks] = useState<DialogueTick[]>([])
  const [thumb, setThumb] = useState<{ topPct: number; heightPct: number }>({ topPct: 0, heightPct: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [hoveredTickIndex, setHoveredTickIndex] = useState<number | null>(null)
  const [popoverTop, setPopoverTop] = useState<number>(0)
  const [caretTop, setCaretTop] = useState<number>(20)

  const containerWrapperRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const isDraggingRef = useRef(false)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeDotCenterYRef = useRef<number>(0)

  const cancelLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
  }, [])

  const handleWrapperMouseEnter = useCallback(() => {
    cancelLeaveTimer()
  }, [cancelLeaveTimer])

  const handleWrapperMouseLeave = useCallback(() => {
    cancelLeaveTimer()
    leaveTimerRef.current = setTimeout(() => {
      setHoveredTickIndex(null)
    }, 140)
  }, [cancelLeaveTimer])

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
      }
    }
  }, [])

  const { isPressing: isUpPressing, handlers: upHandlers } = useLongPress({
    onClick: onJumpToRecentUser,
    onLongPress: onJumpToTop,
    thresholdMs: 1000,
  })

  const { isPressing: isDownPressing, handlers: downHandlers } = useLongPress({
    onClick: onJumpToNextUser,
    onLongPress: onJumpToAbsoluteBottom,
    thresholdMs: 1000,
  })

  // Fast viewport thumb update - purely mathematical, zero DOM measurement reflow
  const updateThumb = useCallback(() => {
    if (!containerRef.current) return
    const { scrollHeight, scrollTop, clientHeight } = containerRef.current
    const computedThumb = computeViewportThumb({ scrollHeight, scrollTop, clientHeight })
    setThumb(computedThumb)
  }, [containerRef])

  // Full tick measurement - measures dialogue offsets when DOM structure or window size changes
  const updateTicks = useCallback(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const { scrollHeight, scrollTop, clientHeight } = container
    if (scrollHeight <= 0) return

    const containerRect = container.getBoundingClientRect()
    const userEls = container.querySelectorAll<HTMLElement>('[data-message-role="user"]')

    const userElements: DialogueElementInfo[] = Array.from(userEls).map((el) => {
      const r = el.getBoundingClientRect()
      const offsetTop = r.top - containerRect.top + scrollTop
      const rawPrompt =
        el.getAttribute('data-prompt-preview') ||
        el.getAttribute('data-prompt-full') ||
        el.textContent ||
        ''
      const timestamp = el.getAttribute('data-created-time') || undefined
      const messageId = el.getAttribute('data-message-id') || undefined

      return {
        offsetTop,
        promptPreview: rawPrompt,
        rawPrompt,
        timestamp,
        messageId,
      }
    })

    const computedTicks = computeDialogueTicks(
      { scrollHeight, scrollTop, clientHeight },
      userElements
    )
    setTicks(computedTicks)
    updateThumb()
  }, [containerRef, updateThumb])

  // Scroll tick updater - updates thumb and active highlight without forced reflow
  const updateMetrics = useCallback(() => {
    updateThumb()

    // Lightweight active tick highlight update using cached tick offsets
    setTicks((prev) => {
      if (prev.length === 0 || !containerRef.current) return prev
      const { scrollTop, clientHeight } = containerRef.current
      let changed = false
      const next = prev.map((tick) => {
        const isActive =
          tick.offsetTop >= scrollTop - 60 &&
          tick.offsetTop <= scrollTop + clientHeight - 40
        if (isActive !== tick.isActive) changed = true
        return isActive === tick.isActive ? tick : { ...tick, isActive }
      })
      return changed ? next : prev
    })
  }, [containerRef, updateThumb])

  const scheduleUpdate = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      updateMetrics()
    })
  }, [updateMetrics])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Immediately calculate initial ticks and thumb
    updateTicks()

    container.addEventListener('scroll', scheduleUpdate, { passive: true })

    const resizeObserver = new ResizeObserver(() => {
      updateTicks()
      scheduleUpdate()
    })
    resizeObserver.observe(container)
    if (container.firstElementChild) {
      resizeObserver.observe(container.firstElementChild)
    }

    return () => {
      container.removeEventListener('scroll', scheduleUpdate)
      resizeObserver.disconnect()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [containerRef, messagesCount, scheduleUpdate, updateTicks])

  // Drag & click handling on track rail with Pointer Capture
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || !trackRef.current) return
    if (e.button !== 0) return // Left click only

    e.preventDefault()
    e.stopPropagation()

    cancelLeaveTimer()
    setHoveredTickIndex(null)

    const track = trackRef.current
    try {
      track.setPointerCapture(e.pointerId)
    } catch {}

    isDraggingRef.current = true
    setIsDragging(true)

    const rect = track.getBoundingClientRect()
    const targetScroll = calculateDragScrollTop(
      e.clientY - rect.top,
      rect.height,
      containerRef.current.scrollHeight,
      containerRef.current.clientHeight
    )
    containerRef.current.scrollTop = targetScroll
    updateThumb()
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !containerRef.current || !trackRef.current) return
    e.preventDefault()
    e.stopPropagation()

    const track = trackRef.current
    const rect = track.getBoundingClientRect()
    const targetScroll = calculateDragScrollTop(
      e.clientY - rect.top,
      rect.height,
      containerRef.current.scrollHeight,
      containerRef.current.clientHeight
    )
    containerRef.current.scrollTop = targetScroll
    updateThumb()
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return
    try {
      trackRef.current.releasePointerCapture(e.pointerId)
    } catch {}
    isDraggingRef.current = false
    setIsDragging(false)
  }

  const handleTickHover = (index: number, el: HTMLElement) => {
    cancelLeaveTimer()
    setHoveredTickIndex(index)
    if (containerWrapperRef.current) {
      const wrapperRect = containerWrapperRef.current.getBoundingClientRect()
      const dotRect = el.getBoundingClientRect()
      const dotCenterY = dotRect.top - wrapperRect.top + dotRect.height / 2
      activeDotCenterYRef.current = dotCenterY

      const cardHeight = cardRef.current?.offsetHeight || 100
      const desiredTop = dotCenterY - cardHeight / 2
      const maxTop = Math.max(8, wrapperRect.height - cardHeight - 8)
      const clampedTop = Math.max(8, Math.min(desiredTop, maxTop))
      setPopoverTop(clampedTop)
      setCaretTop(Math.max(16, Math.min(cardHeight - 16, dotCenterY - clampedTop)))
    }
  }

  // Refine card positioning when card height is measured after render
  useLayoutEffect(() => {
    if (hoveredTickIndex !== null && cardRef.current && containerWrapperRef.current) {
      const wrapperRect = containerWrapperRef.current.getBoundingClientRect()
      const cardHeight = cardRef.current.offsetHeight
      const dotCenterY = activeDotCenterYRef.current
      const desiredTop = dotCenterY - cardHeight / 2
      const maxTop = Math.max(8, wrapperRect.height - cardHeight - 8)
      const clampedTop = Math.max(8, Math.min(desiredTop, maxTop))
      setPopoverTop(clampedTop)
      setCaretTop(Math.max(16, Math.min(cardHeight - 16, dotCenterY - clampedTop)))
    }
  }, [hoveredTickIndex])

  const hoveredTick = hoveredTickIndex !== null ? ticks[hoveredTickIndex] : null
  const totalTicks = ticks.length
  const isVeryDense = totalTicks > 50
  const isDense = totalTicks > 25

  return (
    <div
      ref={containerWrapperRef}
      className={`absolute z-30 flex flex-col items-center select-none transition-all duration-200 ${
        isZenMode ? 'top-4 bottom-4 right-2' : 'top-3 bottom-3 right-1.5'
      }`}
      style={{ width: '16px' }}
      aria-label="对话轨迹导航栏"
      onMouseEnter={handleWrapperMouseEnter}
      onMouseLeave={handleWrapperMouseLeave}
    >
      {/* Container Outer Capsule */}
      <div className="w-full h-full flex flex-col items-center bg-[#121418]/85 hover:bg-[#15181e]/95 backdrop-blur-md border border-[#272a31]/80 shadow-2xl rounded-full p-0.5">
        {/* Top Button: Up arrow (▲) */}
        <button
          type="button"
          {...upHandlers}
          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center cursor-pointer transition-all shrink-0 outline-none ${
            isUpPressing
              ? 'scale-90 bg-zinc-700 text-white ring-1 ring-zinc-500'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 active:scale-90'
          }`}
          title={t.settings?.quickJumpUpTooltip || '上一条对话 (长按 1 秒跳转到顶部)'}
          aria-label="向上快捷跳转"
        >
          <ChevronUp className="w-3 h-3 shrink-0" />
        </button>

        {/* Middle Track Rail with Pointer Dragging & Direct Jump */}
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`relative flex-1 w-full my-1 rounded-full bg-zinc-900/60 overflow-visible touch-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-pointer'
          }`}
        >
          {/* Viewport Indicator Thumb */}
          <div
            style={{
              top: `${thumb.topPct}%`,
              height: `${thumb.heightPct}%`,
            }}
            className={`absolute left-0.5 right-0.5 rounded-full border pointer-events-none transition-colors duration-75 ${
              isDragging
                ? 'bg-zinc-400/60 border-zinc-200 ring-1 ring-white/40 shadow-sm'
                : 'bg-zinc-600/35 border-zinc-500/40 hover:bg-zinc-500/50'
            }`}
          />

          {/* Dialogue Dots ("浅色圆" - Light-colored circular marks, no orange) */}
          {ticks.map((tick) => {
            const isHovered = hoveredTickIndex === tick.index
            const isActive = tick.isActive

            // Dynamic diameter based on density
            const dotSizeClass = isVeryDense
              ? isActive ? 'w-1.5 h-1.5' : 'w-1 h-1'
              : isDense
              ? isActive ? 'w-2 h-2' : 'w-1.5 h-1.5'
              : isActive ? 'w-2.5 h-2.5' : 'w-2 h-2'

            const dotColorClass = isHovered
              ? 'bg-white ring-2 ring-white/60 shadow-[0_0_8px_rgba(255,255,255,0.9)] scale-125'
              : isActive
              ? 'bg-white ring-1 ring-white/70 shadow-[0_0_6px_rgba(255,255,255,0.7)]'
              : 'bg-zinc-400/50 hover:bg-zinc-200'

            return (
              <div
                key={tick.index}
                onPointerDown={(e) => {
                  // Prevent track pointer capture from stealing tick click
                  e.stopPropagation()
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  cancelLeaveTimer()
                  setHoveredTickIndex(null)
                  onJumpToUserIndex(tick.index)
                }}
                onMouseEnter={(e) => handleTickHover(tick.index, e.currentTarget)}
                style={{
                  top: `${tick.percentage}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                className="group/tick absolute left-1/2 w-4 h-3.5 flex items-center justify-center cursor-pointer z-10"
                aria-label={`跳转到第 ${tick.index + 1} 轮对话`}
              >
                <div
                  className={`rounded-full transition-all duration-150 ${dotSizeClass} ${dotColorClass}`}
                />
              </div>
            )
          })}
        </div>

        {/* Bottom Button: Down arrow (▼) */}
        <button
          type="button"
          {...downHandlers}
          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center cursor-pointer transition-all shrink-0 outline-none ${
            isDownPressing
              ? 'scale-90 bg-zinc-700 text-white ring-1 ring-zinc-500'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 active:scale-90'
          }`}
          title={t.settings?.quickJumpDownTooltip || '下一条对话 (长按 1 秒跳转到底部)'}
          aria-label="向下快捷跳转"
        >
          <ChevronDown className="w-3 h-3 shrink-0" />
        </button>
      </div>

      {/* Floating Hover Preview Card (Only human input, completely displayed, <= 200 chars or 150 ... 50) */}
      {!isDragging && hoveredTick && (
        <div
          ref={cardRef}
          onMouseEnter={handleWrapperMouseEnter}
          onMouseLeave={handleWrapperMouseLeave}
          className="absolute z-50 pointer-events-auto w-72 sm:w-80 rounded-xl bg-[#13151b]/95 backdrop-blur-md border border-[#2d313d] p-3 text-left transition-all duration-150 animate-in fade-in zoom-in-95"
          style={{
            top: `${popoverTop}px`,
            right: 'calc(100% + 10px)',
            maxHeight: 'calc(100% - 16px)',
            boxShadow:
              '0 20px 45px -8px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          }}
        >
          {/* Caret arrow pointing to the dot */}
          <div
            className="absolute -right-1.5 w-3 h-3 bg-[#13151b] border-r border-t border-[#2d313d] pointer-events-none"
            style={{
              top: `${caretTop}px`,
              transform: 'translateY(-50%) rotate(45deg)',
            }}
          />

          {/* Header: Turn # / Total Turns and optional timestamp */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#252834] text-[11px] text-zinc-400">
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/80 text-[10px] font-mono text-zinc-300 font-medium">
                #{hoveredTick.index + 1}
              </span>
              <span className="text-zinc-300 font-medium">
                {tr(
                  `第 ${hoveredTick.index + 1} / ${totalTicks} 轮`,
                  `Turn ${hoveredTick.index + 1} of ${totalTicks}`,
                  `Runde ${hoveredTick.index + 1} von ${totalTicks}`
                )}
              </span>
            </div>
            {hoveredTick.timeLabel && (
              <span className="text-zinc-500 font-mono text-[10px]">
                {hoveredTick.timeLabel}
              </span>
            )}
          </div>

          {/* Prompt Body: Complete human input display, formatted by length rule */}
          <div className="text-zinc-100 text-xs sm:text-[13px] leading-relaxed font-normal whitespace-pre-wrap break-words max-h-[min(480px,calc(100vh-160px))] overflow-y-auto no-scrollbar">
            {hoveredTick.previewText}
          </div>
        </div>
      )}
    </div>
  )
}
