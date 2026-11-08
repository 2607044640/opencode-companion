import { X, Pencil } from 'lucide-react'
import { getPastedSnippetStats } from '../../utils/pasted-snippets'
import { useI18n } from '../../utils/i18n'

export interface PastedSnippetCardProps {
  pastedId: string
  content: string
  onClick: () => void
  onEdit?: () => void
  onRemove?: () => void
  compact?: boolean
}

export function PastedSnippetCard({
  pastedId,
  content,
  onClick,
  onEdit,
  onRemove,
  compact = false,
}: PastedSnippetCardProps) {
  const { tr } = useI18n()
  const stats = getPastedSnippetStats(content)
  const displayId = (pastedId || 'p1').toUpperCase()
  const lowerId = (pastedId || 'p1').toLowerCase()

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
        `点击查看完整粘贴内容 (${lowerId}: ${stats.lineCount} 行, ${stats.formattedSize})`,
        `Click to view pasted content (${lowerId}: ${stats.lineCount} lines, ${stats.formattedSize})`
      )}
      className={`relative group shrink-0 rounded-xl border border-[#323642] bg-[#1b1d24]/95 hover:bg-[#20232b] hover:border-zinc-500/80 transition-all cursor-pointer select-none flex flex-col justify-between shadow-md ${
        compact ? 'w-36 h-24 p-2.5' : 'w-40 h-[106px] p-2.5'
      }`}
    >
      {/* Top-right Remove Button (Claude Web style circle X) */}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full bg-[#23262f] hover:bg-rose-600 border border-zinc-600/80 text-zinc-300 hover:text-white flex items-center justify-center shadow-lg transition-colors cursor-pointer"
          title={tr(`移除 ${lowerId}`, `Remove ${lowerId}`)}
          aria-label={tr(`移除 ${lowerId}`, `Remove ${lowerId}`)}
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Multi-line Preview Text (Claude Web style 4 lines) */}
      <div className="text-[11px] leading-[1.35] text-zinc-300/90 line-clamp-4 break-all font-sans overflow-hidden">
        {stats.previewText || tr('(空文本)', '(Empty text)')}
      </div>

      {/* Bottom Bar: P1 + PASTED badge on left, Edit icon or line count on right */}
      <div className="flex items-center justify-between gap-1.5 pt-1.5 mt-auto">
        <div className="flex items-center gap-1 min-w-0">
          <span
            className="px-1.5 py-0.5 rounded bg-sky-950/90 border border-sky-700/70 text-sky-300 font-mono text-[10px] font-bold tracking-tight leading-none shrink-0"
            title={tr(`对话中可直接说“看 ${lowerId}”`, `Refer to this in chat as "${lowerId}"`)}
          >
            {lowerId}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-zinc-600/70 bg-zinc-800/70 text-zinc-300 font-mono text-[9px] font-semibold tracking-wider uppercase leading-none shrink-0">
            PASTED
          </span>
        </div>

        {onEdit ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/70 transition-colors cursor-pointer shrink-0"
            title={tr(`编辑 ${displayId} 内容`, `Edit ${displayId} content`)}
            aria-label={tr(`编辑 ${displayId} 内容`, `Edit ${displayId} content`)}
          >
            <Pencil className="w-3 h-3" />
          </button>
        ) : (
          <span className="text-[10px] font-mono text-zinc-500 truncate">
            {stats.lineCount} {tr('行', 'lines')}
          </span>
        )}
      </div>
    </div>
  )
}
