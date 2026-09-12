import { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import type { WorkedTurn } from '../../utils/worked-summary'
import { formatWorkedLabel } from '../../utils/worked-summary'
import { HierarchicalToolList } from './HierarchicalToolList'

interface WorkedSummaryCardProps {
  turn: WorkedTurn
  messageId: string
}

export function WorkedSummaryCard({ turn, messageId }: WorkedSummaryCardProps) {
  // Collapsed by default once turn is completed, auto-expanded when live
  const [expanded, setExpanded] = useState(turn.isLive)
  const userInteractedRef = useRef(false)

  // Live tick offset for running turn
  const [tickMs, setTickMs] = useState(0)

  useEffect(() => {
    if (!turn.isLive) {
      setTickMs(0)
      return
    }

    const timer = setInterval(() => {
      setTickMs((prev) => prev + 1000)
    }, 1000)

    return () => clearInterval(timer)
  }, [turn.isLive])

  const label = formatWorkedLabel(
    turn.isLive ? turn.durationMs + tickMs : turn.durationMs,
    turn.isLive
  )

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

          {turn.isLive && (
            <span className="hidden sm:inline text-[10px] text-purple-400 animate-pulse font-mono truncate">
              Executing step...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          {turn.isLive ? (
            <span className="flex items-center gap-1 text-purple-400 font-mono text-[10px]">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="hidden sm:inline">Running</span>
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
          <HierarchicalToolList groups={turn.groups} messageId={messageId} />
        </div>
      )}
    </div>
  )
}
