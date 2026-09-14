import { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileCode,
} from 'lucide-react'
import type { WorkedTurn } from '../../utils/worked-summary'
import { formatWorkedLabel } from '../../utils/worked-summary'
import { HierarchicalToolList } from './HierarchicalToolList'
import { useDiffDrawer, editItemToDiffPayload } from '../diff/DiffDrawerContext'
import { tr } from '../../utils/i18n'

interface WorkedSummaryCardProps {
  turn: WorkedTurn
  messageId: string
  isBusy?: boolean
}

export function WorkedSummaryCard({ turn, messageId, isBusy }: WorkedSummaryCardProps) {
  const { open } = useDiffDrawer()
  const editGroups = turn.groups.filter((g) => g.kind === 'edit')
  const editCount = editGroups.length

  // A turn is live ONLY if turn itself claims live AND the parent session is currently busy
  const isEffectivelyLive = turn.isLive && (isBusy === undefined || isBusy)

  // Collapsed by default once turn is completed, auto-expanded when live
  const [expanded, setExpanded] = useState(isEffectivelyLive)
  const userInteractedRef = useRef(false)

  // Single source-of-truth live clock
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!isEffectivelyLive) return

    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => clearInterval(timer)
  }, [isEffectivelyLive])

  const displayDuration =
    isEffectivelyLive && turn.createdTime
      ? Math.max(0, now - turn.createdTime)
      : turn.durationMs

  const label = formatWorkedLabel(displayDuration, isEffectivelyLive, turn.finish, turn.isAborted)

  const handleToggle = () => {
    userInteractedRef.current = true
    setExpanded(!expanded)
  }

  return (
    <div className="my-2 rounded-lg border border-[#272a30] bg-[#121417]/85 overflow-hidden text-xs shadow-sm transition-all">
      {/* Worked Header Bar (Antigravity Style: Sleek 32px height) */}
      <div
        onClick={handleToggle}
        className="flex items-center justify-between px-3 py-2 bg-[#16181d] hover:bg-[#1b1e24] cursor-pointer transition-colors select-none"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-5 h-5 rounded flex items-center justify-center bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 shrink-0">
            <Sparkles className="w-3 h-3 text-amber-400" />
          </div>

          <span className="font-semibold text-xs text-zinc-100 shrink-0">
            {label}
          </span>

          <span className="text-[10px] text-zinc-500 font-mono shrink-0">
            ({turn.totalWorkItems} {turn.totalWorkItems === 1 ? 'action' : 'actions'})
          </span>

          {editCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                const firstEdit = editGroups[0]
                if (firstEdit && firstEdit.kind === 'edit') {
                  open(editItemToDiffPayload(firstEdit.item, messageId))
                }
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-700/60 text-emerald-300 font-mono text-[10px] font-medium transition-colors ml-1 cursor-pointer"
              title={tr('点击在侧边抽屉查看文件差异', 'Click to open file diff drawer', 'Klicken, um Diff-Drawer zu öffnen')}
            >
              <FileCode className="w-3 h-3 text-emerald-400" />
              <span>
                {editCount} {editCount === 1 ? 'diff' : 'diffs'}
              </span>
            </button>
          )}

          {isEffectivelyLive && (
            <span className="hidden sm:inline text-[10px] text-purple-400 animate-pulse font-mono truncate">
              Executing step...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          {isEffectivelyLive ? (
            <span className="flex items-center gap-1 text-purple-400 font-mono text-[10px]">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="hidden sm:inline">Running</span>
            </span>
          ) : turn.isAborted ? (
            <span className="flex items-center gap-1 text-amber-400 font-mono text-[10px]" title="Generation was aborted">
              <AlertCircle className="w-3 h-3" />
              <span className="hidden sm:inline">Aborted</span>
            </span>
          ) : turn.hasError ? (
            <span className="flex items-center gap-1 text-rose-400 font-mono text-[10px]">
              <XCircle className="w-3 h-3" />
              <span className="hidden sm:inline">Issues</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-400 font-mono text-[10px]">
              <CheckCircle2 className="w-3 h-3" />
            </span>
          )}

          <button className="text-zinc-500 hover:text-zinc-200">
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Hierarchical Breakdown */}
      {expanded && (
        <div className="border-t border-[#272a30] select-text">
          <HierarchicalToolList groups={turn.groups} messageId={messageId} isLive={isEffectivelyLive} />
        </div>
      )}
    </div>
  )
}
