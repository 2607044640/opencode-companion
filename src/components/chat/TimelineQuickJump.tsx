import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { useLongPress } from '../../hooks/useLongPress'
import { useI18n } from '../../utils/i18n'
import {
  computeDialogueTicks,
  computeViewportThumb,
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
  const rafRef = useRef<number | null>(null)

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

  // Synchronize ticks and thumb position relative to container
  const updateMetrics = useCallback(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const { scrollHeight, scrollTop, clientHeight } = container

    const containerRect = container.getBoundingClientRect()
    const userEls = container.querySelectorAll<HTMLElement>('[data-message-role="user"]')

    const userElements: DialogueElementInfo[] = Array.from(userEls).map((el) => {
      const r = el.getBoundingClientRect()
      // Compensate for scroller nesting so measurement is true absolute scroll offset
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
    const computedThumb = computeViewportThumb({ scrollHeight, scrollTop, clientHeight })

    setTicks(computedTicks)
    setThumb(computedThumb)
  }, [containerRef])

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

    scheduleUpdate()
    container.addEventListener('scroll', scheduleUpdate, { passive: true })

    const resizeObserver = new ResizeObserver(() => {
      scheduleUpdate()
    })
    resizeObserver.observe(container)

    return () => {
      container.removeEventListener('scroll', scheduleUpdate)
      resizeObserver.disconnect()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [containerRef, messagesCount, scheduleUpdate])

  // Handle clicking on the background track to scroll proportionally
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    const track = e.currentTarget
    const rect = track.getBoundingClientRect()
    const clickY = e.clientY - rect.top
    const ratio = Math.max(0, Math.min(1, clickY / rect.height))
    const container = containerRef.current
    const targetScroll = ratio * (container.scrollHeight - container.clientHeight)
    container.scrollTo({ top: targetScroll, behavior: 'smooth' })
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
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80'
          }`}
          title={t.settings?.quickJumpUpTooltip || '上一条对话 (长按 1 秒跳转到顶部)'}
          aria-label="向上快捷跳转"
        >
          <ChevronUp className="w-3 h-3 shrink-0" />
        </button>

        {/* Middle Track Rail */}
        <div
          onClick={handleTrackClick}
          className="relative flex-1 w-full my-1 rounded-full bg-zinc-900/60 overflow-visible cursor-pointer"
          title="点击标尺快速滚动"
        >
          {/* Viewport Indicator Thumb */}
          <div
            style={{
              top: `${thumb.topPct}%`,
              height: `${thumb.heightPct}%`,
            }}
            className="absolute left-0.5 right-0.5 rounded-full bg-zinc-600/30 border border-zinc-500/30 pointer-events-none transition-all duration-75"
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
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80'
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
