import { Minus, Plus, RotateCcw } from 'lucide-react'
import { MIN_ZOOM, MAX_ZOOM, DEFAULT_ZOOM } from '../../utils/timeline-zoom'
import { useI18n } from '../../utils/i18n'

export interface TimelineZoomWidgetProps {
  zoomLevel: number
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
  isZenMode?: boolean
  className?: string
}

export function TimelineZoomWidget({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  isZenMode,
  className = '',
}: TimelineZoomWidgetProps) {
  const { tr } = useI18n()
  const isCustom = zoomLevel !== DEFAULT_ZOOM
  const isAtMin = zoomLevel <= MIN_ZOOM
  const isAtMax = zoomLevel >= MAX_ZOOM

  return (
    <div
      data-testid="timeline-zoom-widget"
      className={`group/zoom-widget pointer-events-auto flex items-center gap-1 rounded-full bg-[#121418]/85 hover:bg-[#161822]/95 border border-[#272a33] px-1.5 py-0.5 shadow-lg backdrop-blur-md transition-all duration-150 select-none opacity-60 hover:opacity-100 ${
        isZenMode ? 'bottom-5 right-8' : 'bottom-3 right-8'
      } ${className}`}
      title={tr(
        '文字与排版缩放 (Ctrl + 滚轮 / Ctrl + +/- / Ctrl + 0)',
        'Font & Layout Zoom (Ctrl + Wheel / Ctrl + +/- / Ctrl + 0)',
        'Schrift- und Layout-Zoom (Strg + Mausrad / Strg + +/- / Strg + 0)'
      )}
    >
      {/* Zoom Out Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onZoomOut()
        }}
        disabled={isAtMin}
        aria-label="缩小字体"
        title={tr('缩小 (Ctrl + -)', 'Zoom Out (Ctrl + -)', 'Verkleinern (Strg + -)')}
        className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        <Minus className="w-2.5 h-2.5" />
      </button>

      {/* Percentage Label / Reset Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onResetZoom()
        }}
        aria-label="重置缩放"
        title={tr(
          '重置缩放为 100% (Ctrl + 0)',
          'Reset Zoom to 100% (Ctrl + 0)',
          'Zoom auf 100% zurücksetzen (Strg + 0)'
        )}
        className={`px-1 py-0.2 rounded text-[11px] font-mono font-medium transition-colors cursor-pointer flex items-center gap-1 ${
          isCustom
            ? 'text-sky-300 hover:text-sky-100 font-semibold'
            : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <span>{zoomLevel}%</span>
        {isCustom && (
          <RotateCcw className="w-2.5 h-2.5 text-sky-400 group-hover/zoom-widget:inline-block hidden transition-all" />
        )}
      </button>

      {/* Zoom In Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onZoomIn()
        }}
        disabled={isAtMax}
        aria-label="放大字体"
        title={tr('放大 (Ctrl + +)', 'Zoom In (Ctrl + +)', 'Vergrößern (Strg + +)')}
        className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        <Plus className="w-2.5 h-2.5" />
      </button>
    </div>
  )
}
