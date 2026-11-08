import { useEffect, useRef } from 'react'
import { Terminal, Bot, FileText, Sparkles, MessageSquare } from 'lucide-react'
import type { CommandItem, AgentInfo, SkillItem, Session } from '../../types/opencode'
import { formatSessionRelativeTime } from '../../utils/conversation-mention'

export type PopoverItem =
  | { type: 'command'; item: CommandItem }
  | { type: 'skill'; item: SkillItem }
  | { type: 'agent'; item: AgentInfo }
  | { type: 'conversation'; item: Session }
  | { type: 'file'; item: string }

interface PromptPopoverProps {
  isOpen: boolean
  mode: 'commands' | 'context' | null
  items: PopoverItem[]
  selectedIndex: number
  onSelect: (item: PopoverItem) => void
  onHoverIndex: (index: number) => void
}

export function PromptPopover({
  isOpen,
  mode,
  items,
  selectedIndex,
  onSelect,
  onHoverIndex,
}: PromptPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Scroll active item into view
  useEffect(() => {
    if (!isOpen || !containerRef.current) return
    const activeEl = containerRef.current.querySelector('[data-selected="true"]') as HTMLElement | null
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, isOpen])

  if (!isOpen || items.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full mb-2 left-0 right-0 max-h-64 overflow-y-auto rounded-xl border border-[#2d323b] bg-[#14171d]/95 backdrop-blur-md shadow-2xl z-50 p-1.5 no-scrollbar select-none"
    >
      <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-800/80 mb-1">
        {mode === 'commands' ? (
          <>
            <Terminal className="w-3 h-3 text-sky-400" />
            <span>{items.some((entry) => entry.type === 'skill') ? 'Commands & Skills' : 'Commands'}</span>
          </>
        ) : (
          <>
            <Sparkles className="w-3 h-3 text-sky-400" />
            <span>Context (Conversations, Agents & Files)</span>
          </>
        )}
      </div>

      <div className="space-y-0.5">
        {items.map((entry, index) => {
          const isSelected = selectedIndex === index

          if (entry.type === 'command') {
            const categoryBadge = entry.item.category
              ? entry.item.category.replace(' & Planning', '').replace(' & Goals', '').replace(' & Automation', '').replace(' & Memory', '')
              : 'Command'
            return (
              <button
                key={`cmd_${entry.item.name}_${index}`}
                type="button"
                data-selected={isSelected}
                onMouseEnter={() => onHoverIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(entry)
                }}
                onClick={() => onSelect(entry)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors ${
                  isSelected
                    ? 'bg-sky-600/20 text-sky-200 border-l-2 border-sky-500 font-medium'
                    : 'text-zinc-300 hover:bg-[#1c2028]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Terminal className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="font-mono text-zinc-100 font-semibold shrink-0">/{entry.item.name}</span>
                  {entry.item.argumentHint && (
                    <span className="font-mono text-[11px] text-sky-400/70 shrink-0 hidden sm:inline">
                      {entry.item.argumentHint}
                    </span>
                  )}
                  {entry.item.description && (
                    <span className="text-[11px] text-zinc-400 truncate">{entry.item.description}</span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800/60 border border-zinc-700/50 px-1.5 py-0.5 rounded shrink-0">
                  {categoryBadge}
                </span>
              </button>
            )
          }

          if (entry.type === 'agent') {
            return (
              <button
                key={`agent_${entry.item.name}_${index}`}
                type="button"
                data-selected={isSelected}
                onMouseEnter={() => onHoverIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(entry)
                }}
                onClick={() => onSelect(entry)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors ${
                  isSelected
                    ? 'bg-sky-600/20 text-sky-200 border-l-2 border-sky-500 font-medium'
                    : 'text-zinc-300 hover:bg-[#1c2028]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Bot className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="font-semibold text-zinc-100 truncate">@{entry.item.name}</span>
                  {entry.item.description && (
                    <span className="text-[11px] text-zinc-500 truncate">{entry.item.description}</span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-zinc-600 shrink-0">Agent</span>
              </button>
            )
          }

          if (entry.type === 'conversation') {
            const timeAgo = formatSessionRelativeTime(entry.item.time?.updated || entry.item.time?.created)
            return (
              <button
                key={`conv_${entry.item.id}_${index}`}
                type="button"
                data-selected={isSelected}
                onMouseEnter={() => onHoverIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(entry)
                }}
                onClick={() => onSelect(entry)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors ${
                  isSelected
                    ? 'bg-sky-600/20 text-sky-200 border-l-2 border-sky-500 font-medium'
                    : 'text-zinc-300 hover:bg-[#1c2028]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="font-medium truncate text-zinc-200">{entry.item.title || entry.item.id}</span>
                  {timeAgo && (
                    <span className="text-[10px] text-zinc-500 shrink-0">({timeAgo})</span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-sky-400/90 bg-sky-950/60 border border-sky-800/50 px-1.5 py-0.5 rounded shrink-0">Conversation</span>
              </button>
            )
          }

          if (entry.type === 'file') {
            return (
              <button
                key={`file_${entry.item}_${index}`}
                type="button"
                data-selected={isSelected}
                onMouseEnter={() => onHoverIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(entry)
                }}
                onClick={() => onSelect(entry)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors ${
                  isSelected
                    ? 'bg-sky-600/20 text-sky-200 border-l-2 border-sky-500 font-medium'
                    : 'text-zinc-300 hover:bg-[#1c2028]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="font-mono text-zinc-200 truncate">{entry.item}</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-600 shrink-0">File</span>
              </button>
            )
          }

          if (entry.type === 'skill') {
            return (
              <button
                key={`skill_${entry.item.name}_${index}`}
                type="button"
                data-selected={isSelected}
                onMouseEnter={() => onHoverIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(entry)
                }}
                onClick={() => onSelect(entry)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors ${
                  isSelected
                    ? 'bg-sky-600/20 text-sky-200 border-l-2 border-sky-500 font-medium'
                    : 'text-zinc-300 hover:bg-[#1c2028]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#161c24] border border-sky-700/50 text-sky-300 font-mono text-[11px] font-semibold leading-none">
                    <span className="text-sky-500/90">&lt;&gt;</span>
                    <span className="truncate max-w-[140px]">{entry.item.name}</span>
                  </span>
                  {entry.item.description && (
                    <span className="text-[11px] text-zinc-500 truncate">{entry.item.description}</span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-zinc-600 shrink-0">Skill</span>
              </button>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
