import { useState, useMemo } from 'react'
import {
  Globe,
  Search,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
} from 'lucide-react'
import type { ToolPart } from '../../types/opencode'
import { WebSearchModal } from './WebSearchModal'

export interface WebSearchToolCardProps {
  part: ToolPart
  isLive?: boolean
}

export interface ParsedWebSearchData {
  isFetch: boolean
  target: string
  domain?: string
  cleanOutput: string
  rawOutput: string
  lineCount: number
  charCount: number
  byteSizeStr: string
}

const WEB_SEARCH_TOOLS = new Set([
  'websearch',
  'web_search',
  'search_web',
  'google_search',
  'brave_search',
  'bing_search',
  'ddg_search',
  'duckduckgo_search',
])

const WEB_FETCH_TOOLS = new Set([
  'webfetch',
  'web_fetch',
  'fetch_web',
  'read_url_content',
  'read_url',
  'url_fetch',
  'fetch',
  'browser',
  'browse',
  'browser_action',
  'web_scrape',
  'scrape',
])

/**
 * Checks if a given tool part is a web search or page fetch tool.
 */
export function isWebSearchTool(part: ToolPart): boolean {
  if (!part) return false
  const toolName = (part.tool || '').toLowerCase()
  if (WEB_SEARCH_TOOLS.has(toolName) || WEB_FETCH_TOOLS.has(toolName)) {
    return true
  }

  const input = (part.state?.input || {}) as Record<string, any>
  const urlCandidate = input.url || input.Url || input.uri || input.link
  if (typeof urlCandidate === 'string') {
    const trimmed = urlCandidate.trim().toLowerCase()
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return true
    }
  }

  if (toolName.includes('web') || toolName.includes('fetch') || toolName.includes('browser')) {
    return true
  }

  return false
}

/**
 * Normalizes and extracts clean target URL or query, domain, and formatted body.
 */
export function parseWebSearchData(part: ToolPart): ParsedWebSearchData {
  const toolName = (part.tool || '').toLowerCase()
  const input = (part.state?.input || {}) as Record<string, any>
  const rawOutput = String(part.state?.output || part.state?.error || '').trim()

  const isFetch =
    WEB_FETCH_TOOLS.has(toolName) ||
    Boolean(input.url || input.Url || input.uri || input.link) ||
    toolName.includes('fetch') ||
    toolName.includes('browse') ||
    toolName.includes('scrape')

  // Extract raw target
  let target =
    input.url ||
    input.Url ||
    input.uri ||
    input.link ||
    input.query ||
    input.Query ||
    input.pattern ||
    input.search ||
    input.q ||
    input.target ||
    part.state?.title ||
    toolName

  // Clean target if it is polluted by MIME artifacts (e.g. "html; charset=utf-8)")
  if (typeof target === 'string') {
    target = target.trim()
    if (target.startsWith('html;') || target.includes('charset=')) {
      target = input.url || input.Url || input.uri || input.path || 'Web Target'
    }
  } else {
    target = String(target || '')
  }

  // Extract domain if target is an HTTP/HTTPS URL
  let domain: string | undefined
  if (target.startsWith('http://') || target.startsWith('https://')) {
    try {
      const parsedUrl = new URL(target)
      domain = parsedUrl.hostname
    } catch {
      // ignore
    }
  } else if (!isFetch) {
    domain = 'Web Search'
  }

  // Clean output: strip MIME header noise from head
  let cleanOutput = rawOutput
  if (cleanOutput.startsWith('html; charset=') || cleanOutput.startsWith('Content-Type:')) {
    const firstNewline = cleanOutput.indexOf('\n')
    if (firstNewline !== -1) {
      cleanOutput = cleanOutput.slice(firstNewline + 1).trim()
    }
  }

  const lines = cleanOutput ? cleanOutput.split('\n') : []
  const lineCount = cleanOutput ? lines.length : 0
  const charCount = cleanOutput.length

  let byteSizeStr = '0 B'
  if (charCount > 0) {
    if (charCount < 1024) {
      byteSizeStr = `${charCount} B`
    } else {
      byteSizeStr = `${(charCount / 1024).toFixed(1)} KB`
    }
  }

  return {
    isFetch,
    target,
    domain,
    cleanOutput,
    rawOutput,
    lineCount,
    charCount,
    byteSizeStr,
  }
}

/**
 * High-signal WebSearch & WebFetch execution card.
 */
export function WebSearchToolCard({ part, isLive }: WebSearchToolCardProps) {
  const [isCardExpanded, setIsCardExpanded] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [copiedTarget, setCopiedTarget] = useState(false)
  const [copiedBody, setCopiedBody] = useState(false)

  const { state } = part
  const status = state?.status || 'completed'
  const isRunning = (isLive ?? true) && (status === 'running' || status === 'pending')
  const isError = status === 'error'

  const parsed = useMemo(() => parseWebSearchData(part), [part])
  const isUrl = parsed.target.startsWith('http://') || parsed.target.startsWith('https://')

  const handleCopyTarget = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(parsed.target)
    setCopiedTarget(true)
    setTimeout(() => setCopiedTarget(false), 1200)
  }

  const handleCopyBody = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(parsed.cleanOutput || parsed.rawOutput)
    setCopiedBody(true)
    setTimeout(() => setCopiedBody(false), 1200)
  }

  return (
    <>
      <div className="my-2 rounded-lg border border-[#232834] bg-[#0e1116] overflow-hidden text-xs shadow-sm transition-all">
        {/* Header Bar */}
        <div
          onClick={() => setIsCardExpanded(!isCardExpanded)}
          className="flex items-center justify-between px-3 py-2 bg-[#131720] hover:bg-[#181d28] cursor-pointer transition-colors select-none border-b border-[#1f242e]"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
            {/* Main Icon */}
            <div className="w-5 h-5 rounded flex items-center justify-center bg-sky-950/70 border border-sky-800/50 text-sky-300 shrink-0">
              {parsed.isFetch ? (
                <Globe className="w-3.5 h-3.5" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
            </div>

            {/* Type Badge */}
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-950/60 text-sky-300 border border-sky-800/50 shrink-0">
              {parsed.isFetch ? 'WebFetch' : 'WebSearch'}
            </span>

            {/* Domain Pill */}
            {parsed.domain && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-sky-200 border border-zinc-700/60 shrink-0">
                {parsed.domain}
              </span>
            )}

            {/* Target Address / Query Title */}
            <span
              className="text-zinc-200 font-mono text-[11px] truncate flex-1"
              title={parsed.target}
            >
              {parsed.target}
            </span>
          </div>

          {/* Right Status & Actions */}
          <div className="flex items-center gap-2 shrink-0 ml-1">
            {/* Line Count / Size Pill */}
            {parsed.charCount > 0 && !isRunning && (
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 text-zinc-400 border border-zinc-800">
                {parsed.lineCount} 行 • {parsed.byteSizeStr}
              </span>
            )}

            {/* Status Indicator */}
            {isRunning ? (
              <span className="flex items-center gap-1 text-sky-400 font-mono text-[10px]">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="hidden sm:inline">请求中...</span>
              </span>
            ) : isError ? (
              <span className="flex items-center gap-1 text-rose-400 font-mono text-[10px]">
                <AlertCircle className="w-3 h-3" />
                <span className="hidden sm:inline">失败</span>
              </span>
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            )}

            {/* View Full Modal Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsModalOpen(true)
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-950/60 hover:bg-sky-900/80 border border-sky-800/50 text-sky-300 text-[10px] font-mono transition-colors cursor-pointer"
              title="在独立弹窗查看详情 (Open full inspection modal)"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              <span>查看详情</span>
            </button>

            {/* Accordion Chevron */}
            <button
              type="button"
              className="text-zinc-500 hover:text-zinc-300 p-0.5"
            >
              {isCardExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Inline Expanded Card Body */}
        {isCardExpanded && (
          <div className="p-3 bg-[#0a0c10] border-t border-[#1a1f29] space-y-2.5">
            {/* Target URL / Query Block */}
            <div className="rounded border border-[#1f242e] bg-[#12151b] p-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1 font-mono text-[11px]">
                <span className="text-zinc-500 shrink-0">
                  {parsed.isFetch ? 'URL:' : 'QUERY:'}
                </span>
                <span className="text-zinc-200 truncate select-all" title={parsed.target}>
                  {parsed.target}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {isUrl && (
                  <a
                    href={parsed.target}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="p-1 text-sky-400 hover:text-sky-300 rounded hover:bg-zinc-800 transition-colors"
                    title="在浏览器中打开网址"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleCopyTarget}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
                  title="复制目标地址/查询词"
                >
                  {copiedTarget ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Result Content Preview */}
            <div className="rounded border border-[#1f242e] bg-[#090b0e] overflow-hidden">
              <div className="flex items-center justify-between px-2.5 py-1 bg-[#12151b] border-b border-[#1b2029] text-[10px] text-zinc-400 font-mono">
                <span className="font-semibold text-zinc-300">
                  响应内容预览 (Result Preview)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyBody}
                    className="flex items-center gap-1 hover:text-zinc-200 transition-colors"
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
                </div>
              </div>

              {isRunning ? (
                <div className="flex items-center justify-center py-6 text-zinc-500 gap-2 font-mono text-[11px]">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                  <span>抓取中...</span>
                </div>
              ) : isError ? (
                <div className="p-2.5 text-rose-300 bg-rose-950/20 font-mono text-[11px] whitespace-pre-wrap">
                  {parsed.rawOutput || '请求发生错误 (Request failed)'}
                </div>
              ) : (
                <pre className="p-2.5 text-zinc-300 font-mono text-[11px] leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap break-all select-text">
                  {parsed.cleanOutput || '(无响应内容 / Empty response)'}
                </pre>
              )}

              {/* Bottom full inspection trigger button */}
              <div className="px-2.5 py-1.5 bg-[#0f1217] border-t border-[#1b2029] flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-sky-400 hover:text-sky-300 transition-colors"
                >
                  <FileText className="w-3 h-3" />
                  <span>打开悬浮弹窗查看完整内容 (Open Full Modal)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Inspection Modal */}
      <WebSearchModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        toolName={part.tool || 'web'}
        isFetch={parsed.isFetch}
        target={parsed.target}
        domain={parsed.domain}
        status={status}
        isLive={isLive}
        cleanOutput={parsed.cleanOutput}
        rawOutput={parsed.rawOutput}
        lineCount={parsed.lineCount}
        charCount={parsed.charCount}
        byteSizeStr={parsed.byteSizeStr}
      />
    </>
  )
}
