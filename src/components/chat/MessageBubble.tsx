import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import {
  User,
  Copy,
  Check,
  RotateCcw,
  Clock,
  Coins,
  Cpu,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Undo2,
  Sparkles,
  AlertTriangle,
  AlertCircle,
  Loader2,
  FileCode,
} from 'lucide-react'
import type { Message, TextPart, ReasoningPart, ToolPart, FilePart, MessagePart } from '../../types/opencode'
import { extractRelayErrorMessage } from '../../services/api'
import { ToolCard } from './ToolCard'
import { ToolBatchCard } from './ToolBatchCard'
import { ReasoningCard } from './ReasoningCard'
import { WorkedSummaryCard } from './WorkedSummaryCard'
import { partitionAssistantTurn } from '../../utils/worked-summary'
import { usePreferences } from '../../utils/preferences'
import { useI18n, tr } from '../../utils/i18n'
import { evaluatePromptCollapsing } from './quick-jump'
import { useDiffDrawer, editItemsToTurnFiles } from '../diff/DiffDrawerContext'

interface MessageBubbleProps {
  message: Message
  allMessageIds?: string[]
  onRetry?: () => void
  isZenMode?: boolean
  onRevertToMessage?: (messageId: string) => void
  isRevertPoint?: boolean
  isReverted?: boolean
  isBusy?: boolean
  isReverting?: boolean
}


function formatTokens(n: number | undefined): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

function getAgentBadge(agent?: string) {
  const name = (agent || '').toLowerCase()
  if (name.includes('sisyphus')) {
    return {
      bg: 'bg-purple-950/80 text-purple-300 border-purple-700/60',
      initial: 'S',
      label: agent || 'Sisyphus',
      accent: 'border-l-purple-500',
    }
  }
  if (name.includes('atlas')) {
    return {
      bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
      initial: 'A',
      label: agent || 'Atlas',
      accent: 'border-l-emerald-500',
    }
  }
  if (name.includes('build')) {
    return {
      bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
      initial: 'B',
      label: agent || 'build',
      accent: 'border-l-emerald-500',
    }
  }
  if (name.includes('plan')) {
    return {
      bg: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
      initial: 'P',
      label: agent || 'plan',
      accent: 'border-l-amber-500',
    }
  }
  if (name.includes('scout')) {
    return {
      bg: 'bg-blue-950/80 text-blue-300 border-blue-700/60',
      initial: 'S',
      label: agent || 'scout',
      accent: 'border-l-blue-500',
    }
  }
  if (name.includes('compaction')) {
    return {
      bg: 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60',
      initial: 'C',
      label: 'Compaction Engine',
      accent: 'border-l-cyan-500',
    }
  }
  if (name.includes('prometheus')) {
    return {
      bg: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
      initial: 'P',
      label: agent || 'Prometheus',
      accent: 'border-l-amber-500',
    }
  }
  return {
    bg: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    initial: (agent?.charAt(0) || 'B').toUpperCase(),
    label: agent || 'build',
    accent: 'border-l-orange-500',
  }
}

function openImagePreview(url: string) {
  if (url.startsWith('data:')) {
    const newTab = window.open()
    if (newTab) {
      newTab.document.write(
        `<!DOCTYPE html><html><head><title>Image Preview</title><style>body{margin:0;background:#0d0f12;display:flex;align-items:center;justify-content:center;min-height:100vh;}img{max-width:98vw;max-height:98vh;object-fit:contain;border-radius:4px;}</style></head><body><img src="${url}" /></body></html>`
      )
      newTab.document.close()
    }
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

interface ContentSegment {
  type: 'text' | 'think'
  content: string
}

function parseThinkingFromText(rawText: string): ContentSegment[] {
  if (!rawText.includes('<think>') && !rawText.includes('</think>')) {
    return [{ type: 'text', content: rawText }]
  }

  const regex = /<think>([\s\S]*?)(?:<\/think>|$)/gi
  const segments: ContentSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      const before = rawText.slice(lastIndex, match.index)
      if (before.trim()) {
        segments.push({ type: 'text', content: before })
      }
    }
    const thinkContent = match[1]
    if (thinkContent.trim() || rawText.includes('<think>')) {
      segments.push({ type: 'think', content: thinkContent })
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < rawText.length) {
    const after = rawText.slice(lastIndex)
    if (after.trim()) {
      segments.push({ type: 'text', content: after })
    }
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: rawText }]
}

function createMarkdownComponents(isZenMode?: boolean) {
  return {
    table: ({ children, ...props }: any) => (
      <div className="my-3.5 overflow-x-auto rounded-lg border border-[#272b33] bg-[#111317] shadow-sm">
        <table className="w-full border-collapse text-left text-xs sm:text-sm text-zinc-200" {...props}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }: any) => (
      <thead className="bg-[#171a21] border-b border-[#272b33] text-zinc-200 font-semibold tracking-wide" {...props}>
        {children}
      </thead>
    ),
    tbody: ({ children, ...props }: any) => (
      <tbody className="divide-y divide-[#1f232b]" {...props}>
        {children}
      </tbody>
    ),
    tr: ({ children, ...props }: any) => (
      <tr className="hover:bg-[#161922] transition-colors odd:bg-transparent even:bg-[#13161c]/60" {...props}>
        {children}
      </tr>
    ),
    th: ({ children, ...props }: any) => (
      <th className="px-3.5 py-2.5 text-xs font-semibold text-zinc-200 border-r border-[#272b33] last:border-r-0 whitespace-nowrap tracking-wide" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }: any) => (
      <td className="px-3.5 py-2 text-xs text-zinc-300 border-r border-[#1f232b] last:border-r-0 leading-relaxed font-normal" {...props}>
        {children}
      </td>
    ),
    h1: ({ children, ...props }: any) => (
      <h1 className="text-base sm:text-lg font-bold text-zinc-100 mt-4 mb-2 pb-1 border-b border-zinc-800" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }: any) => (
      <h2 className="text-sm sm:text-base font-semibold text-zinc-100 mt-3.5 mb-1.5 pb-0.5 border-b border-zinc-800/60" {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: any) => (
      <h3 className="text-xs sm:text-sm font-semibold text-zinc-200 mt-2.5 mb-1" {...props}>
        {children}
      </h3>
    ),
    p: ({ children, ...props }: any) => (
      <p className="my-2 leading-relaxed text-zinc-200" {...props}>
        {children}
      </p>
    ),
    ul: ({ children, ...props }: any) => (
      <ul className="my-2 ml-4 list-disc space-y-1 text-zinc-300 text-xs sm:text-sm" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: any) => (
      <ol className="my-2 ml-4 list-decimal space-y-1 text-zinc-300 text-xs sm:text-sm" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }: any) => (
      <li className="leading-relaxed" {...props}>
        {children}
      </li>
    ),
    hr: ({ ...props }: any) => (
      <hr className="my-3 border-t border-zinc-800" {...props} />
    ),
    blockquote: ({ children, ...props }: any) => (
      <blockquote className="my-2.5 pl-3 border-l-2 border-purple-500/70 text-zinc-400 italic bg-purple-950/15 py-1 rounded-r text-xs sm:text-sm" {...props}>
        {children}
      </blockquote>
    ),
    pre: ({ ...props }: any) => (
      <div className="relative my-2 rounded-md bg-[#0a0b0d] border border-[#272a30] overflow-hidden">
        <pre
          className={`overflow-x-auto font-mono text-zinc-300 ${
            isZenMode ? 'p-4 text-xs sm:text-sm leading-relaxed' : 'p-3 text-xs'
          }`}
          {...props}
        />
      </div>
    ),
    code: ({ className, children, ...props }: any) => {
      const isInline = !className
      return isInline ? (
        <code
          className={`bg-[#1c2028] text-[#e6edf3] border border-[#2d3340] px-1.5 py-0.5 rounded font-mono ${
            isZenMode ? 'text-xs sm:text-[13px]' : 'text-[11px] sm:text-xs'
          }`}
          {...props}
        >
          {children}
        </code>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      )
    },
    a: ({ href, children }: any) => {
      const isSessionLink =
        Boolean(href) &&
        (href!.startsWith('/?session=') ||
          href!.startsWith('?session=') ||
          (href!.includes('5173') && href!.includes('session=')))

      if (isSessionLink && href) {
        let sessId = ''
        try {
          const parsed = new URL(href, window.location.origin)
          sessId = parsed.searchParams.get('session') || ''
        } catch {
          const match = href.match(/[?&]session=([^&#]+)/)
          if (match) sessId = match[1]
        }

        if (sessId) {
          return (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                window.dispatchEvent(
                  new CustomEvent('switch-session', { detail: { sessionID: sessId } })
                )
                try {
                  window.history.pushState(null, '', `/?session=${sessId}`)
                  if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur()
                  }
                  window.focus()
                } catch {}
              }}
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2 cursor-pointer font-medium"
              title={tr('点击立即切换至该会话', 'Click to switch to this session', 'Klicken, um zu dieser Sitzung zu wechseln')}
            >
              {children}
            </a>
          )
        }
      }

      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
        >
          {children}
        </a>
      )
    },
  }
}

type RenderItem =
  | { type: 'single'; part: MessagePart }
  | { type: 'tool-batch'; tools: ToolPart[] }

function groupMessageParts(parts: MessagePart[], collapseToolBatch: boolean): RenderItem[] {
  if (!collapseToolBatch) {
    return parts.map((p) => ({ type: 'single', part: p }))
  }

  const items: RenderItem[] = []
  let currentTools: ToolPart[] = []

  const flushTools = () => {
    if (currentTools.length >= 2) {
      items.push({ type: 'tool-batch', tools: currentTools })
    } else {
      currentTools.forEach((t) => items.push({ type: 'single', part: t }))
    }
    currentTools = []
  }

  for (const part of parts) {
    if (part.type === 'tool') {
      currentTools.push(part as ToolPart)
    } else {
      if (currentTools.length > 0) {
        flushTools()
      }
      items.push({ type: 'single', part })
    }
  }

  if (currentTools.length > 0) {
    flushTools()
  }

  return items
}

interface UserMessageBubbleProps {
  message: Message
  fullText: string
  agentName?: string
  modelName?: string
  isZenMode?: boolean
  autoCollapsePrompt: boolean
  promptCharThreshold: number
  promptLineThreshold: number
  onRevertToMessage?: (messageId: string) => void
  isRevertPoint?: boolean
  isReverted?: boolean
  isBusy?: boolean
  isReverting?: boolean
}

function UserMessageBubble({
  message,
  fullText,
  agentName,
  modelName,
  isZenMode,
  autoCollapsePrompt,
  promptCharThreshold,
  promptLineThreshold,
  onRevertToMessage,
  isRevertPoint,
  isReverted,
  isBusy,
  isReverting,
}: UserMessageBubbleProps) {
  const { t, tr } = useI18n()
  const [copied, setCopied] = useState(false)

  const { lineCount, charCount, isCollapsible, defaultCollapsed } = useMemo(
    () =>
      evaluatePromptCollapsing(fullText, {
        autoCollapsePrompt,
        promptCharThreshold,
        promptLineThreshold,
      }),
    [fullText, autoCollapsePrompt, promptCharThreshold, promptLineThreshold]
  )

  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed)

  const handleCopy = () => {
    navigator.clipboard.writeText(fullText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1000)
  }

  const createdTime = message.info.time?.created
  const formattedTime = createdTime
    ? new Date(createdTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : ''

  return (
    <div
      data-message-role="user"
      data-prompt-preview={fullText.slice(0, 80)}
      data-message-id={message.info.id}
      id={`msg_${message.info.id}`}
      className="w-full my-4"
    >
      <div
        className={`w-full bg-[#181a20] border border-[#2d313a] rounded-xl px-4.5 py-3.5 text-zinc-100 shadow-sm transition-all ${
          isZenMode
            ? 'text-[15px] leading-relaxed py-4 px-5 bg-[#1a1d24] border-[#343b46] shadow-md'
            : 'text-sm'
        }`}
      >
        {/* User message header: shows prompt target binding & metrics */}
        <div className="flex items-center justify-between gap-3 mb-2 text-[11px] text-zinc-400 pb-2 border-b border-[#252830]">
          <div className="flex items-center gap-1.5 font-medium text-zinc-300">
            <User className="w-3.5 h-3.5 text-zinc-400" />
            <span>You</span>
            {isReverted && (
              <span className="px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700 text-[9px] font-mono text-zinc-400">
                {t.chat.revertedBadge}
              </span>
            )}
            {(agentName || modelName) && (
              <span className="flex items-center gap-1 text-[10px] text-zinc-500 ml-1">
                <ArrowRight className="w-2.5 h-2.5" />
                <span className="text-zinc-400 font-mono">
                  {agentName || 'Default'}
                  {modelName ? ` (${modelName})` : ''}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isCollapsible && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-purple-300 hover:text-purple-200 bg-purple-950/40 hover:bg-purple-950/70 border border-purple-800/40 transition-colors"
                title={isExpanded ? tr('收起提问内容', 'Collapse prompt', 'Prompt einklappen') : tr('展开提问内容', 'Expand prompt', 'Prompt ausklappen')}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3 text-purple-400" />
                    <span>{tr('收起', 'Collapse', 'Einklappen')}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3 text-purple-400" />
                    <span>{tr('展开', 'Expand', 'Ausklappen')}</span>
                  </>
                )}
              </button>
            )}
            {isCollapsible && (
              <span className="text-[10px] text-zinc-500 font-mono">
                {lineCount} {tr('行', 'lines', 'Zeilen')} · {charCount.toLocaleString()} {tr('字', 'chars', 'Zeichen')}
              </span>
            )}
            {onRevertToMessage && (
              <button
                onClick={() => onRevertToMessage(message.info.id)}
                disabled={isBusy || isReverting}
                className="hover:text-zinc-200 text-zinc-400 hover:bg-zinc-800 transition-colors p-0.5 rounded disabled:opacity-40"
                title={t.chat.undoUpToThisPoint}
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={handleCopy}
              className="hover:text-zinc-200 transition-colors p-0.5 rounded hover:bg-zinc-800"
              title={tr('复制提示词', 'Copy prompt', 'Prompt kopieren')}
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Attached Images */}
        {message.parts
          .filter((p) => p.type === 'file')
          .map((part) => {
            const filePart = part as FilePart
            return (
              <div
                key={filePart.id}
                className="my-2 rounded-lg overflow-hidden border border-zinc-700 bg-zinc-950 max-w-sm"
              >
                <img
                  src={filePart.url}
                  alt={filePart.filename || 'Attached image'}
                  className="w-full max-h-72 object-contain cursor-pointer hover:opacity-95 transition-opacity"
                  onClick={() => openImagePreview(filePart.url)}
                />
                {filePart.filename && (
                  <div className="px-2 py-1 text-[10px] text-zinc-400 bg-zinc-900 border-t border-zinc-800 truncate">
                    {filePart.filename}
                  </div>
                )}
              </div>
            )
          })}

        {/* Prompt Text with Auto-Collapse */}
        {fullText && (
          <div className="relative">
            <div
              className={`whitespace-pre-wrap leading-relaxed text-zinc-200 transition-all ${
                isCollapsible && !isExpanded ? 'max-h-24 overflow-hidden' : ''
              }`}
            >
              {fullText}
            </div>

            {/* Bottom gradient fade mask when collapsed */}
            {isCollapsible && !isExpanded && (
              <div
                onClick={() => setIsExpanded(true)}
                className={`absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t ${
                  isZenMode
                    ? 'from-[#1e2229] via-[#1e2229]/90'
                    : 'from-[#1d2127] via-[#1d2127]/90'
                } to-transparent cursor-pointer flex items-end justify-center pb-0.5`}
                title={tr('点击展开完整提示词', 'Click to expand full prompt', 'Klicken, um vollständigen Prompt anzuzeigen')}
              />
            )}

            {/* Expand / Collapse Toggle Bar */}
            {isCollapsible && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`w-full mt-2 pt-1 flex items-center justify-center gap-1.5 text-[11px] font-medium transition-all select-none rounded border ${
                  isExpanded
                    ? 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/30 hover:bg-zinc-800/60 py-1 border-zinc-800'
                    : 'text-purple-300 hover:text-purple-100 bg-purple-950/30 hover:bg-purple-950/50 py-1 border-purple-900/40 shadow-sm'
                }`}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{tr('收起完整提示词', 'Collapse full prompt', 'Vollständigen Prompt einklappen')}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5 text-purple-400" />
                    <span>
                      {tr('展开完整提示词', 'Expand full prompt', 'Vollständigen Prompt anzeigen')}{' '}
                      <span className="font-mono text-[10px] opacity-80">
                        ({lineCount} {tr('行', 'lines', 'Zeilen')} / {charCount.toLocaleString()} {tr('字', 'chars', 'Zeichen')})
                      </span>
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* User Message Footer (Matches official OpenCode screenshot): Timestamp + Copy + Native Revert */}
        <div className="flex items-center justify-end gap-1.5 mt-2.5 pt-1 text-[11px] text-zinc-400 select-none border-t border-zinc-800/40">
          {formattedTime && (
            <span className="text-[10px] text-zinc-400/80 font-mono tracking-tight mr-1">
              {formattedTime}
            </span>
          )}
          <button
            onClick={handleCopy}
            className="hover:text-zinc-200 transition-colors p-1 rounded hover:bg-zinc-800 text-zinc-400"
            title={tr('复制', 'Copy', 'Kopieren')}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {onRevertToMessage && (
            <button
              onClick={() => onRevertToMessage(message.info.id)}
              disabled={isBusy || isReverting || isReverted}
              className={`p-1 rounded transition-all group/undo relative ${
                isBusy || isReverting || isReverted
                  ? 'opacity-30 cursor-not-allowed text-zinc-600'
                  : 'text-zinc-400 hover:text-amber-300 hover:bg-amber-950/50'
              }`}
              title={t.chat.undoUpToThisPoint}
              aria-label={t.chat.undoUpToThisPoint}
            >
              {isReverting ? (
                <RotateCcw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <Undo2 className="w-3.5 h-3.5 transition-transform group-hover/undo:-rotate-12" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Checkpoint Divider if this message is the revert boundary */}
      {isRevertPoint && (
        <div className="w-full max-w-2xl flex items-center gap-2 my-3 select-none text-[11px] text-amber-400/80 font-mono">
          <div className="h-px bg-amber-500/30 flex-1" />
          <span className="flex items-center gap-1.5 bg-amber-950/60 border border-amber-800/50 px-2.5 py-0.5 rounded-full text-amber-300 shadow-sm">
            <RotateCcw className="w-3 h-3 text-amber-400" />
            {t.chat.revertDivider}
          </span>
          <div className="h-px bg-amber-500/30 flex-1" />
        </div>
      )}
    </div>
  )
}

export function MessageBubble({
  message,
  allMessageIds,
  onRetry,
  isZenMode,
  onRevertToMessage,
  isRevertPoint,
  isReverted,
  isBusy,
  isReverting,
}: MessageBubbleProps) {
  const { prefs } = usePreferences()
  const { t, tr } = useI18n()
  const { openTurn: openDiffTurn } = useDiffDrawer()
  const [copied, setCopied] = useState(false)
  const [isReportExpanded, setIsReportExpanded] = useState(true)
  const isUser = message.info.role === 'user'

  const turn = useMemo(
    () => partitionAssistantTurn(message.parts, message.info, Date.now(), isBusy),
    [message.parts, message.info, isBusy]
  )

  const answerFullText = useMemo(
    () => turn.answerParts.map((p) => p.text).join('\n\n'),
    [turn.answerParts]
  )
  const answerCharCount = answerFullText.length
  const answerLineCount = answerFullText ? answerFullText.split('\n').length : 0
  const isAnswerCollapsible =
    (answerCharCount > 360 || answerLineCount > 6) && !turn.isLive

  const markdownComponents = useMemo(
    () => createMarkdownComponents(isZenMode),
    [isZenMode]
  )

  const rawTextParts = message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as TextPart).text)

  const fullText = (
    isUser ? Array.from(new Set(rawTextParts)) : rawTextParts
  ).join('\n\n')

  const handleCopy = () => {
    navigator.clipboard.writeText(fullText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Exact per-message agent attribution (resolving cross-validation feedback)
  const agentName = message.info.agent || message.info.mode || ''
  const modelName = message.info.modelID || message.info.model?.modelID || ''
  const providerName = message.info.providerID || message.info.model?.providerID || ''
  const badge = getAgentBadge(agentName)

  // Duration metrics if timestamps exist
  let durationStr = ''
  if (message.info.time.created && message.info.time.completed) {
    const diff = (message.info.time.completed - message.info.time.created) / 1000
    if (diff > 0) {
      durationStr = `${diff.toFixed(1)}s`
    }
  }

  const tokens = message.info.tokens
  const errorMessage = message.info.error ? extractRelayErrorMessage(message.info.error) : null
  const editGroups = turn.groups.filter((g): g is { kind: 'edit'; item: any } => g.kind === 'edit')
  const hasEdits = editGroups.length > 0

  if (isUser) {
    return (
      <UserMessageBubble
        message={message}
        fullText={fullText}
        agentName={agentName}
        modelName={modelName}
        isZenMode={isZenMode}
        autoCollapsePrompt={prefs.autoCollapsePrompt}
        promptCharThreshold={prefs.promptCharThreshold}
        promptLineThreshold={prefs.promptLineThreshold}
        onRevertToMessage={onRevertToMessage}
        isRevertPoint={isRevertPoint}
        isReverted={isReverted}
        isBusy={isBusy}
        isReverting={isReverting}
      />
    )
  }

  return (
    <div
      data-message-role="assistant"
      data-message-id={message.info.id}
      id={`msg_${message.info.id}`}
      className={`w-full my-4 ${isZenMode ? 'my-6' : ''}`}
    >
      {allMessageIds &&
        allMessageIds
          .filter((id) => id !== message.info.id)
          .map((id) => (
            <span key={id} id={`msg_${id}`} data-message-id={id} className="sr-only" />
          ))}
      <div
        className={`w-full border border-[#2d313a] rounded-xl shadow-sm transition-all ${
          isZenMode
            ? 'p-5 sm:p-6 rounded-2xl bg-[#12151a]/85 border-[#343b46] shadow-md'
            : 'p-4 sm:p-5 bg-[#121417]/70'
        }`}
      >
        {/* Assistant Header: Per-message actual author & model badges */}
        <div className="flex flex-wrap items-center justify-between pb-2.5 mb-3 border-b border-[#1f2228] text-xs text-zinc-400 gap-2">
          {/* Left: Real Author Agent & Model Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Agent Badge */}
            <div
              className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold border ${badge.bg}`}
              title={`Agent: ${badge.label}`}
            >
              {badge.initial}
            </div>
            <span className="font-semibold text-zinc-200">{badge.label}</span>
            {isReverted && (
              <span className="px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700 text-[9px] font-mono text-zinc-400">
                {t.chat.revertedBadge}
              </span>
            )}

            {/* Model Pill */}
            {modelName && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-300 border border-zinc-700/60"
                title={`Provider: ${providerName || 'default'} | Model: ${modelName}`}
              >
                <Cpu className="w-2.5 h-2.5 text-purple-400" />
                <span>{modelName}</span>
                {providerName && (
                  <span className="text-zinc-500 text-[9px]">({providerName})</span>
                )}
              </span>
            )}

            {/* Duration Tag (Only shown if no Worked bar is rendered) */}
            {!turn.hasWork && durationStr && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 text-[10px] font-mono text-zinc-400 border border-zinc-800"
                title="Response elapsed time"
              >
                <Clock className="w-2.5 h-2.5 text-zinc-500" />
                <span>{durationStr}</span>
              </span>
            )}

            {/* Message Tokens Pill */}
            {tokens && (tokens.output > 0 || tokens.input > 0) && (
              <span
                className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 text-[10px] font-mono text-zinc-400 border border-zinc-800"
                title={`Input: ${tokens.input} | Output: ${tokens.output} | Reasoning: ${tokens.reasoning}`}
              >
                <Coins className="w-2.5 h-2.5 text-amber-500/80" />
                <span>
                  {formatTokens(tokens.output)} out
                  {tokens.reasoning > 0 ? ` (${formatTokens(tokens.reasoning)} r)` : ''}
                </span>
              </span>
            )}
          </div>

          {/* Right Action Controls: Diff, Retry & Copy */}
          <div className="flex items-center gap-2">
            {hasEdits && (
              <button
                type="button"
                onClick={() => {
                  const editItems = editGroups.map((g) => g.item)
                  const turnFiles = editItemsToTurnFiles(editItems, message.info.id)
                  openDiffTurn({
                    messageId: message.info.id,
                    title: 'For Turn',
                    turnBadge: agentName || undefined,
                    files: turnFiles,
                  })
                }}
                className="flex items-center gap-1 px-2 py-0.5 hover:bg-emerald-950/60 text-emerald-400 hover:text-emerald-200 rounded text-[11px] transition-colors border border-emerald-800/40 cursor-pointer"
                title={tr('在审查面板查看本轮文件差异', 'Review turn file diffs', 'Datei-Diffs dieser Runde prüfen')}
              >
                <FileCode className="w-3 h-3" />
                <span>Diff</span>
              </button>
            )}
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 px-2 py-0.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded text-[11px] transition-colors"
                title="Retry response"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            )}
            {fullText && (
              <button
                onClick={handleCopy}
                className="p-1 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
                title="Copy all text"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>

        {/* Message Parts Pipeline */}
        <div className={`space-y-3 leading-relaxed transition-all ${isZenMode ? 'text-[15px] text-zinc-100' : 'text-sm text-zinc-200'}`}>
          {turn.hasWork ? (
            <>
              {/* Top Antigravity-Style Collapsible Tool Calling & Thinking Bar */}
              <WorkedSummaryCard turn={turn} messageId={message.info.id} isBusy={isBusy} />

              {/* Assistant Attached Images */}
              {turn.fileParts.map((filePart) => (
                <div
                  key={filePart.id}
                  className="my-2 rounded-lg overflow-hidden border border-zinc-700 bg-zinc-950 max-w-sm"
                >
                  <img
                    src={filePart.url}
                    alt={filePart.filename || 'Assistant image'}
                    className="w-full max-h-72 object-contain cursor-pointer hover:opacity-95 transition-opacity"
                    onClick={() => openImagePreview(filePart.url)}
                  />
                  {filePart.filename && (
                    <div className="px-2 py-1 text-[10px] text-zinc-400 bg-zinc-900 border-t border-zinc-800 truncate">
                      {filePart.filename}
                    </div>
                  )}
                </div>
              ))}

              {/* Main Response Markdown Surface (Directly underneath the collapsed tools bar) */}
              {turn.answerParts.length > 0 && (
                <div className="mt-3 pt-2 border-t border-[#1f2228]/80">
                  {/* Model Response Header: Title + Collapse/Expand Badge matching User Prompt Style */}
                  <div className="flex items-center justify-between py-1 px-1 mb-2 text-xs text-zinc-400">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Sparkles className="w-3.5 h-3.5 text-orange-400/80 shrink-0" />
                      <span className="font-semibold text-zinc-300">
                        {tr('模型回答 / 汇报', 'Model Response / Report', 'Modellantwort / Bericht')}
                      </span>
                    </div>
                    {isAnswerCollapsible && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setIsReportExpanded(!isReportExpanded)}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-purple-300 hover:text-purple-200 bg-purple-950/40 hover:bg-purple-950/70 border border-purple-800/40 transition-colors"
                          title={isReportExpanded ? tr('收起回答 (露出一部分)', 'Collapse response (show partial)', 'Antwort einklappen (Teilansicht)') : tr('展开完整回答', 'Expand full response', 'Vollständige Antwort anzeigen')}
                        >
                          {isReportExpanded ? (
                            <>
                              <ChevronUp className="w-3 h-3 text-purple-400" />
                              <span>{tr('收起', 'Collapse', 'Einklappen')}</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3 text-purple-400" />
                              <span>{tr('展开', 'Expand', 'Ausklappen')}</span>
                            </>
                          )}
                        </button>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {answerLineCount} {tr('行', 'lines', 'Zeilen')} · {answerCharCount.toLocaleString()} {tr('字', 'chars', 'Zeichen')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Partial-reveal content container: shows top lines with bottom fade mask when collapsed */}
                  <div className="relative">
                    <div
                      className={`space-y-3 transition-all ${
                        isAnswerCollapsible && !isReportExpanded
                          ? isZenMode
                            ? 'max-h-36 overflow-hidden'
                            : 'max-h-32 overflow-hidden'
                          : ''
                      }`}
                    >
                      {turn.answerParts.map((part) => {
                        const text = part.text
                        if (!text.trim()) return null

                        return (
                          <div
                            key={part.id}
                            className={`prose prose-invert max-w-none transition-all ${
                              isZenMode
                                ? 'text-[15px] sm:text-base leading-relaxed text-zinc-100 prose-p:leading-relaxed prose-pre:my-3 prose-headings:text-zinc-100'
                                : 'text-sm text-zinc-200'
                            }`}
                          >
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              rehypePlugins={[rehypeHighlight]}
                              components={markdownComponents}
                            >
                              {text}
                            </ReactMarkdown>
                          </div>
                        )
                      })}
                    </div>

                    {/* Bottom gradient fade mask when collapsed - allows clicking to expand */}
                    {isAnswerCollapsible && !isReportExpanded && (
                      <div
                        onClick={() => setIsReportExpanded(true)}
                        className={`absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t ${
                          isZenMode
                            ? 'from-[#12151a] via-[#12151a]/90'
                            : 'from-[#121417] via-[#121417]/90'
                        } to-transparent cursor-pointer flex items-end justify-center pb-0.5`}
                        title={tr('点击展开完整回答', 'Click to expand full response', 'Klicken, um vollständige Antwort anzuzeigen')}
                      />
                    )}

                    {/* Expand / Collapse Toggle Bar at the bottom matching UserMessageBubble */}
                    {isAnswerCollapsible && (
                      <button
                        onClick={() => setIsReportExpanded(!isReportExpanded)}
                        className={`w-full mt-2 pt-1 flex items-center justify-center gap-1.5 text-[11px] font-medium transition-all select-none rounded border ${
                          isReportExpanded
                            ? 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/30 hover:bg-zinc-800/60 py-1 border-zinc-800'
                            : 'text-purple-300 hover:text-purple-100 bg-purple-950/30 hover:bg-purple-950/50 py-1 border-purple-900/40 shadow-sm'
                        }`}
                      >
                        {isReportExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                            <span>{tr('收起完整回答', 'Collapse full response', 'Vollständige Antwort einklappen')}</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5 text-purple-400" />
                            <span>
                              {tr('展开完整回答', 'Expand full response', 'Vollständige Antwort anzeigen')}{' '}
                              <span className="font-mono text-[10px] opacity-80">
                                ({answerLineCount} {tr('行', 'lines', 'Zeilen')} / {answerCharCount.toLocaleString()} {tr('字', 'chars', 'Zeichen')})
                              </span>
                            </span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            // Fallback for turns without any tools or reasoning
            <>
            {message.parts.length === 0 && !errorMessage && (
              (isBusy && turn.isLive) ? (
                <div className="flex items-center gap-2.5 py-4 px-4 rounded-lg bg-purple-950/20 border border-purple-800/30 text-purple-300 text-xs font-mono animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  <span>{tr('正在等待模型响应或工具执行...', 'Waiting for model response or tool execution...', 'Warten auf Modellantwort...')}</span>
                </div>
              ) : (
                <div className="flex items-start gap-3 py-3.5 px-4 rounded-lg bg-amber-950/20 border border-amber-800/40 text-amber-200 text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <div className="font-semibold text-amber-300">
                      {tr('未收到模型响应 (生成中断或已中止)', 'No response received (Generation interrupted or aborted)', 'Keine Antwort erhalten (abgebrochen)')}
                    </div>
                    <p className="text-zinc-400 text-[11px] leading-relaxed">
                      {tr(
                        '该轮次在输出内容前被中断（例如触发看门狗超时或后端重载）。您可以点击右上角或此处的“重试”按钮重新生成。',
                        'This turn was interrupted before producing content (e.g. timeout or daemon reload). You can click Retry to run again.',
                        'Diese Runde wurde vor der Ausgabe abgebrochen. Klicken Sie auf Wiederholen.'
                      )}
                    </p>
                  </div>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-medium transition-colors flex items-center gap-1 shrink-0 shadow-sm"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{tr('重试此轮', 'Retry Turn', 'Wiederholen')}</span>
                    </button>
                  )}
                </div>
              )
            )}
            {groupMessageParts(message.parts, prefs.collapseToolBatch).map((item, idx) => {
              if (item.type === 'tool-batch') {
                return <ToolBatchCard key={`batch_${idx}`} tools={item.tools} />
              }

              const part = item.part

              if (part.type === 'reasoning') {
                if (!prefs.showReasoning) return null
                return <ReasoningCard key={part.id} part={part as ReasoningPart} />
              }

              if (part.type === 'tool') {
                return <ToolCard key={part.id} part={part as ToolPart} />
              }

              if (part.type === 'file') {
                const filePart = part as FilePart
                return (
                  <div
                    key={filePart.id}
                    className="my-2 rounded-lg overflow-hidden border border-zinc-700 bg-zinc-950 max-w-sm"
                  >
                    <img
                      src={filePart.url}
                      alt={filePart.filename || 'Assistant image'}
                      className="w-full max-h-72 object-contain cursor-pointer hover:opacity-95 transition-opacity"
                      onClick={() => openImagePreview(filePart.url)}
                    />
                    {filePart.filename && (
                      <div className="px-2 py-1 text-[10px] text-zinc-400 bg-zinc-900 border-t border-zinc-800 truncate">
                        {filePart.filename}
                      </div>
                    )}
                  </div>
                )
              }

              if (part.type === 'text') {
                const text = (part as TextPart).text
                if (!text.trim()) return null

                const segments = parseThinkingFromText(text)

                return (
                  <div key={part.id} className="space-y-2">
                    {segments.map((seg, sIdx) => {
                      if (seg.type === 'think') {
                        if (!prefs.showReasoning) return null
                        return (
                          <ReasoningCard
                            key={`${part.id}_think_${sIdx}`}
                            title={tr('模型思考过程 (Thinking)', 'Model Thinking Process (Thinking)', 'Denkprozess des Modells (Thinking)')}
                            part={{
                              id: `${part.id}_think_${sIdx}`,
                              sessionID: part.sessionID,
                              messageID: part.messageID,
                              type: 'reasoning',
                              text: seg.content,
                            }}
                          />
                        )
                      }

                      if (!seg.content.trim()) return null

                      return (
                        <div
                          key={`${part.id}_seg_${sIdx}`}
                          className={`prose prose-invert max-w-none transition-all ${
                            isZenMode
                              ? 'text-[15px] sm:text-base leading-relaxed text-zinc-100 prose-p:leading-relaxed prose-pre:my-3 prose-headings:text-zinc-100'
                              : 'text-sm text-zinc-200'
                          }`}
                        >
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                            components={markdownComponents}
                          >
                            {seg.content}
                          </ReactMarkdown>
                        </div>
                      )
                    })}
                  </div>
                )
              }

              return null
            })}
            </>
          )}

          {/* Render Relay Error Callout inside Assistant Card */}
          {errorMessage && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-red-300 text-xs sm:text-sm font-mono flex items-start gap-3 shadow-inner">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <div className="font-semibold text-red-400 flex items-center justify-between">
                  <span>{tr('中转服务响应异常', 'Relay Response Error', 'Relay-Antwortfehler')}</span>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-[11px] font-medium rounded transition-colors flex items-center gap-1 shrink-0 shadow-sm"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{tr('重试此轮', 'Retry Turn', 'Wiederholen')}</span>
                    </button>
                  )}
                </div>
                <div className="text-zinc-300 break-words whitespace-pre-wrap font-sans text-xs select-text leading-relaxed">
                  {errorMessage}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
