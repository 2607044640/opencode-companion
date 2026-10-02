import { useState, useEffect, useCallback, useRef } from 'react'
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
  const { t } = useI18n()

  const [ticks, setTicks] = useState<DialogueTick[]>([])
  const [thumb, setThumb] = useState<{ topPct: number; heightPct: number }>({ topPct: 0, heightPct: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const isDraggingRef = useRef(false)

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
      return {
        offsetTop,
        textContent: el.textContent,
        promptPreview: el.getAttribute('data-prompt-preview'),
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

    return () => {
      container.removeEventListener('scroll', scheduleUpdate)
      resizeObserver.disconnect()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null // Fixed: must reset to null on unmount/re-bind!
      }
    }
  }, [containerRef, messagesCount, scheduleUpdate, updateTicks])

  // Drag & click handling on track rail with Pointer Capture
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || !trackRef.current) return
    if (e.button !== 0) return // Left click only

    e.preventDefault()
    e.stopPropagation()

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

  return (
    <div
      className={`absolute z-20 flex flex-col items-center select-none transition-all duration-200 ${
        isZenMode ? 'top-4 bottom-4 right-2' : 'top-3 bottom-3 right-1.5'
      }`}
      style={{ width: '16px' }}
      aria-label="对话轨迹导航栏"
    >
      {/* Container Outer Capsule */}
      <div className="w-full h-full flex flex-col items-center bg-[#121418]/85 hover:bg-[#15181e]/95 backdrop-blur-md border border-[#272a31]/80 shadow-2xl rounded-full p-0.5">
        {/* Top Button: Up arrow (▲) */}
        <button
          type="button"
          {...upHandlers}
          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center cursor-pointer transition-all shrink-0 outline-none ${
            isUpPressing
              ? 'scale-90 bg-orange-950/90 text-orange-400 ring-1 ring-orange-500/70'
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
          title="点击或拖动标尺快速滚动"
        >
          {/* Viewport Indicator Thumb */}
          <div
            style={{
              top: `${thumb.topPct}%`,
              height: `${thumb.heightPct}%`,
            }}
            className={`absolute left-0.5 right-0.5 rounded-full border pointer-events-none transition-colors duration-75 ${
              isDragging
                ? 'bg-orange-500/80 border-orange-400 ring-1 ring-orange-400/80 shadow-md shadow-orange-500/40'
                : 'bg-zinc-600/35 border-zinc-500/40 hover:bg-zinc-500/50'
            }`}
          />

          {/* Dialogue Ticks ("x个小条") */}
          {ticks.map((tick) => (
            <div
              key={tick.index}
              onClick={(e) => {
                e.stopPropagation()
                onJumpToUserIndex(tick.index)
              }}
              style={{
                top: `${tick.percentage}%`,
                transform: 'translateY(-50%)',
              }}
              className={`group/tick absolute left-0.5 right-0.5 cursor-pointer z-10 transition-all ${
                tick.isActive
                  ? 'h-[4px] rounded-full bg-orange-400 shadow-sm shadow-orange-500/80 ring-1 ring-orange-300 scale-x-125'
                  : 'h-[3px] rounded-full bg-amber-500/75 hover:bg-orange-400 hover:h-[5px] hover:scale-x-125 shadow-xs shadow-amber-500/40'
              }`}
            >
              {/* Left Hover Tooltip: Preview turn # and snippet text */}
              <div className="absolute right-5 top-1/2 -translate-y-1/2 px-2 py-1 rounded bg-[#181a20]/95 border border-[#30363d] text-zinc-200 text-[11px] font-sans shadow-2xl pointer-events-none z-30 opacity-0 group-hover/tick:opacity-100 transition-opacity duration-150 flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center bg-amber-950/80 text-amber-400 border border-amber-700/50 shrink-0">
                  #{tick.index + 1}
                </span>
                <span className="max-w-[200px] truncate text-zinc-300 font-mono text-[10px]">
                  {tick.snippet}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Button: Down arrow (▼) */}
        <button
          type="button"
          {...downHandlers}
          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center cursor-pointer transition-all shrink-0 outline-none ${
            isDownPressing
              ? 'scale-90 bg-orange-950/90 text-orange-400 ring-1 ring-orange-500/70'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 active:scale-90'
          }`}
          title={t.settings?.quickJumpDownTooltip || '下一条对话 (长按 1 秒跳转到底部)'}
          aria-label="向下快捷跳转"
        >
          <ChevronDown className="w-3 h-3 shrink-0" />
        </button>
      </div>
    </div>
  )
}
