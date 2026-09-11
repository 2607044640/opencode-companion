import { useState } from 'react'
import { Sparkles, ChevronDown, ChevronRight, Copy, Check, Clock } from 'lucide-react'
import type { ReasoningPart } from '../../types/opencode'

interface ReasoningCardProps {
  part: ReasoningPart
  title?: string
}

export function ReasoningCard({ part, title }: ReasoningCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const text = part.text || ''

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Duration metrics if available
  let durationStr = ''
  if (part.time?.start && part.time?.end) {
    const diff = (part.time.end - part.time.start) / 1000
    if (diff > 0) {
      durationStr = `${diff.toFixed(1)}s`
    }
  }

  return (
    <div className="my-2 rounded-lg border border-purple-900/30 bg-[#14121a]/90 overflow-hidden text-xs shadow-sm transition-all">
      {/* Header bar: Sleek, compact 28px height, auto-collapsed by default */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3 py-1.5 bg-purple-950/20 hover:bg-purple-950/40 cursor-pointer transition-colors select-none"
      >
        <div className="flex items-center gap-2 text-purple-300 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="font-medium text-[11px] truncate">
            {title || '思考过程 (Thinking Process)'}
          </span>
          <span className="text-[10px] text-purple-400/60 font-mono shrink-0">
            ({text.length.toLocaleString()} 字)
          </span>
          {durationStr && (
            <span className="hidden sm:flex items-center gap-0.5 text-[10px] text-purple-400/50 font-mono shrink-0">
              <Clock className="w-2.5 h-2.5" />
              <span>{durationStr}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {text && (
            <button
              onClick={handleCopy}
              className="p-1 text-purple-400/70 hover:text-purple-200 rounded hover:bg-purple-900/40 transition-colors"
              title="复制思考过程"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
          <button className="p-0.5 text-purple-400 hover:text-purple-200">
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded reasoning body: Capped height with custom scrollbar so it never hijacks the entire viewport */}
      {isExpanded && (
        <div className="p-3.5 border-t border-purple-900/30 text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap font-sans bg-[#0e0d13] max-h-96 overflow-y-auto selection:bg-purple-900/50 selection:text-white">
          {text || <span className="italic text-zinc-600">Thinking in progress...</span>}
        </div>
      )}
    </div>
  )
}

