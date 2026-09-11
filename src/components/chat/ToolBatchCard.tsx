import { useState } from 'react'
import { Wrench, ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { ToolPart } from '../../types/opencode'
import { ToolCard } from './ToolCard'

interface ToolBatchCardProps {
  tools: ToolPart[]
}

export function ToolBatchCard({ tools }: ToolBatchCardProps) {
  const hasRunning = tools.some(
    (t) => t.state?.status === 'running' || t.state?.status === 'pending'
  )
  const hasError = tools.some((t) => t.state?.status === 'error')

  // Collapsed by default per user requirement; click header to toggle
  const [isExpanded, setIsExpanded] = useState(false)

  // Aggregate tool counts by tool name (e.g. read: 4, edit: 2)
  const toolCounts = tools.reduce<Record<string, number>>((acc, t) => {
    const name = t.tool || 'tool'
    acc[name] = (acc[name] || 0) + 1
    return acc
  }, {})

  const summaryPills = Object.entries(toolCounts).map(([name, count]) => `${name} × ${count}`)

  return (
    <div className="my-2 rounded-lg border border-[#272a30] bg-[#121417]/80 overflow-hidden text-xs shadow-sm transition-all">
      {/* Batch Header Bar: Single sleek row, height ~32px */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3 py-2 bg-[#16181d] hover:bg-[#1b1e24] cursor-pointer transition-colors select-none"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-5 h-5 rounded flex items-center justify-center bg-zinc-800/80 text-zinc-300 border border-zinc-700/50">
            <Wrench className="w-3 h-3 text-zinc-400" />
          </div>
          <span className="font-medium text-[11px] text-zinc-200 shrink-0">
            工具执行批次
          </span>
          <span className="text-[10px] text-zinc-400 font-mono shrink-0">
            (共 {tools.length} 项)
          </span>
          <span className="hidden sm:inline text-[10px] text-zinc-500 font-mono truncate">
            {summaryPills.join(' · ')}
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 ml-2">
          {hasRunning ? (
            <span className="flex items-center gap-1 text-purple-400 font-mono text-[10px]">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>运行中</span>
            </span>
          ) : hasError ? (
            <span className="flex items-center gap-1 text-rose-400 font-mono text-[10px]">
              <XCircle className="w-3 h-3" />
              <span>有异常</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-400/90 font-mono text-[10px]">
              <CheckCircle2 className="w-3 h-3" />
              <span className="hidden sm:inline">已完成</span>
            </span>
          )}

          <button className="text-zinc-500 hover:text-zinc-200">
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Tools List */}
      {isExpanded && (
        <div className="p-2 space-y-1.5 border-t border-[#272a30] bg-[#0c0e10]/60">
          {tools.map((tool) => (
            <ToolCard key={tool.id} part={tool} />
          ))}
        </div>
      )}
    </div>
  )
}
