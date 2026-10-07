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
import { DelayedTooltip } from '../common/DelayedTooltip'
import { useDiffDrawer, editItemsToTurnFiles } from '../diff/DiffDrawerContext'
import { useI18n, tr } from '../../utils/i18n'

interface WorkedSummaryCardProps {
  turn: WorkedTurn
  messageId: string
  isBusy?: boolean
  /** False until the daemon answers. Do not paint the finished check or a live timer. */
  runKnown?: boolean
}

export function WorkedSummaryCard({ turn, messageId, isBusy: _isBusy, runKnown = true }: WorkedSummaryCardProps) {
  const { isZh } = useI18n()
  const { openTurn } = useDiffDrawer()
  const editGroups = turn.groups.filter((g): g is { kind: 'edit'; item: any } => g.kind === 'edit')
  const editCount = editGroups.length

  // A turn is live based on robust part-level analysis from partitionAssistantTurn.
  // Until the daemon answers, neither the checkmark nor the live timer is honest.
  const confirming = !runKnown
  const isEffectivelyLive = !confirming && turn.isLive

  const isThinking =
    isEffectivelyLive &&
    turn.answerParts.length === 0 &&
    turn.groups.every((g) => g.kind === 'thought')

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

  const rawLabel = formatWorkedLabel(
    displayDuration,
    isEffectivelyLive,
    turn.finish,
    turn.isAborted,
    isThinking ? 'thinking' : 'working'
  )
  const settledLabel = isZh
    ? rawLabel
        .replace(/^Thinking for /, '思考中 ')
        .replace(/^Working for /, '执行中 ')
        .replace(/^Worked for /, '耗时 ')
        .replace(/\(Aborted\)/, '(已中断)')
    : rawLabel
  const label = confirming
    ? tr('正在确认状态…', 'Checking status…', 'Status wird geprüft…')
    : settledLabel

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
            ({turn.totalWorkItems} {turn.totalWorkItems === 1 ? tr('个操作', 'action') : tr('个操作', 'actions')})
          </span>

          {editCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                const editItems = editGroups.map((g) => g.item)
                const turnFiles = editItemsToTurnFiles(editItems, messageId)
                openTurn({
                  messageId,
                  title: 'For Turn',
                  files: turnFiles,
                })
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-700/60 text-emerald-300 font-mono text-[10px] font-medium transition-colors ml-1 cursor-pointer"
              title={tr('点击打开审查面板查看本轮差异', 'Click to review turn diffs', 'Klicken, um Runden-Diffs zu prüfen')}
            >
              <FileCode className="w-3 h-3 text-emerald-400" />
              <span>
                {editCount} {editCount === 1 ? tr('处改动', 'diff') : tr('处改动', 'diffs')}
              </span>
            </button>
          )}

          {isEffectivelyLive && (
            <span className="hidden sm:inline text-[10px] text-purple-400 animate-pulse font-mono truncate">
              {isThinking ? tr('思考中...', 'Thinking...') : tr('正在执行步骤...', 'Executing step...')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          {confirming ? (
            <span className="flex items-center gap-1 text-zinc-400 font-mono text-[10px]">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="hidden sm:inline">{tr('确认中', 'Checking', 'Prüfen')}</span>
            </span>
          ) : isEffectivelyLive ? (
            <span className="flex items-center gap-1 text-purple-400 font-mono text-[10px]">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="hidden sm:inline">{isThinking ? tr('思考中', 'Thinking') : tr('运行中', 'Running')}</span>
            </span>
          ) : turn.isAborted ? (
            <DelayedTooltip content={tr('生成已中断', 'Generation was aborted')} variant="warning" placement="top-end">
              <span className="flex items-center gap-1 text-amber-400 font-mono text-[10px]">
                <AlertCircle className="w-3 h-3" />
                <span className="hidden sm:inline">{tr('已中断', 'Aborted')}</span>
              </span>
            </DelayedTooltip>
          ) : turn.hasRealError ? (
            <DelayedTooltip content={tr('遇到执行错误', 'Execution error encountered')} variant="error" placement="top-end">
              <span className="flex items-center gap-1 text-rose-400 font-mono text-[10px]">
                <XCircle className="w-3 h-3" />
                <span className="hidden sm:inline">{tr('异常', 'Issues')}</span>
              </span>
            </DelayedTooltip>
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
          <HierarchicalToolList groups={turn.groups} messageId={messageId} isLive={confirming || isEffectivelyLive} />
        </div>
      )}
    </div>
  )
}
