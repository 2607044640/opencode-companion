import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Folder,
  X,
  ExternalLink,
  Loader2,
  Copy,
  Check,
  User,
  Sparkles,
  Clock,
  Terminal,
  Brain,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Session, Project, Message, TextPart, ReasoningPart, ToolPart } from '../../types/opencode'
import { api } from '../../services/api'
import { useI18n } from '../../utils/i18n'
import { resolveSessionProject } from '../../utils/session-workspace'
import { formatCompactTime } from '../../utils/sidebar-helpers'
import { calculatePreviewPosition } from './session-preview-position'

export interface SessionPreviewPopoverProps {
  session: Session
  mouseX: number
  mouseY: number
  projects?: readonly Project[]
  onClose: () => void
  onSelectSession: (sessionId: string) => void
}

export function SessionPreviewPopover({
  session,
  mouseX,
  mouseY,
  projects = [],
  onClose,
  onSelectSession,
}: SessionPreviewPopoverProps) {
  const { lang } = useI18n()
  const isZh = lang === 'zh-CN'

  const [messages, setMessages] = useState<Message[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState(false)
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({})

  const popoverRef = useRef<HTMLDivElement>(null)

  // Fetch session messages
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    api.getMessages(session.id)
      .then((data) => {
        if (!cancelled) {
          setMessages(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || (isZh ? '加载会话内容失败' : 'Failed to load session messages'))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [session.id, isZh])

  // Smart viewport-aware position calculation
  const pos = useMemo(() => {
    return calculatePreviewPosition({
      mouseX,
      mouseY,
      previewWidth: 540,
      previewHeight: 580,
    })
  }, [mouseX, mouseY])

  // Close on outside click or Escape / Enter
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        onSelectSession(session.id)
        onClose()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, onSelectSession, session.id])

  const projectBadge = useMemo(() => {
    return resolveSessionProject(session, projects)
  }, [session, projects])

  const toggleThought = (msgId: string) => {
    setExpandedThoughts((prev) => ({ ...prev, [msgId]: !prev[msgId] }))
  }

  const handleCopyId = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(session.id)
      }
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 1200)
    } catch {}
  }

  // Count turns and tokens
  const stats = useMemo(() => {
    if (!messages) return null
    let promptCount = 0
    let totalTokens = 0
    let lastModel = ''

    for (const m of messages) {
      if (m.info.role === 'user') promptCount++
      if (m.info.tokens) {
        totalTokens += (m.info.tokens.input || 0) + (m.info.tokens.output || 0)
      }
      if (m.info.modelID) {
        lastModel = m.info.modelID
      } else if (m.info.model?.modelID) {
        lastModel = m.info.model.modelID
      }
    }

    const fallbackModel = typeof session.model === 'string'
      ? session.model
      : session.model?.id || ''

    return {
      promptCount,
      totalMessages: messages.length,
      totalTokens,
      lastModel: (lastModel || fallbackModel) as string,
    }
  }, [messages, session.model])

  const content = (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        width: `${pos.maxWidth}px`,
        maxHeight: `${pos.maxHeight}px`,
        zIndex: 9999,
      }}
      className="flex flex-col rounded-2xl border border-[#2d3240] bg-[#12141c]/98 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] text-zinc-200 select-none overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. Header Bar */}
      <div className="px-4 py-3 border-b border-[#222533] bg-[#161824]/90 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-sky-950/80 border border-sky-800/60 flex items-center justify-center text-sky-400 shrink-0 shadow-inner">
            <Folder className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-medium text-sky-400 bg-sky-950/70 border border-sky-800/50 px-1.5 py-0.2 rounded shrink-0">
                {projectBadge.name || 'Project'}
              </span>
              <h3 className="text-xs font-semibold text-zinc-100 truncate" title={session.title || session.id}>
                {session.title || session.id}
              </h3>
            </div>
            <div className="text-[10px] text-zinc-400 font-mono truncate mt-0.5" title={session.directory}>
              {session.directory}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              onSelectSession(session.id)
              onClose()
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors cursor-pointer shadow-md shadow-sky-950/50"
            title={isZh ? '进入此会话 (Enter)' : 'Open session (Enter)'}
          >
            <span>{isZh ? '打开会话' : 'Open'}</span>
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
            title={isZh ? '关闭预览 (Esc)' : 'Close preview (Esc)'}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Metadata Quick Bar */}
      <div className="px-4 py-1.5 border-b border-[#202230] bg-[#141620]/60 flex items-center justify-between text-[10px] text-zinc-400 font-mono shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-zinc-500" />
            <span>{formatCompactTime(session.time?.updated || session.time?.created)}</span>
          </span>
          {stats && (
            <span>
              {isZh ? `${stats.promptCount} 轮对话 (${stats.totalMessages} 条)` : `${stats.promptCount} turns (${stats.totalMessages} msgs)`}
            </span>
          )}
        </div>
        {stats?.lastModel && (
          <span className="flex items-center gap-1 text-sky-400/90 bg-sky-950/40 px-1.5 py-0.5 rounded border border-sky-900/40">
            <Sparkles className="w-2.5 h-2.5 text-sky-400" />
            <span>{stats.lastModel}</span>
          </span>
        )}
      </div>

      {/* 3. Messages Timeline Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs select-text">
        {loading && (
          <div className="py-16 flex flex-col items-center justify-center gap-2.5 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
            <span className="text-xs font-medium">{isZh ? '正在载入会话对话内容…' : 'Loading session timeline…'}</span>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs text-center">
            {error}
          </div>
        )}

        {!loading && !error && messages && messages.length === 0 && (
          <div className="py-16 text-center text-zinc-500 text-xs">
            {isZh ? '此会话尚无任何消息' : 'No messages in this conversation'}
          </div>
        )}

        {!loading && !error && messages && messages.length > 0 && (
          messages.map((msg, idx) => {
            const role = msg.info.role
            const isUser = role === 'user'

            const textParts = msg.parts.filter((p): p is TextPart => p.type === 'text')
            const textContent = textParts.map((p) => p.text).join('\n\n').trim()

            const reasoningParts = msg.parts.filter((p): p is ReasoningPart => p.type === 'reasoning')
            const reasoningText = reasoningParts.map((p) => (p as any).text || (p as any).content || '').join('\n').trim()

            const toolParts = msg.parts.filter((p): p is ToolPart => p.type === 'tool')

            return (
              <div
                key={msg.info.id || idx}
                className={`rounded-xl border p-3 transition-colors ${
                  isUser
                    ? 'bg-sky-950/20 border-sky-900/40 text-sky-100 shadow-sm'
                    : 'bg-[#181a24]/90 border-zinc-800/80 text-zinc-200'
                }`}
              >
                {/* Message Header */}
                <div className="flex items-center justify-between text-[11px] mb-2 border-b border-white/5 pb-1.5 select-none">
                  <div className="flex items-center gap-1.5 font-medium">
                    {isUser ? (
                      <>
                        <User className="w-3 h-3 text-sky-400" />
                        <span className="text-sky-300 font-semibold">{isZh ? '用户' : 'User'}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-300 font-semibold">
                          {msg.info.agent ? `${msg.info.agent}` : (isZh ? 'AI 助手' : 'Assistant')}
                        </span>
                        {(msg.info.modelID || msg.info.model?.modelID) && (
                          <span className="text-[9px] text-zinc-400 font-mono bg-zinc-800/80 px-1 py-0.2 rounded border border-zinc-700/50">
                            {msg.info.modelID || msg.info.model?.modelID}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {msg.info.time?.created ? (
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {formatCompactTime(msg.info.time.created)}
                    </span>
                  ) : null}
                </div>

                {/* Optional Reasoning / Thought (Assistant) */}
                {reasoningText && (
                  <div className="mb-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60 overflow-hidden text-[11px]">
                    <button
                      type="button"
                      onClick={() => toggleThought(msg.info.id)}
                      className="w-full flex items-center justify-between px-2.5 py-1 text-zinc-400 hover:text-zinc-200 bg-zinc-900/40 hover:bg-zinc-800/40 transition-colors cursor-pointer select-none text-left"
                    >
                      <div className="flex items-center gap-1.5">
                        <Brain className="w-3 h-3 text-purple-400" />
                        <span>{isZh ? '思考过程' : 'Thinking Process'}</span>
                      </div>
                      {expandedThoughts[msg.info.id] ? (
                        <ChevronDown className="w-3 h-3 text-zinc-500" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-zinc-500" />
                      )}
                    </button>
                    {expandedThoughts[msg.info.id] && (
                      <div className="p-2.5 max-h-48 overflow-y-auto text-zinc-300 font-mono text-[10px] leading-relaxed whitespace-pre-wrap border-t border-zinc-800/50">
                        {reasoningText}
                      </div>
                    )}
                  </div>
                )}

                {/* Text Content with Markdown */}
                {textContent ? (
                  <div className="prose prose-invert prose-xs max-w-none leading-relaxed break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                      {textContent}
                    </ReactMarkdown>
                  </div>
                ) : null}

                {/* Tool Parts Summary if any */}
                {toolParts && toolParts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 select-none">
                    {toolParts.map((t, tIdx) => {
                      const toolName = (t as any).tool || (t as any).name || 'tool'
                      return (
                        <span
                          key={tIdx}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800/70 border border-zinc-700/50 text-[10px] text-zinc-300 font-mono"
                        >
                          <Terminal className="w-2.5 h-2.5 text-amber-400" />
                          <span>{toolName}</span>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* 4. Footer Bar */}
      <div className="px-4 py-2 border-t border-[#222533] bg-[#141620]/90 flex items-center justify-between text-[10px] text-zinc-400 font-mono shrink-0 select-none">
        <div className="flex items-center gap-2">
          <span>{isZh ? 'Ctrl+点击 快速预览' : 'Ctrl+Click to preview'}</span>
          <span className="text-zinc-600">·</span>
          <span>{isZh ? 'Enter 打开会话' : 'Enter to open'}</span>
        </div>

        <button
          type="button"
          onClick={handleCopyId}
          className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          title={isZh ? '复制完整会话 ID' : 'Copy session ID'}
        >
          {copiedId ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">{isZh ? '已复制 ID' : 'Copied'}</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>{session.id.slice(0, 8)}...</span>
            </>
          )}
        </button>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
