import { X, Quote as QuoteIcon } from 'lucide-react'
import { getQuoteStats, formatQuoteTag } from '../../utils/quote'
import { useI18n } from '../../utils/i18n'

export interface QuoteCardProps {
  quoteId: string
  content: string
  onClick: () => void
  onRemove?: () => void
  compact?: boolean
}

export function QuoteCard({
  quoteId,
  content,
  onClick,
  onRemove,
  compact = false,
}: QuoteCardProps) {
  const { tr } = useI18n()
  const stats = getQuoteStats(content)
  const tag = formatQuoteTag(quoteId)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      title={tr(
        `点击查看引用详情 (${tag}: ${stats.lineCount} 行, ${stats.charCount} 字)`,
        `Click to view quote details (${tag}: ${stats.lineCount} lines, ${stats.charCount} chars)`
      )}
      className={`relative group shrink-0 rounded-xl border border-sky-800/60 bg-[#161a24]/95 hover:bg-[#1b2230] hover:border-sky-500/80 transition-all cursor-pointer select-none flex flex-col justify-between shadow-md ${
        compact ? 'w-36 h-24 p-2.5' : 'w-44 h-[106px] p-2.5'
      }`}
    >
      {/* Top-right Remove Button */}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full bg-[#1e2330] hover:bg-rose-600 border border-zinc-600/80 text-zinc-300 hover:text-white flex items-center justify-center shadow-lg transition-colors cursor-pointer"
          title={tr(`移除引用 ${tag}`, `Remove quote ${tag}`)}
          aria-label={tr(`移除引用 ${tag}`, `Remove quote ${tag}`)}
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Preview text */}
      <div className="text-[11px] leading-[1.35] text-zinc-300/90 line-clamp-4 break-all font-sans overflow-hidden">
        {stats.previewText || tr('(空引用)', '(Empty quote)')}
      </div>

      {/* Bottom Bar: @[Quote] badge + lines/chars */}
      <div className="flex items-center justify-between gap-1.5 pt-1.5 mt-auto border-t border-sky-900/30">
        <div className="flex items-center gap-1 min-w-0">
          <QuoteIcon className="w-3 h-3 text-sky-400 shrink-0" />
          <span
            className="px-1.5 py-0.5 rounded bg-sky-950/90 border border-sky-700/70 text-sky-300 font-mono text-[10px] font-bold tracking-tight leading-none truncate max-w-[100px]"
            title={tag}
          >
            {tag}
          </span>
        </div>

        <span className="text-[10px] font-mono text-zinc-400 shrink-0">
          {stats.lineCount > 1 ? `${stats.lineCount} ${tr('行', 'lines')}` : `${stats.charCount} ${tr('字', 'chars')}`}
        </span>
      </div>
    </div>
  )
}
