import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import {
  Globe,
  Search,
  ExternalLink,
  Copy,
  Check,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Code,
} from 'lucide-react'

export interface WebSearchModalProps {
  isOpen: boolean
  onClose: () => void
  toolName: string
  isFetch: boolean
  target: string
  domain?: string
  status: 'pending' | 'running' | 'completed' | 'error'
  isLive?: boolean
  cleanOutput: string
  rawOutput: string
  lineCount: number
  charCount: number
  byteSizeStr: string
}

export function WebSearchModal({
  isOpen,
  onClose,
  toolName,
  isFetch,
  target,
  domain,
  status,
  isLive,
  cleanOutput,
  rawOutput,
  lineCount,
  charCount,
  byteSizeStr,
}: WebSearchModalProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'raw'>('preview')
  const [copiedTarget, setCopiedTarget] = useState(false)
  const [copiedBody, setCopiedBody] = useState(false)

  const isRunning = (isLive ?? true) && (status === 'running' || status === 'pending')
  const isError = status === 'error'
  const isUrl = target.startsWith('http://') || target.startsWith('https://')

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleCopyTarget = () => {
    navigator.clipboard.writeText(target)
    setCopiedTarget(true)
    setTimeout(() => setCopiedTarget(false), 1500)
  }

  const handleCopyBody = () => {
    const text = activeTab === 'raw' ? rawOutput : cleanOutput
    navigator.clipboard.writeText(text)
    setCopiedBody(true)
    setTimeout(() => setCopiedBody(false), 1500)
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Web Search & Fetch Details"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-xl border border-zinc-700/80 bg-[#101318] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#161a22] border-b border-[#232834] select-none shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
            <div className="w-6 h-6 rounded flex items-center justify-center bg-sky-950/80 border border-sky-800/60 text-sky-300 shrink-0">
              {isFetch ? <Globe className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="font-semibold text-xs text-zinc-100 font-mono">
                {isFetch ? 'WebFetch' : 'WebSearch'}
              </span>

              {domain && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800/90 text-sky-300 border border-zinc-700/60">
                  {domain}
                </span>
              )}

              <span className="text-[10px] font-mono text-zinc-500 uppercase">
                [{toolName}]
              </span>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isUrl && (
              <a
                href={target}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1 px-2 py-1 rounded bg-sky-950/60 hover:bg-sky-900/70 border border-sky-800/60 text-sky-300 text-[11px] font-mono transition-colors"
                title="在浏览器中打开新标签页 (Open URL in new tab)"
              >
                <ExternalLink className="w-3 h-3" />
                <span className="hidden sm:inline">打开网页</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleCopyBody}
              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 text-[11px] font-mono transition-colors"
              title="复制全部响应内容"
            >
              {copiedBody ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>复制结果</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-zinc-100 rounded hover:bg-zinc-800 transition-colors"
              title="关闭 (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Target Address / Query Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#12151b] border-b border-[#212631] text-xs">
          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2 font-mono">
            <span className="text-zinc-500 shrink-0 text-[11px]">
              {isFetch ? 'URL:' : 'QUERY:'}
            </span>
            <span
              className="text-zinc-200 text-[11px] truncate select-all"
              title={target}
            >
              {target}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopyTarget}
            className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 shrink-0 transition-colors"
            title="复制目标地址/查询词"
          >
            {copiedTarget ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 px-4 py-1.5 bg-[#0e1116] border-b border-[#1f242e] text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              activeTab === 'preview'
                ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <FileText className="w-3 h-3 text-sky-400" />
            <span>解析内容 (Rendered)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('raw')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              activeTab === 'raw'
                ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Code className="w-3 h-3 text-purple-400" />
            <span>原始响应 (Raw Output)</span>
          </button>

          <div className="ml-auto flex items-center gap-2 text-[10px] font-mono text-zinc-500">
            <span>{lineCount} 行</span>
            <span>•</span>
            <span>{charCount} 字符</span>
            <span>•</span>
            <span>{byteSizeStr}</span>
          </div>
        </div>

        {/* Modal Body / Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#090b0e] select-text">
          {isRunning ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
              <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
              <span className="font-mono text-xs">正在请求并抓取目标数据...</span>
            </div>
          ) : isError ? (
            <div className="p-4 rounded-lg bg-rose-950/30 border border-rose-800/50 text-rose-300 font-mono text-xs whitespace-pre-wrap">
              <div className="flex items-center gap-2 font-semibold mb-2 text-rose-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>抓取/搜索失败 (Request Error)</span>
              </div>
              <div>{rawOutput || cleanOutput || '未知错误 (Unknown error)'}</div>
            </div>
          ) : activeTab === 'preview' ? (
            cleanOutput ? (
              <div className="prose prose-invert prose-xs max-w-none text-zinc-300 font-sans leading-relaxed break-words">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {cleanOutput}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="py-12 text-center text-zinc-500 italic font-mono text-xs">
                (无响应内容 / Empty response)
              </div>
            )
          ) : (
            <pre className="text-zinc-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all bg-black/40 p-3 rounded border border-zinc-800/80">
              {rawOutput || '(无原始输出 / Empty output)'}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#14171f] border-t border-[#232834] select-none shrink-0 text-xs">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <span className="flex items-center gap-1.5 text-sky-400 font-mono text-[11px]">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>抓取进行中</span>
              </span>
            ) : isError ? (
              <span className="flex items-center gap-1.5 text-rose-400 font-mono text-[11px]">
                <AlertCircle className="w-3 h-3" />
                <span>执行异常</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
                <CheckCircle2 className="w-3 h-3" />
                <span>抓取成功</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
