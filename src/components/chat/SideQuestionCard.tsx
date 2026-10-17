import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import {
  HelpCircle,
  Copy,
  Check,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
} from 'lucide-react'
import type { SideQuestionItem } from '../../hooks/useSideQuestion'
import {
  SideQuestionModelSelector,
  type SideQuestionModel,
} from './SideQuestionModelSelector'
import type { ProviderInfo } from '../../types/opencode'
import { useI18n } from '../../utils/i18n'

export interface SideQuestionCardProps {
  data: SideQuestionItem
  currentIndex: number
  totalCount: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
  onDelete: () => void
  isZenMode?: boolean
  selectedModel?: SideQuestionModel | null
  onSelectModel?: (model: SideQuestionModel) => void
  providers?: ProviderInfo[]
}

export function SideQuestionCard({
  data,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
  onClose,
  onDelete,
  isZenMode,
  selectedModel,
  onSelectModel,
  providers,
}: SideQuestionCardProps) {
  const { lang } = useI18n()
  const isZh = lang?.startsWith('zh') ?? true

  const [isThoughtExpanded, setIsThoughtExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(1)

  // Live timer while generating before thoughtDuration freezes
  useEffect(() => {
    if (data.status !== 'generating') return
    const interval = setInterval(() => {
      setElapsedSeconds(Math.max(1, Math.round((Date.now() - data.startTime) / 1000)))
    }, 1000)
    return () => clearInterval(interval)
  }, [data.status, data.startTime])

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    const content = data.answer || data.thought || ''
    if (!content) return
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const thoughtDurationDisplay =
    data.thoughtDuration !== undefined ? data.thoughtDuration : elapsedSeconds

  return (
    <div
      className={`rounded-xl border border-[#2b303b] bg-[#14171d]/95 backdrop-blur-md shadow-2xl p-3.5 select-text transition-all ${
        isZenMode ? 'max-w-3xl mx-auto' : ''
      }`}
    >
      {/* 1. Header Bar: Icon, Title, Multi-Question Navigation (< 2/2 >), and Action Controls */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-orange-600/20 border border-orange-500/30 flex items-center justify-center shrink-0">
            <HelpCircle className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <span className="font-semibold text-xs text-zinc-100 truncate">
            Side Question: <span className="text-zinc-200 font-normal">{data.question}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Top-right Model Selector (Matches Images 1 & 3) */}
          {onSelectModel && (
            <SideQuestionModelSelector
              selectedModel={selectedModel || null}
              onSelectModel={onSelectModel}
              providers={providers || []}
            />
          )}

          {/* Multi-question pagination navigator (Image 4: < 2/2 >) */}
          {totalCount > 1 && (
            <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 bg-zinc-900/60 border border-zinc-800/60 rounded px-1.5 py-0.5 select-none mr-1">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={onPrev}
                className="hover:text-zinc-100 disabled:opacity-30 disabled:hover:text-zinc-400 cursor-pointer p-0.5"
                title="Previous side question"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="text-[10px] text-zinc-300">
                {currentIndex + 1}/{totalCount}
              </span>
              <button
                type="button"
                disabled={currentIndex === totalCount - 1}
                onClick={onNext}
                className="hover:text-zinc-100 disabled:opacity-30 disabled:hover:text-zinc-400 cursor-pointer p-0.5"
                title="Next side question"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            title={isZh ? '复制回答' : 'Copy answer'}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Delete / Clear Button */}
          <button
            type="button"
            onClick={onDelete}
            title={isZh ? '删除此侧边问答' : 'Delete side question'}
            className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            title={isZh ? '关闭卡片' : 'Close card'}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Thought Collapsible Trigger (Image 2 & 3: Thought for 28s >) */}
      {Boolean(data.thought) && (
        <div className="pt-2 select-none">
          <button
            type="button"
            onClick={() => setIsThoughtExpanded(!isThoughtExpanded)}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer py-0.5"
          >
            <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
            <span className="font-mono text-[11px] text-zinc-400">
              {data.status === 'generating' && !data.thoughtDuration && !data.answer
                ? `Thinking... (${elapsedSeconds}s)`
                : `Thought for ${thoughtDurationDisplay}s`}
            </span>
            {isThoughtExpanded ? (
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            ) : (
              <ChevronRight className="w-3 h-3 text-zinc-500" />
            )}
          </button>

          {/* Expanded Thought Block */}
          {isThoughtExpanded && (
            <div className="mt-1.5 mb-2 p-2.5 rounded-lg bg-[#0d0f14] border border-purple-900/30 max-h-56 overflow-y-auto font-mono text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap select-text no-scrollbar">
              {data.thought}
            </div>
          )}
        </div>
      )}

      {/* 3. Generating Thinking State (Image 4: Thinking...) or Markdown Answer Body */}
      <div className="pt-2">
        {data.status === 'generating' && !data.thought && !data.answer ? (
          <div className="text-xs text-zinc-400 font-mono py-1 flex items-center gap-2 select-none">
            <span className="animate-pulse">Thinking...</span>
          </div>
        ) : data.answer ? (
          <div className="text-xs sm:text-sm text-zinc-200 leading-relaxed select-text prose prose-invert prose-xs sm:prose-sm max-w-none break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {data.answer}
            </ReactMarkdown>
          </div>
        ) : data.status === 'error' ? (
          <div className="text-xs text-red-400 py-1 font-mono">
            {data.error || (isZh ? '获取回答失败' : 'Failed to retrieve answer')}
          </div>
        ) : null}
      </div>
    </div>
  )
}
