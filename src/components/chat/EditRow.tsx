import { ChevronRight } from 'lucide-react'
import { FileTypeIcon } from '../common/FileTypeIcon'
import type { EditItem } from '../../utils/worked-summary'
import { useDiffDrawer, editItemToDiffPayload } from '../diff/DiffDrawerContext'
import { tr } from '../../utils/i18n'

interface EditRowProps {
  item: EditItem
  messageId?: string
}

export function EditRow({ item, messageId }: EditRowProps) {
  const { open } = useDiffDrawer()

  const handleClick = () => {
    open(editItemToDiffPayload(item, messageId))
  }

  return (
    <button
      onClick={handleClick}
      type="button"
      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/50 text-left transition-all group select-none cursor-pointer"
      title={tr(
        `点击查看差异: ${item.filePath}`,
        `Click to open diff viewer: ${item.filePath}`,
        `Klicken, um Diff-Viewer zu öffnen: ${item.filePath}`
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
        <FileTypeIcon filename={item.fileName} className="w-3.5 h-3.5 shrink-0" />
        <span className="text-xs font-mono font-medium text-zinc-200 group-hover:text-white truncate">
          {item.fileName}
        </span>
        {item.relativeDir && (
          <span className="text-[10px] font-mono text-zinc-500 truncate hidden sm:inline">
            {item.relativeDir}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono font-medium">
        {item.additions > 0 && (
          <span className="px-1.5 py-0.2 rounded bg-emerald-950/70 border border-emerald-800/60 text-emerald-400">
            +{item.additions}
          </span>
        )}
        {item.deletions > 0 && (
          <span className="px-1.5 py-0.2 rounded bg-rose-950/70 border border-rose-800/60 text-rose-400">
            -{item.deletions}
          </span>
        )}
        {item.additions === 0 && item.deletions === 0 && item.status === 'added' && (
          <span className="px-1.5 py-0.2 rounded bg-blue-950/70 border border-blue-800/60 text-blue-400">
            new
          </span>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-200 transition-colors shrink-0" />
      </div>
    </button>
  )
}
