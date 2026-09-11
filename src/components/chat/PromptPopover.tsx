import { useEffect, useRef } from 'react'
import { Terminal, Bot, FileText, Sparkles } from 'lucide-react'
import type { CommandItem, AgentInfo } from '../../types/opencode'

export type PopoverItem =
  | { type: 'command'; item: CommandItem }
  | { type: 'agent'; item: AgentInfo }
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
            <Terminal className="w-3 h-3 text-orange-400" />
            <span>Commands</span>
          </>
        ) : (
          <>
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>Context (Agents & Files)</span>
          </>
        )}
      </div>

      <div className="space-y-0.5">
        {items.map((entry, index) => {
          const isSelected = selectedIndex === index

          if (entry.type === 'command') {
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
                    ? 'bg-orange-600/20 text-orange-200 border-l-2 border-orange-500 font-medium'
                    : 'text-zinc-300 hover:bg-[#1c2028]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Terminal className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span className="font-mono text-zinc-100 font-semibold truncate">/{entry.item.name}</span>
                  {entry.item.description && (
                    <span className="text-[11px] text-zinc-500 truncate">{entry.item.description}</span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-zinc-600 shrink-0">Command</span>
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
                    ? 'bg-purple-600/20 text-purple-200 border-l-2 border-purple-500 font-medium'
                    : 'text-zinc-300 hover:bg-[#1c2028]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Bot className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span className="font-semibold text-zinc-100 truncate">@{entry.item.name}</span>
                  {entry.item.description && (
                    <span className="text-[11px] text-zinc-500 truncate">{entry.item.description}</span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-zinc-600 shrink-0">Agent</span>
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
                    ? 'bg-blue-600/20 text-blue-200 border-l-2 border-blue-500 font-medium'
                    : 'text-zinc-300 hover:bg-[#1c2028]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="font-mono text-zinc-200 truncate">{entry.item}</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-600 shrink-0">File</span>
              </button>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
