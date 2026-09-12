import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Search,
  Terminal,
  Brain,
  CheckCircle2,
  XCircle,
  Loader2,
  Check,
  Copy,
} from 'lucide-react'
import type { WorkGroup, ExploreItem, CommandItem, ThoughtItem } from '../../utils/worked-summary'
import { formatWorkedLabel } from '../../utils/worked-summary'
import { EditRow } from './EditRow'
import { ToolCard } from './ToolCard'

interface HierarchicalToolListProps {
  groups: WorkGroup[]
  messageId?: string
}

function ExploreGroupCard({ items }: { items: ExploreItem[] }) {
  const [expanded, setExpanded] = useState(false)

  // Count unique files and search items
  const uniqueFiles = new Set(
    items.filter((i) => i.kind === 'file').map((i) => i.pathOrQuery)
  ).size
  const searchCount = items.filter((i) => i.kind === 'search').length

  let summaryLabel = ''
  if (uniqueFiles > 0 && searchCount > 0) {
    summaryLabel = `Explored ${uniqueFiles} ${uniqueFiles === 1 ? 'file' : 'files'}, ${searchCount} ${searchCount === 1 ? 'search' : 'searches'}`
  } else if (uniqueFiles > 0) {
    summaryLabel = `Explored ${uniqueFiles} ${uniqueFiles === 1 ? 'file' : 'files'}`
  } else {
    summaryLabel = `Searched ${searchCount} ${searchCount === 1 ? 'query' : 'queries'}`
  }

  const hasRunning = items.some((i) => i.status === 'running' || i.status === 'pending')
  const hasError = items.some((i) => i.status === 'error')

  return (
    <div className="rounded border border-zinc-800/60 bg-zinc-900/40 overflow-hidden text-xs">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-2.5 py-1.5 hover:bg-zinc-800/50 cursor-pointer select-none transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Eye className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="font-medium text-zinc-300 truncate">
            {summaryLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          {hasRunning ? (
            <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
          ) : hasError ? (
            <XCircle className="w-3 h-3 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-3 h-3 text-zinc-500" />
          )}
          <button className="text-zinc-500 hover:text-zinc-300">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 py-2 border-t border-zinc-800/50 bg-[#090b0d]/70 space-y-1.5 font-mono text-[11px] select-text cursor-text">
          {items.map((it, idx) => (
            <div key={`${it.partId}_${idx}`} className="flex items-center gap-2 text-zinc-400 truncate">
              {it.kind === 'file' ? (
                <Eye className="w-3 h-3 text-blue-400/80 shrink-0" />
              ) : (
                <Search className="w-3 h-3 text-purple-400/80 shrink-0" />
              )}
              <span className="text-zinc-300 truncate select-text">{it.pathOrQuery}</span>
              <span className="text-zinc-600 text-[9px] uppercase font-sans font-bold ml-auto shrink-0 select-none">
                {it.tool}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CommandGroupCard({ items }: { items: CommandItem[] }) {
  const [expanded, setExpanded] = useState(false)
  const [copiedCmdId, setCopiedCmdId] = useState<string | null>(null)
  const [copiedOutId, setCopiedOutId] = useState<string | null>(null)

  const handleCopyCommand = (id: string, text?: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedCmdId(id)
    setTimeout(() => setCopiedCmdId(null), 1000)
  }

  const handleCopyOutput = (id: string, text?: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedOutId(id)
    setTimeout(() => setCopiedOutId(null), 1000)
  }

  return (
    <div className="rounded border border-zinc-800/60 bg-zinc-900/40 overflow-hidden text-xs">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-2.5 py-1.5 hover:bg-zinc-800/50 cursor-pointer select-none transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Terminal className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="font-medium text-zinc-300 truncate">
            Ran {items.length} {items.length === 1 ? 'command' : 'commands'}
          </span>
        </div>

        <button className="text-zinc-500 hover:text-zinc-300">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="p-2 border-t border-zinc-800/50 bg-[#090b0d]/70 space-y-2 font-mono text-[11px] select-text cursor-text">
          {items.map((cmd) => (
            <div key={cmd.partId} className="rounded bg-zinc-950 p-2.5 border border-zinc-800/40">
              {/* Command Row: Full Command + Copy Command Button */}
              <div className="flex items-start justify-between gap-2 text-zinc-300">
                <div className="flex items-start gap-1.5 min-w-0 flex-1 leading-relaxed">
                  <span className="text-emerald-400 shrink-0 select-none font-bold">$</span>
                  <span className="select-text break-all whitespace-pre-wrap" title={cmd.command}>
                    {cmd.command}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopyCommand(cmd.partId, cmd.command)
                  }}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 rounded transition-colors shrink-0"
                  title="复制命令 (Copy command)"
                >
                  {copiedCmdId === cmd.partId ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="text-[10px] text-emerald-400 font-sans">已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 shrink-0" />
                      <span className="text-[10px] font-sans text-zinc-400">复制命令</span>
                    </>
                  )}
                </button>
              </div>

              {/* Output Block: Separate Header with Copy Output Button */}
              {cmd.outputPreview && (
                <div className="mt-2 pt-1.5 border-t border-zinc-800/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] uppercase font-sans font-bold text-zinc-500 select-none">
                      Output:
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopyOutput(cmd.partId, cmd.outputPreview)
                      }}
                      className="flex items-center gap-1 px-1.5 py-0.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80 rounded transition-colors"
                      title="复制输出 (Copy output)"
                    >
                      {copiedOutId === cmd.partId ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span className="text-[10px] text-emerald-400 font-sans">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 shrink-0" />
                          <span className="text-[10px] font-sans">复制输出</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="text-[10px] text-zinc-400 whitespace-pre-wrap break-all max-h-40 overflow-y-auto bg-black/50 p-2 rounded border border-zinc-900 select-text cursor-text">
                    {cmd.outputPreview}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ThoughtGroupCard({ items, durationMs }: { items: ThoughtItem[]; durationMs: number }) {
  const [expanded, setExpanded] = useState(false)

  const durationStr = durationMs > 0 ? formatWorkedLabel(durationMs, false).replace('Worked for ', '') : ''
  const title = durationStr ? `Thought for ${durationStr}` : 'Thought process'

  return (
    <div className="rounded border border-zinc-800/60 bg-zinc-900/40 overflow-hidden text-xs">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-2.5 py-1.5 hover:bg-zinc-800/50 cursor-pointer select-none transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="font-medium text-purple-300 truncate">
            {title}
          </span>
        </div>

        <button className="text-zinc-500 hover:text-zinc-300">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="p-3 border-t border-zinc-800/50 bg-[#090b0d]/70 text-zinc-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto select-text cursor-text">
          {items.map((th) => th.text).join('\n\n')}
        </div>
      )}
    </div>
  )
}

export function HierarchicalToolList({ groups, messageId }: HierarchicalToolListProps) {
  return (
    <div className="p-2 space-y-1.5 bg-[#0c0e11]/80">
      {groups.map((group, idx) => {
        if (group.kind === 'explore') {
          return <ExploreGroupCard key={`explore_${idx}`} items={group.items} />
        }
        if (group.kind === 'edit') {
          return <EditRow key={group.item.partId} item={group.item} messageId={messageId} />
        }
        if (group.kind === 'command') {
          return <CommandGroupCard key={`cmd_${idx}`} items={group.items} />
        }
        if (group.kind === 'thought') {
          return (
            <ThoughtGroupCard
              key={`th_${idx}`}
              items={group.items}
              durationMs={group.durationMs}
            />
          )
        }
        if (group.kind === 'other') {
          return (
            <div key={`other_${idx}`} className="space-y-1">
              {group.items.map((ot) => (
                <ToolCard key={ot.partId} part={ot.rawPart} />
              ))}
            </div>
          )
        }
        return null
      })}
    </div>
  )
}
