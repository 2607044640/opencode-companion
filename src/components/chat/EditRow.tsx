import { FileTypeIcon } from '../common/FileTypeIcon'
import type { EditItem } from '../../utils/worked-summary'
import { useDiffDrawer } from '../diff/DiffDrawerContext'

interface EditRowProps {
  item: EditItem
  messageId?: string
}

export function EditRow({ item, messageId }: EditRowProps) {
  const { open } = useDiffDrawer()

  const handleClick = () => {
    open({
      messageId: messageId || item.rawPart.messageID,
      partId: item.partId,
      filePath: item.filePath,
      fileName: item.fileName,
      status: item.status,
      additions: item.additions,
      deletions: item.deletions,
      unified: item.unified,
      tool: item.tool,
      rawInput: item.rawPart.state?.input,
      rawOutput: item.rawPart.state?.output,
    })
  }

  return (
    <button
      onClick={handleClick}
      type="button"
      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/50 text-left transition-all group select-none cursor-pointer"
      title={`点击查看差异: ${item.filePath}`}
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
      </div>
    </button>
  )
}
