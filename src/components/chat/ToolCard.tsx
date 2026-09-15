import { useState } from 'react'
import {
  Terminal,
  FileCode,
  FileEdit,
  Eye,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react'
import type { ToolPart } from '../../types/opencode'

interface ToolCardProps {
  part: ToolPart
  isLive?: boolean
}

export function ToolCard({ part, isLive }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedSection, setCopiedSection] = useState<'input' | 'output' | null>(null)

  const { tool, state } = part
  const status = state?.status || 'completed'
  const isRunning = (isLive ?? true) && (status === 'running' || status === 'pending')
  const isInterrupted = !(isLive ?? true) && (status === 'running' || status === 'pending')
  const isError = status === 'error'

  // Extract primary display info based on tool
  let title = state?.title || part.callID || tool
  let commandText = ''
  let fileTarget = ''

  if (tool === 'bash' || tool === 'shell') {
    commandText = state?.input?.command || ''
    title = `Shell ${commandText}`
  } else if (tool === 'edit' || tool === 'write') {
    fileTarget = state?.input?.filePath || state?.input?.path || ''
    title = `${tool === 'edit' ? 'Edit' : 'Write'} ${fileTarget}`
  } else if (tool === 'read') {
    fileTarget = state?.input?.filePath || state?.input?.path || ''
    title = `Read ${fileTarget}`
  } else if (tool === 'grep' || tool === 'find') {
    title = `${tool.toUpperCase()} ${state?.input?.pattern || state?.input?.query || ''}`
  }

  const output = state?.output || state?.error || ''

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(output || commandText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1000)
  }

  const handleCopySection = (e: React.MouseEvent, text: string, section: 'input' | 'output') => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopiedSection(section)
    setTimeout(() => setCopiedSection(null), 1000)
  }

  // Get icon by tool type
  const getToolIcon = () => {
    switch (tool) {
      case 'bash':
      case 'shell':
        return <Terminal className="w-3.5 h-3.5 text-zinc-400" />
      case 'edit':
        return <FileEdit className="w-3.5 h-3.5 text-amber-400" />
      case 'write':
        return <FileCode className="w-3.5 h-3.5 text-emerald-400" />
      case 'read':
        return <Eye className="w-3.5 h-3.5 text-blue-400" />
      case 'grep':
      case 'find':
        return <Search className="w-3.5 h-3.5 text-purple-400" />
      default:
        return <Terminal className="w-3.5 h-3.5 text-zinc-400" />
    }
  }

  return (
    <div className="my-2 rounded-md border border-[#272a30] bg-[#121417] overflow-hidden text-xs">
      {/* Tool Header Bar (Replicating Image 1 Shell banner) */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3 py-2 bg-[#16181d] hover:bg-[#1a1d23] cursor-pointer transition-colors select-none"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {getToolIcon()}
          <span className="font-mono text-zinc-300 truncate" title={title}>
            {title}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          {/* Status Indicator */}
          {isRunning ? (
            <span className="flex items-center gap-1 text-purple-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="text-[10px]">Running</span>
            </span>
          ) : isInterrupted ? (
            <span className="flex items-center gap-1 text-amber-400/90" title="Tool execution interrupted">
              <AlertCircle className="w-3 h-3" />
              <span className="text-[10px]">Interrupted</span>
            </span>
          ) : isError ? (
            <span className="flex items-center gap-1 text-rose-400">
              <XCircle className="w-3 h-3" />
              <span className="text-[10px]">Failed</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
            </span>
          )}

          {/* Copy Button */}
          {output && (
            <button
              onClick={handleCopy}
              className="p-1 text-zinc-500 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
              title="Copy output"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          )}

          {/* Expand / Collapse Chevron */}
          <button className="text-zinc-500 hover:text-zinc-200">
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Collapsible Content / Terminal Body */}
      {isExpanded && (
        <div className="border-t border-[#272a30] bg-[#0c0e10] p-3 overflow-x-auto font-mono text-[11px] leading-relaxed select-text cursor-text">
          {commandText && (
            <div className="mb-2 text-zinc-400 pb-2 border-b border-zinc-800">
              <span className="text-emerald-400 mr-1.5">$</span>
              <span className="text-zinc-200 select-text">{commandText}</span>
            </div>
          )}

          {state?.input && Object.keys(state.input).length > 0 && !commandText && (
            <div className="mb-2 text-zinc-400">
              <div className="flex items-center justify-between mb-1">
                <span className="text-zinc-500 uppercase text-[9px] font-sans font-bold">Input:</span>
                <button
                  type="button"
                  onClick={(e) => handleCopySection(e, JSON.stringify(state.input, null, 2), 'input')}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/80 transition-colors"
                  title="复制 Input"
                >
                  {copiedSection === 'input' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] text-emerald-400 font-sans">已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span className="text-[10px] font-sans">复制</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="text-zinc-300 select-text cursor-text">{JSON.stringify(state.input, null, 2)}</pre>
            </div>
          )}

          {output ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-zinc-500 uppercase text-[9px] font-sans font-bold block">
                  {isError ? 'Error Output:' : 'Output:'}
                </span>
                <button
                  type="button"
                  onClick={(e) => handleCopySection(e, output, 'output')}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/80 transition-colors"
                  title="复制 Output"
                >
                  {copiedSection === 'output' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] text-emerald-400 font-sans">已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span className="text-[10px] font-sans">复制</span>
                    </>
                  )}
                </button>
              </div>
              <pre
                className={`whitespace-pre-wrap break-all select-text cursor-text ${
                  isError ? 'text-rose-400' : 'text-zinc-300'
                }`}
              >
                {output}
              </pre>
            </div>
          ) : (
            <div className="text-zinc-600 italic select-none">No output recorded</div>
          )}
        </div>
      )}
    </div>
  )
}
