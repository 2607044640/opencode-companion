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
} from 'lucide-react'
import type { Message, TextPart, ReasoningPart, ToolPart, FilePart, MessagePart } from '../../types/opencode'
import { ToolCard } from './ToolCard'
import { ToolBatchCard } from './ToolBatchCard'
import { ReasoningCard } from './ReasoningCard'
import { WorkedSummaryCard } from './WorkedSummaryCard'
import { partitionAssistantTurn } from '../../utils/worked-summary'
import { usePreferences } from '../../utils/preferences'
import { useI18n } from '../../utils/i18n'
import { evaluatePromptCollapsing } from './quick-jump'

interface MessageBubbleProps {
  message: Message
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
    initial: (agent?.charAt(0) || 'A').toUpperCase(),
    label: agent || 'OpenCode Agent',
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
          className={`bg-zinc-800/70 text-pink-400 px-1.5 py-0.5 rounded font-mono ${
            isZenMode ? 'text-xs sm:text-[13px]' : 'text-xs'
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
              title="点击立即切换至该会话"
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
  const { t } = useI18n()
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
      className={`flex flex-col items-end my-4 px-4 ${isZenMode ? 'sm:px-0' : ''}`}
    >
      <div
        className={`max-w-2xl bg-[#1d2127] border border-[#2d333b] rounded-xl px-4 py-3 text-zinc-100 shadow-sm transition-all ${
          isReverted
            ? 'opacity-40 pointer-events-none select-none filter grayscale-[35%]'
            : ''
        } ${
          isZenMode
            ? 'text-[15px] leading-relaxed py-3.5 px-5 bg-[#1e2229] border-[#343b44] shadow-md'
            : 'text-sm'
        }`}
      >
        {/* User message header: shows prompt target binding & metrics */}
        <div className="flex items-center justify-between gap-3 mb-1.5 text-[11px] text-zinc-400 pb-1.5 border-b border-zinc-800">
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
                title={isExpanded ? '收起提问内容' : '展开提问内容'}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3 text-purple-400" />
                    <span>收起</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3 text-purple-400" />
                    <span>展开</span>
                  </>
                )}
              </button>
            )}
            {isCollapsible && (
              <span className="text-[10px] text-zinc-500 font-mono">
                {lineCount} 行 · {charCount.toLocaleString()} 字
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
              title="复制提示词"
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
                title="点击展开完整提示词"
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
                    <span>收起完整提示词</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5 text-purple-400" />
                    <span>
                      展开完整提示词 <span className="font-mono text-[10px] opacity-80">({lineCount} 行 / {charCount.toLocaleString()} 字)</span>
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
            title="复制"
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
  onRetry,
  isZenMode,
  onRevertToMessage,
  isRevertPoint,
  isReverted,
  isBusy,
  isReverting,
}: MessageBubbleProps) {
  const { prefs } = usePreferences()
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const isUser = message.info.role === 'user'

  const turn = useMemo(
    () => partitionAssistantTurn(message.parts, message.info),
    [message.parts, message.info]
  )

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
    <div className={`my-5 px-4 ${isZenMode ? 'sm:px-0 my-6' : ''}`}>
      <div
        className={`max-w-4xl mx-auto border border-l-2 ${badge.accent} shadow-sm transition-all ${
          isReverted
            ? 'opacity-40 pointer-events-none select-none filter grayscale-[35%]'
            : ''
        } ${
          isZenMode
            ? 'p-5 sm:p-6 rounded-2xl bg-[#12151a]/85 border-[#282d36] shadow-md'
            : 'p-4 rounded-xl bg-[#121417]/70 border-[#22262c]'
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

          {/* Right Action Controls: Retry & Copy */}
          <div className="flex items-center gap-2">
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
              <WorkedSummaryCard turn={turn} messageId={message.info.id} />

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
            </>
          ) : (
            // Fallback for turns without any tools or reasoning
            groupMessageParts(message.parts, prefs.collapseToolBatch).map((item, idx) => {
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
                            title="模型思考过程 (Thinking)"
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
            })
          )}
        </div>
      </div>

      {/* Checkpoint Divider if this assistant message is the revert boundary */}
      {isRevertPoint && (
        <div className="max-w-4xl mx-auto flex items-center gap-2 my-3 select-none text-[11px] text-amber-400/80 font-mono">
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
