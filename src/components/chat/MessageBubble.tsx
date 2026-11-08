import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import {
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
import { extractRelayErrorMessage, isAbortError } from '../../services/api'
import { ToolCard } from './ToolCard'
import { ToolBatchCard } from './ToolBatchCard'
import { ReasoningCard } from './ReasoningCard'
import { WorkedSummaryCard } from './WorkedSummaryCard'
import { FileViewModal } from './FileViewModal'
import { partitionAssistantTurn, type ExploreItem } from '../../utils/worked-summary'
import { emptyAssistantChrome } from '../../utils/session-run-state'
import { usePreferences } from '../../utils/preferences'
import { useI18n, tr } from '../../utils/i18n'
import { evaluatePromptCollapsing } from './quick-jump'
import { useHalfLineClipper } from '../../utils/half-line-cut'
import {
  getDialogueExpandedState,
  setDialogueExpandedState,
} from '../../utils/dialogue-collapse-cache'
import { useDiffDrawer, editItemsToTurnFiles } from '../diff/DiffDrawerContext'
import { ImageLightboxModal, ImageThumbnailRow, type LightboxImage } from './ImageLightboxModal'
import { PastedSnippetCard } from './PastedSnippetCard'
import { PastedContentModal } from './PastedContentModal'
import { parsePastedSnippetsFromText, type ParsedPastedSnippet } from '../../utils/pasted-snippets'
import { cleanRawPath } from '../../utils/path-resolver'
import { findBestMatchingFileInGroups, normalizeFilePath } from '../../utils/file-matcher'

interface MessageBubbleProps {
  message: Message
  allMessageIds?: string[]
  onRetry?: () => void
  isZenMode?: boolean
  sessionDirectory?: string
  onRevertToMessage?: (messageId: string) => void
  isRevertPoint?: boolean
  isReverted?: boolean
  isBusy?: boolean
  isReverting?: boolean
  /** False until the daemon answers. Hide the finished duration and the live pill. */
  runKnown?: boolean
  /** True only when automatic recovery is exhausted (>5 attempts or fatal error). Suppresses inline error UI otherwise. */
  showTerminalError?: boolean
}


function formatTokens(n: number | undefined): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

export function getAgentBadge(agent?: string) {
  const name = (agent || '').toLowerCase()
  if (name.includes('sisyphus')) {
    return {
      bg: 'bg-zinc-800 text-zinc-200 border-zinc-700/60',
      initial: 'S',
      label: agent || 'Sisyphus',
      accent: 'border-l-sky-500',
    }
  }
  if (name.includes('atlas')) {
    return {
      bg: 'bg-zinc-800 text-zinc-200 border-zinc-700/60',
      initial: 'A',
      label: agent || 'Atlas',
      accent: 'border-l-sky-500',
    }
  }
  if (name.includes('build')) {
    return {
      bg: 'bg-zinc-800 text-zinc-200 border-zinc-700/60',
      initial: 'B',
      label: agent || 'build',
      accent: 'border-l-sky-500',
    }
  }
  if (name.includes('plan')) {
    return {
      bg: 'bg-zinc-800 text-zinc-200 border-zinc-700/60',
      initial: 'P',
      label: agent || 'plan',
      accent: 'border-l-sky-500',
    }
  }
  if (name.includes('scout')) {
    return {
      bg: 'bg-zinc-800 text-zinc-200 border-zinc-700/60',
      initial: 'S',
      label: agent || 'scout',
      accent: 'border-l-sky-500',
    }
  }
  if (name.includes('compaction')) {
    return {
      bg: 'bg-zinc-800 text-zinc-200 border-zinc-700/60',
      initial: 'C',
      label: 'Compaction Engine',
      accent: 'border-l-sky-500',
    }
  }
  if (name.includes('prometheus')) {
    return {
      bg: 'bg-zinc-800 text-zinc-200 border-zinc-700/60',
      initial: 'P',
      label: agent || 'Prometheus',
      accent: 'border-l-sky-500',
    }
  }
  return {
    bg: 'bg-zinc-800 text-zinc-200 border-zinc-700/60',
    initial: (agent?.charAt(0) || 'B').toUpperCase(),
    label: agent || 'build',
    accent: 'border-l-sky-500',
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

function extractFileTarget(href?: string, text?: string): string | null {
  const candidate = (href || '').trim()
  if (candidate && !candidate.startsWith('http://') && !candidate.startsWith('https://')) {
    const clean = candidate.replace(/^file:\/\/\/?/, '')
    const cleanNoAnchor = clean
      .replace(/#L\d+(?:-\d+)?$/i, '')
      .replace(/:\d+(?::\d+)?$/, '')
      .replace(/\(\d+(?:,\s*\d+)?\)$/, '')
    if (/\.(md|ts|tsx|js|jsx|json|cs|gd|py|rs|go|txt|yaml|yml|toml|css|html|sh|c|h|cpp|hpp|sql|env)$/i.test(cleanNoAnchor)) {
      return clean
    }
    if (/[/\\][a-zA-Z0-9_\-.]+\.[a-zA-Z0-9]+$/i.test(cleanNoAnchor)) {
      return clean
    }
  }
  if (text && (!candidate || !candidate.startsWith('http'))) {
    const cleanText = text.trim().replace(/^[`'"]+|[`'"]+$/g, '')
    const cleanTextNoAnchor = cleanText
      .replace(/#L\d+(?:-\d+)?$/i, '')
      .replace(/:\d+(?::\d+)?$/, '')
      .replace(/\(\d+(?:,\s*\d+)?\)$/, '')
    if (/\.(md|ts|tsx|js|jsx|json|cs|gd|py|rs|go|txt|yaml|yml|toml|css|html|sh|c|h|cpp|hpp|sql|env)$/i.test(cleanTextNoAnchor)) {
      return cleanText
    }
  }
  return null
}

function extractTextFromChildren(children: any): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (!children) return ''
  if (Array.isArray(children)) {
    return children.map(extractTextFromChildren).join('')
  }
  if (children.props && children.props.children) {
    return extractTextFromChildren(children.props.children)
  }
  return ''
}

interface MarkdownCodeBlockProps {
  children?: React.ReactNode
  isZenMode?: boolean
  node?: any
  [key: string]: any
}

function MarkdownCodeBlock({ children, isZenMode, node, ...props }: MarkdownCodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    let text = ''
    if (preRef.current) {
      text = preRef.current.innerText || preRef.current.textContent || ''
    } else {
      text = extractTextFromChildren(children)
    }

    if (!text) return

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch (err) {
      console.warn('Failed to copy code block content', err)
    }
  }, [children])

  // Detect code language if specified
  let language = ''
  if (children && typeof children === 'object' && 'props' in (children as any)) {
    const codeClassName = (children as any).props?.className || ''
    const match = /language-([a-zA-Z0-9_\-]+)/.exec(codeClassName)
    if (match) {
      language = match[1]
    }
  }

  return (
    <div className="group/code-block relative my-2.5 rounded-xl bg-[#161622] border border-[#242436] overflow-hidden shadow-sm">
      {/* Top right floating Copy button: automatically appears on hover or remains visible when copied */}
      <div
        className={`absolute top-2 right-2 z-10 flex items-center gap-1.5 transition-all duration-150 ${
          copied
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 group-hover/code-block:opacity-100 focus-within:opacity-100 pointer-events-none group-hover/code-block:pointer-events-auto focus-within:pointer-events-auto'
        }`}
      >
        <button
          type="button"
          onClick={handleCopy}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-sans text-xs transition-all duration-150 backdrop-blur-md cursor-pointer select-none shadow-sm ${
            copied
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'bg-zinc-800/85 hover:bg-zinc-700/95 text-zinc-300 hover:text-white border border-zinc-700/70 hover:border-zinc-500/80'
          }`}
          title={copied ? tr('已复制', 'Copied', 'Kopiert') : tr('复制代码/文本', 'Copy code/text', 'Code/Text kopieren')}
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] font-medium text-emerald-300">
                {tr('已复制', 'Copied', 'Kopiert')}
              </span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-zinc-400 group-hover/code-block:text-zinc-200 shrink-0" />
              <span className="text-[11px] font-medium text-zinc-300">
                {tr('复制', 'Copy', 'Kopieren')}
              </span>
            </>
          )}
        </button>
      </div>

      {language && (
        <div className="absolute top-2.5 left-3 pointer-events-none select-none text-[10px] font-mono font-medium text-zinc-500 uppercase tracking-wider">
          {language}
        </div>
      )}

      <pre
        ref={preRef}
        className={`overflow-x-auto font-mono text-zinc-300 ${
          language ? 'pt-7 ' : ''
        }${isZenMode ? 'p-4 text-xs sm:text-sm leading-relaxed' : 'p-3 text-xs'}`}
        {...props}
      >
        {children}
      </pre>
    </div>
  )
}

export function createMarkdownComponents(isZenMode?: boolean, onOpenFile?: (target: string) => void) {
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
      <blockquote className="my-2.5 pl-3 border-l-2 border-zinc-600 text-zinc-400 italic bg-zinc-900/40 py-1 rounded-r text-xs sm:text-sm" {...props}>
        {children}
      </blockquote>
    ),
    pre: ({ children, node, ...props }: any) => (
      <MarkdownCodeBlock isZenMode={isZenMode} node={node} {...props}>
        {children}
      </MarkdownCodeBlock>
    ),
    code: ({ className, children, ...props }: any) => {
      const isInline = !className
      const textContent = typeof children === 'string' ? children.trim() : ''
      const isFile = isInline && Boolean(onOpenFile) && Boolean(extractFileTarget(undefined, textContent))

      return isInline ? (
        <code
          onClick={
            isFile && onOpenFile
              ? (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onOpenFile(textContent)
                }
              : undefined
          }
          className={`bg-zinc-800/80 text-zinc-200 border border-zinc-700/60 px-1.5 py-0.5 rounded-md font-mono font-medium ${
            isFile
              ? 'cursor-pointer hover:bg-zinc-700/80 hover:text-cyan-300 hover:border-cyan-600/50 transition-colors'
              : ''
          } ${
            isZenMode ? 'text-xs sm:text-[13px]' : 'text-[11px] sm:text-xs'
          }`}
          title={
            isFile
              ? tr(
                  '点击在浮窗中查看文件',
                  'Click to view file in floating window',
                  'Klicken, um Datei im Fenster anzuzeigen'
                )
              : undefined
          }
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
          const standalone =
            typeof window !== 'undefined' &&
            (window.matchMedia('(display-mode: standalone)').matches ||
              window.matchMedia('(display-mode: window-controls-overlay)').matches)
          const jumpHref = `/jump?session=${encodeURIComponent(sessId)}`
          return (
            <a
              href={standalone ? `/?session=${encodeURIComponent(sessId)}` : jumpHref}
              target={standalone ? undefined : '_blank'}
              rel={standalone ? undefined : 'opener'}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!standalone) {
                  const popup = window.open(jumpHref, '_blank')
                  if (!popup) window.location.assign(jumpHref)
                  return
                }
                window.dispatchEvent(
                  new CustomEvent('switch-session', { detail: { sessionID: sessId } })
                )
                try {
                  window.history.pushState(null, '', `/?session=${encodeURIComponent(sessId)}`)
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

      // Check if it's a file link (opens FileViewModal floating UI)
      if (onOpenFile) {
        const fileTarget = extractFileTarget(href, typeof children === 'string' ? children : '')
        if (fileTarget) {
          return (
            <a
              href={href || fileTarget}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onOpenFile(fileTarget)
              }}
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 cursor-pointer font-medium transition-colors"
              title={tr('点击在浮窗中查看文件', 'Click to view file in floating window', 'Klicken, um Datei im Fenster anzuzeigen')}
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
  const [activePastedSnippet, setActivePastedSnippet] = useState<ParsedPastedSnippet | null>(null)

  const { snippets: pastedSnippets, cleanText: displayText } = useMemo(
    () => parsePastedSnippetsFromText(fullText),
    [fullText]
  )

  const { isCollapsible, defaultCollapsed } = useMemo(
    () =>
      evaluatePromptCollapsing(displayText, {
        autoCollapsePrompt,
        promptCharThreshold,
        promptLineThreshold,
      }),
    [displayText, autoCollapsePrompt, promptCharThreshold, promptLineThreshold]
  )

  const [isExpanded, setIsExpanded] = useState(() => {
    return getDialogueExpandedState(message.info.id, undefined, !defaultCollapsed)
  })

  const userClipper = useHalfLineClipper({
    targetLineIndex: 4,
    fallbackHeight: isZenMode ? 91 : 84,
    isCollapsed: isCollapsible && !isExpanded,
  })

  useEffect(() => {
    const handleExpandAll = () => {
      setIsExpanded(true)
      setDialogueExpandedState(message.info.id, true)
    }
    const handleCollapseAll = () => {
      if (isCollapsible) {
        setIsExpanded(false)
        setDialogueExpandedState(message.info.id, false)
      }
    }
    const handleToggle = (e: Event) => {
      const custom = e as CustomEvent<{ messageId?: string }>
      if (custom.detail?.messageId === message.info.id && isCollapsible) {
        setIsExpanded((prev) => {
          const next = !prev
          setDialogueExpandedState(message.info.id, next)
          return next
        })
      }
    }
    window.addEventListener('opencode-expand-all-dialogues', handleExpandAll)
    window.addEventListener('opencode-collapse-all-dialogues', handleCollapseAll)
    window.addEventListener('opencode-toggle-dialogue', handleToggle)
    return () => {
      window.removeEventListener('opencode-expand-all-dialogues', handleExpandAll)
      window.removeEventListener('opencode-collapse-all-dialogues', handleCollapseAll)
      window.removeEventListener('opencode-toggle-dialogue', handleToggle)
    }
  }, [isCollapsible, message.info.id])
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([])
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  const handleOpenLightbox = useCallback((images: LightboxImage[], index: number) => {
    setLightboxImages(images)
    setLightboxIndex(index)
    setIsLightboxOpen(true)
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(fullText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1000)
  }

  const createdTime = message.info.time?.created
  const formattedTime = createdTime
    ? new Date(createdTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : ''

  const fileParts = message.parts
    .filter((p) => p.type === 'file')
    .map((p) => p as FilePart)
  const promptPreviewText = fullText.trim()
    ? fullText
    : fileParts.length > 0
    ? `[${fileParts.length} ${tr('个附件/图片', 'attachments/images', 'Anhänge/Bilder')}]`
    : ''

  return (
    <div
      data-message-role="user"
      data-prompt-preview={promptPreviewText}
      data-created-time={createdTime || ''}
      data-message-id={message.info.id}
      data-collapsible={isCollapsible ? 'true' : 'false'}
      data-expanded={isExpanded ? 'true' : 'false'}
      id={`msg_${message.info.id}`}
      className="w-full my-3 flex flex-col items-end"
    >
      {/* User Message: Frameless style matching AI response, auto-sized, capped at ~2/3 width */}
      <div
        className={`w-fit max-w-[88%] sm:max-w-[75%] lg:max-w-[67%] text-zinc-100 transition-all break-words select-text ${
          isZenMode
            ? 'text-[15px] leading-relaxed py-1.5 px-0.5'
            : 'text-sm leading-relaxed py-1 px-0.5'
        }`}
      >
        {/* Attached Images (Square Thumbnails in a Row - matching Image 2 & 3) */}
        {(() => {
          const fileParts = message.parts
            .filter((p) => p.type === 'file')
            .map((p) => p as FilePart)
          if (fileParts.length === 0) return null
          return (
            <div className="mb-2">
              <ImageThumbnailRow
                images={fileParts}
                onOpenLightbox={(idx) => handleOpenLightbox(fileParts, idx)}
              />
            </div>
          )
        })()}

        {/* Pasted Text Snippet Cards (p1, p2 - Claude Web style) */}
        {pastedSnippets.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2 mb-2">
            {pastedSnippets.map((snippet) => (
              <PastedSnippetCard
                key={snippet.id}
                pastedId={snippet.pastedId}
                content={snippet.content}
                compact
                onClick={() => setActivePastedSnippet(snippet)}
              />
            ))}
          </div>
        )}

        {/* Prompt Text with Auto-Collapse & Right-Side Adaptive Long Button */}
        {displayText && (
          <div className="flex items-stretch gap-2 w-full">
            <div className="flex-1 min-w-0 relative">
              <div
                ref={userClipper.containerRef}
                style={{
                  maxHeight:
                    isCollapsible && !isExpanded
                      ? `${userClipper.effectiveHeight}px`
                      : undefined,
                }}
                onClick={
                  isCollapsible && !isExpanded
                    ? () => {
                        setIsExpanded(true)
                        setDialogueExpandedState(message.info.id, true)
                      }
                    : undefined
                }
                className={`whitespace-pre-wrap leading-relaxed text-zinc-100 transition-all ${
                  isCollapsible && !isExpanded ? 'overflow-hidden cursor-pointer' : ''
                }`}
                title={
                  isCollapsible && !isExpanded
                    ? tr('点击展开完整提示词', 'Click to expand full prompt', 'Klicken, um vollständigen Prompt anzuzeigen')
                    : undefined
                }
              >
                {displayText}
              </div>
            </div>

            {/* Right Side Vertical Strip Button for Human Inputs (User Messages) */}
            {isCollapsible && (
              <button
                type="button"
                onClick={() => {
                  setIsExpanded((prev) => {
                    const next = !prev
                    setDialogueExpandedState(message.info.id, next)
                    return next
                  })
                }}
                className="group/side-btn flex items-center justify-center w-3 hover:w-3.5 shrink-0 self-stretch rounded-full py-1 cursor-pointer select-none focus:outline-none transition-all"
                title={isExpanded ? tr('点击收起提示词', 'Click to collapse prompt', 'Prompt einklappen') : tr('点击展开完整提示词', 'Click to expand full prompt', 'Prompt ausklappen')}
                aria-label={isExpanded ? tr('收起提示词', 'Collapse prompt') : tr('展开提示词', 'Expand prompt')}
              >
                <div className="w-1.5 group-hover/side-btn:w-2.5 h-full rounded-full bg-zinc-800/60 group-hover/side-btn:bg-zinc-700/90 border border-zinc-700/40 group-hover/side-btn:border-zinc-500/70 transition-all duration-150 flex items-center justify-center shadow-sm">
                  {isExpanded ? (
                    <ChevronUp className="w-2.5 h-2.5 text-zinc-500 group-hover/side-btn:text-zinc-200 transition-colors" />
                  ) : (
                    <ChevronDown className="w-2.5 h-2.5 text-zinc-500 group-hover/side-btn:text-zinc-200 transition-colors" />
                  )}
                </div>
              </button>
            )}
          </div>
        )}
      </div>

      {/* User Message Footer (Matches official Antigravity screenshot): Target / Time / Copy / Undo */}
      <div className="flex items-center justify-end gap-2 mt-1.5 text-[11px] text-zinc-400 select-none pr-1">
        {isReverted && (
          <span className="px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700 text-[9px] font-mono text-zinc-400">
            {t.chat.revertedBadge}
          </span>
        )}

        {(agentName || modelName) && (
          <span
            className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono"
            title={`Agent: ${agentName || 'Default'}${modelName ? ` | Model: ${modelName}` : ''}`}
          >
            <ArrowRight className="w-2.5 h-2.5 text-zinc-500" />
            <span>{agentName || 'Default'}</span>
            {modelName && <span className="text-zinc-400">({modelName})</span>}
          </span>
        )}

        {formattedTime && (
          <span className="text-[10px] text-zinc-500 font-mono tracking-tight">
            {formattedTime}
          </span>
        )}

        <button
          type="button"
          onClick={handleCopy}
          className="hover:text-zinc-200 transition-colors p-1 rounded hover:bg-zinc-800 text-zinc-400 cursor-pointer"
          title={tr('复制提示词', 'Copy prompt', 'Prompt kopieren')}
          aria-label={tr('复制提示词', 'Copy prompt', 'Prompt kopieren')}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>

        {onRevertToMessage && (
          <button
            type="button"
            onClick={() => onRevertToMessage(message.info.id)}
            disabled={isBusy || isReverting || isReverted}
            className={`p-1 rounded transition-all group/undo relative cursor-pointer ${
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

      {/* Checkpoint Divider if this message is the revert boundary */}
      {isRevertPoint && (
        <div className="w-full self-center flex items-center gap-2 my-3 select-none text-[11px] text-amber-400/80 font-mono">
          <div className="h-px bg-amber-500/30 flex-1" />
          <span className="flex items-center gap-1.5 bg-amber-950/60 border border-amber-800/50 px-2.5 py-0.5 rounded-full text-amber-300 shadow-sm">
            <RotateCcw className="w-3 h-3 text-amber-400" />
            {t.chat.revertDivider}
          </span>
          <div className="h-px bg-amber-500/30 flex-1" />
        </div>
      )}

      {/* Lightbox Preview Modal (Image 3) */}
      {isLightboxOpen && (
        <ImageLightboxModal
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
          images={lightboxImages}
          initialIndex={lightboxIndex}
        />
      )}

      {/* Pasted Snippet Viewer Modal (Image 3 FileViewModal style) */}
      {activePastedSnippet && (
        <PastedContentModal
          isOpen={true}
          pastedId={activePastedSnippet.pastedId}
          content={activePastedSnippet.content}
          onClose={() => setActivePastedSnippet(null)}
        />
      )}
    </div>
  )
}

export function MessageBubble({
  message,
  allMessageIds,
  onRetry: _onRetry,
  isZenMode,
  sessionDirectory,
  onRevertToMessage,
  isRevertPoint,
  isReverted,
  isBusy,
  isReverting,
  runKnown = true,
  showTerminalError = false,
}: MessageBubbleProps) {
  const { prefs } = usePreferences()
  const { t, tr } = useI18n()
  const { openTurn: openDiffTurn } = useDiffDrawer()
  const [copied, setCopied] = useState(false)
  const autoCollapseResponse = prefs.autoCollapseResponse ?? true
  const [isReportExpanded, setIsReportExpanded] = useState(() => {
    return getDialogueExpandedState(message.info.id, allMessageIds, !autoCollapseResponse)
  })
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([])
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  const handleOpenLightbox = useCallback((images: LightboxImage[], index: number) => {
    setLightboxImages(images)
    setLightboxIndex(index)
    setIsLightboxOpen(true)
  }, [])
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
    (answerCharCount > 200 ||
      answerLineCount > 4 ||
      answerCharCount > prefs.promptCharThreshold ||
      answerLineCount > prefs.promptLineThreshold) &&
    !turn.isLive

  const assistantClipper = useHalfLineClipper({
    targetLineIndex: isZenMode ? 6 : 5,
    fallbackHeight: isZenMode ? 144 : 124,
    isCollapsed: isAnswerCollapsible && !isReportExpanded,
  })

  useEffect(() => {
    const handleExpandAll = () => {
      setIsReportExpanded(true)
      setDialogueExpandedState(message.info.id, true, allMessageIds)
    }
    const handleCollapseAll = () => {
      if (isAnswerCollapsible) {
        setIsReportExpanded(false)
        setDialogueExpandedState(message.info.id, false, allMessageIds)
      }
    }
    const handleToggle = (e: Event) => {
      const custom = e as CustomEvent<{ messageId?: string; allMessageIds?: string[] }>
      const targetId = custom.detail?.messageId
      const targetAll = custom.detail?.allMessageIds
      const isTarget =
        targetId === message.info.id ||
        (targetAll && targetAll.includes(message.info.id)) ||
        (allMessageIds && targetId && allMessageIds.includes(targetId))
      if (isTarget && isAnswerCollapsible) {
        setIsReportExpanded((prev) => {
          const next = !prev
          setDialogueExpandedState(message.info.id, next, allMessageIds)
          return next
        })
      }
    }
    window.addEventListener('opencode-expand-all-dialogues', handleExpandAll)
    window.addEventListener('opencode-collapse-all-dialogues', handleCollapseAll)
    window.addEventListener('opencode-toggle-dialogue', handleToggle)
    return () => {
      window.removeEventListener('opencode-expand-all-dialogues', handleExpandAll)
      window.removeEventListener('opencode-collapse-all-dialogues', handleCollapseAll)
      window.removeEventListener('opencode-toggle-dialogue', handleToggle)
    }
  }, [isAnswerCollapsible, message.info.id, allMessageIds])

  const [activeFileModalItem, setActiveFileModalItem] = useState<ExploreItem | null>(null)

  const handleOpenFileModal = useCallback((targetPath: string) => {
    // 1. Smart multi-source match against current turn groups (explore, edit, command)
    const match = findBestMatchingFileInGroups(targetPath, turn.groups)

    const resolvedPath = match.fullPath || normalizeFilePath(targetPath) || cleanRawPath(targetPath)

    const item: ExploreItem = {
      partId: `file_modal_${Date.now()}`,
      tool: 'read',
      pathOrQuery: targetPath,
      fullPath: resolvedPath,
      kind: 'file',
      status: 'completed',
      output: match.content,
    }

    setActiveFileModalItem(item)
  }, [turn.groups])

  const markdownComponents = useMemo(
    () => createMarkdownComponents(isZenMode, handleOpenFileModal),
    [isZenMode, handleOpenFileModal]
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
  const isAborted =
    message.info.finish === 'abort' ||
    isAbortError(message.info.error)
  const errorMessage =
    showTerminalError && !isAborted && message.info.error
      ? extractRelayErrorMessage(message.info.error)
      : null
  const editGroups = turn.groups.filter((g): g is { kind: 'edit'; item: any } => g.kind === 'edit')
  const hasEdits = editGroups.length > 0

  const isExplicitlyDone =
    Boolean(message.info.time.completed) ||
    Boolean(message.info.finish) ||
    Boolean(message.info.error)

  // Empty shell: confirming / loading / thinking / interrupted.
  // Interrupted needs a terminal signal. Age is not a signal — daemon
  // time.created is seconds, so comparing it to Date.now() is always stale.
  const emptyChrome =
    message.parts.length === 0
      ? emptyAssistantChrome({
          runKnown,
          isBusy: Boolean(isBusy),
          isLive: turn.isLive,
          explicitlyDone: isExplicitlyDone,
        })
      : null

  const isTurnGenerating = runKnown && (isBusy || turn.isLive)

  // OpenCode official SSOT alignment:
  // If an assistant message has no parts, no relay error, and is explicitly completed,
  // do not render an empty bubble or false interrupted warning (matches official OpenCode).
  if (
    !isUser &&
    message.parts.length === 0 &&
    !errorMessage &&
    !isTurnGenerating &&
    !isBusy &&
    isExplicitlyDone
  ) {
    return null
  }

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
      data-collapsible={isAnswerCollapsible ? 'true' : 'false'}
      data-expanded={isReportExpanded ? 'true' : 'false'}
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
        className={`w-full transition-all ${
          isZenMode
            ? 'py-3 px-1'
            : 'py-2 px-1'
        }`}
      >
        {/* Assistant Header: Per-message actual author & model badges */}
        <div className="flex flex-wrap items-center justify-between pb-1.5 mb-2.5 text-xs text-zinc-400 gap-2">
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
                <Cpu className="w-2.5 h-2.5 text-zinc-400" />
                <span>{modelName}</span>
                {providerName && (
                  <span className="text-zinc-500 text-[9px]">({providerName})</span>
                )}
              </span>
            )}

            {!runKnown && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-300 font-medium">
                <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
                <span>{tr('正在确认状态…', 'Checking status…', 'Status wird geprüft…')}</span>
              </span>
            )}

            {/* Live Generating Pill */}
            {isTurnGenerating && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-950/60 border border-sky-600/50 text-[11px] text-sky-200 font-medium animate-pulse shadow-sm shadow-sky-900/30">
                <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                <span>{tr('生成中…', 'Generating…', 'Generieren…')}</span>
              </span>
            )}

            {/* Duration Tag (Only shown if no Worked bar is rendered and not generating) */}
            {runKnown && !isTurnGenerating && !turn.hasWork && durationStr && (
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
                <Coins className="w-2.5 h-2.5 text-zinc-500" />
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
                className="flex items-center gap-1 px-2 py-0.5 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded text-[11px] transition-colors border border-zinc-700/60 cursor-pointer"
                title={tr('在审查面板查看本轮文件差异', 'Review turn file diffs', 'Datei-Diffs dieser Runde prüfen')}
              >
                <FileCode className="w-3 h-3" />
                <span>Diff</span>
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
          {/* Top Antigravity-Style Collapsible Tool Calling & Thinking Bar */}
          {turn.hasWork && (
            <WorkedSummaryCard turn={turn} messageId={message.info.id} isBusy={isBusy} runKnown={runKnown} />
          )}

          {/* Assistant Attached Images (Square Thumbnails in a Row) */}
          {turn.fileParts.length > 0 && (
            <ImageThumbnailRow
              images={turn.fileParts}
              onOpenLightbox={(idx) => handleOpenLightbox(turn.fileParts, idx)}
            />
          )}

          {/* Main Response Markdown Surface with Right-Side Adaptive Button */}
          {turn.answerParts.length > 0 ? (
            <div className="mt-2.5 flex items-stretch gap-2 w-full">
              {/* Response Markdown Content */}
              <div className="flex-1 min-w-0 relative">
                <div
                  ref={assistantClipper.containerRef}
                  style={{
                    maxHeight:
                      isAnswerCollapsible && !isReportExpanded
                        ? `${assistantClipper.effectiveHeight}px`
                        : undefined,
                  }}
                  onClick={
                    isAnswerCollapsible && !isReportExpanded
                      ? () => {
                          setIsReportExpanded(true)
                          setDialogueExpandedState(message.info.id, true, allMessageIds)
                        }
                      : undefined
                  }
                  className={`space-y-3 transition-all ${
                    isAnswerCollapsible && !isReportExpanded
                      ? 'overflow-hidden cursor-pointer'
                      : ''
                  }`}
                  title={
                    isAnswerCollapsible && !isReportExpanded
                      ? tr('点击展开完整回答', 'Click to expand full response', 'Klicken, um vollständige Antwort anzuzeigen')
                      : undefined
                  }
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
              </div>

              {/* Right Side Vertical Strip Button for AI Responses */}
              {isAnswerCollapsible && (
                <button
                  type="button"
                  onClick={() => {
                    setIsReportExpanded((prev) => {
                      const next = !prev
                      setDialogueExpandedState(message.info.id, next, allMessageIds)
                      return next
                    })
                  }}
                  className="group/side-btn flex items-center justify-center w-3 hover:w-3.5 shrink-0 self-stretch rounded-full py-1 cursor-pointer select-none focus:outline-none transition-all"
                  title={isReportExpanded ? tr('点击收起回答', 'Click to collapse response', 'Antwort einklappen') : tr('点击展开完整回答', 'Click to expand full response', 'Vollständige Antwort anzeigen')}
                  aria-label={isReportExpanded ? tr('收起回答', 'Collapse response') : tr('展开完整回答', 'Expand response')}
                >
                  <div className="w-1.5 group-hover/side-btn:w-2.5 h-full rounded-full bg-zinc-800/60 group-hover/side-btn:bg-zinc-700/90 border border-zinc-700/40 group-hover/side-btn:border-zinc-500/70 transition-all duration-150 flex items-center justify-center shadow-sm">
                    {isReportExpanded ? (
                      <ChevronUp className="w-2.5 h-2.5 text-zinc-500 group-hover/side-btn:text-zinc-200 transition-colors" />
                    ) : (
                      <ChevronDown className="w-2.5 h-2.5 text-zinc-500 group-hover/side-btn:text-zinc-200 transition-colors" />
                    )}
                  </div>
                </button>
              )}
            </div>
          ) : !turn.hasWork && (
            // Fallback for turns without any tools or reasoning and no text yet (e.g. initial empty/loading/thinking states)
            <>
            {message.parts.length === 0 && !errorMessage && (
              emptyChrome === 'confirming' || emptyChrome === 'loading' ? (
                <div className="py-2.5 px-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-center gap-3.5 shadow-sm">
                  <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/60 shrink-0 text-zinc-300 shadow-inner">
                    <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        {emptyChrome === 'confirming'
                          ? tr('正在确认状态…', 'Checking status…', 'Status wird geprüft…')
                          : tr('加载中…', 'Loading…', 'Wird geladen…')}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {tr(
                        '正在同步后端执行状态与对话记录…',
                        'Syncing execution status and conversation history…',
                        'Synchronisiert Status und Verlauf…'
                      )}
                    </p>
                  </div>
                </div>
              ) : emptyChrome === 'thinking' ? (
                <div className="py-2.5 px-3.5 rounded-lg bg-purple-950/25 border border-purple-800/40 flex items-center gap-3.5 shadow-sm">
                  <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-purple-900/40 border border-purple-700/50 shrink-0 text-purple-300 shadow-inner">
                    <Sparkles className="w-4 h-4 text-purple-300 animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-100">
                        {tr('正在思考与生成回复…', 'Thinking & Generating Response…', 'Denkt nach und generiert Antwort…')}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {tr('模型正在分析上下文并规划执行方案…', 'Analyzing context and planning execution…', 'Analysiert Kontext und plant…')}
                    </p>
                  </div>
                </div>
              ) : emptyChrome === 'interrupted' && showTerminalError ? (
                <div className="flex items-start gap-3 py-3.5 px-4 rounded-lg bg-amber-950/20 border border-amber-800/40 text-amber-200 text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <div className="font-semibold text-amber-300">
                      {tr('未收到模型响应 (自动重试已达上限)', 'No response received (Auto-retry limit reached)', 'Keine Antwort erhalten (Auto-Wiederholungslimit erreicht)')}
                    </div>
                    <p className="text-zinc-400 text-[11px] leading-relaxed">
                      {tr(
                        '该轮次在输出内容前连续多次中断且已达到最大自动重试次数 (5次)。',
                        'This turn was interrupted before producing content and reached the maximum automatic retry limit (5 attempts).',
                        'Diese Runde wurde vor der Ausgabe abgebrochen und hat das Wiederholungslimit (5) erreicht.'
                      )}
                    </p>
                  </div>
                </div>
              ) : null
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
                const assistantFiles = message.parts
                  .filter((p) => p.type === 'file')
                  .map((p) => p as FilePart)
                if (part === assistantFiles[0]) {
                  return (
                    <ImageThumbnailRow
                      key="assistant_files_row"
                      images={assistantFiles}
                      onOpenLightbox={(idx) => handleOpenLightbox(assistantFiles, idx)}
                    />
                  )
                }
                return null
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

          {/* Render Terminal Relay Error Callout ONLY after automatic recovery is exhausted */}
          {showTerminalError && errorMessage && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-red-300 text-xs sm:text-sm font-mono flex items-start gap-3 shadow-inner">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <div className="font-semibold text-red-400 flex items-center justify-between">
                  <span>{tr('中转服务响应异常 (已停止自动重试)', 'Relay Response Error (Auto-Retry Stopped)', 'Relay-Antwortfehler (Auto-Retry gestoppt)')}</span>
                </div>
                <div className="text-zinc-300 break-words whitespace-pre-wrap font-sans text-xs select-text leading-relaxed">
                  {errorMessage}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Preview Modal (Image 3) */}
      {isLightboxOpen && (
        <ImageLightboxModal
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
          images={lightboxImages}
          initialIndex={lightboxIndex}
        />
      )}

      {/* File Viewer Modal (Floating UI from Markdown Links) */}
      {activeFileModalItem && (
        <FileViewModal
          item={activeFileModalItem}
          directory={sessionDirectory}
          onClose={() => setActiveFileModalItem(null)}
        />
      )}
    </div>
  )
}
