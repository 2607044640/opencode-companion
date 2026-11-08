import React, { useState, useEffect, useRef } from 'react'
import {
  MoreHorizontal,
  Network,
  BookmarkPlus,
  Search,
  Cpu,
  Copy,
  Check,
  Maximize2,
  FileText,
  FileDown,
  Terminal,
  PanelTopClose,
  PanelTopOpen,
} from 'lucide-react'
import { useI18n } from '../../utils/i18n'
import type { Session, Message } from '../../types/opencode'
import { exportSessionToMarkdown, extractSessionPrompts, downloadTextFile } from '../../utils/export-markdown'

export interface ShortcutMenuProps {
  activeSession?: Session | null
  activeSessionId?: string | null
  messages?: Message[]
  onOpenMapAndLocate?: (sessionId?: string) => void
  onAddSessionToMap?: (sessionId: string) => void
  onOpenSearch?: () => void
  onOpenModelRouter?: () => void
  onOpenBackgroundTasks?: () => void
  onOpenSubagentTopology?: () => void
  onGetSessionJson?: () => Promise<string>
  onToggleZenMode?: () => void
  onOpenFind?: () => void
  isHeaderVisible?: boolean
  onToggleHeader?: () => void
  compact?: boolean
  popoverPlacement?: 'right' | 'top' | 'bottom' | 'right-bottom'
}

export function ShortcutMenu({
  activeSession,
  activeSessionId,
  messages = [],
  onOpenMapAndLocate,
  onAddSessionToMap,
  onOpenSearch,
  onOpenModelRouter,
  onOpenBackgroundTasks,
  onOpenSubagentTopology,
  onGetSessionJson,
  onToggleZenMode,
  onOpenFind,
  isHeaderVisible = true,
  onToggleHeader,
  compact = true,
  popoverPlacement = 'right',
}: ShortcutMenuProps) {
  const { lang } = useI18n()
  const isZh = lang.startsWith('zh')
  const [isOpen, setIsOpen] = useState(false)
  const [copiedMd, setCopiedMd] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [copiedJson, setCopiedJson] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click or Escape
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen])

  // 1. Export Markdown (Click to copy & trigger file download)
  const handleExportMarkdown = async () => {
    try {
      const md = exportSessionToMarkdown(activeSession, messages)
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(md)
      }
      const safeTitle = (activeSession?.title || 'conversation')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .slice(0, 50)
      downloadTextFile(`${safeTitle}.md`, md)

      setCopiedMd(true)
      window.dispatchEvent(
        new CustomEvent('opencode:toast', {
          detail: { message: isZh ? '已导出并复制 Markdown 记录' : 'Exported and copied Markdown' },
        })
      )
      setTimeout(() => {
        setCopiedMd(false)
        setIsOpen(false)
      }, 1000)
    } catch (err) {
      console.error('Failed to export markdown:', err)
    }
  }

  // 2. Copy Prompt (Single prompt or combined prompts from session)
  const handleCopyPrompt = async () => {
    try {
      const prompts = extractSessionPrompts(messages)
      if (prompts.length === 0) {
        window.dispatchEvent(
          new CustomEvent('opencode:toast', {
            detail: { message: isZh ? '当前会话暂无用户 Prompt' : 'No prompt found in session' },
          })
        )
        setIsOpen(false)
        return
      }

      const textToCopy = prompts.join('\n\n---\n\n')
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(textToCopy)
      }

      setCopiedPrompt(true)
      window.dispatchEvent(
        new CustomEvent('opencode:toast', {
          detail: {
            message:
              prompts.length === 1
                ? (isZh ? '已复制会话 Prompt' : 'Copied prompt')
                : (isZh ? `已复制全部 ${prompts.length} 条 Prompt` : `Copied ${prompts.length} prompts`),
          },
        })
      )
      setTimeout(() => {
        setCopiedPrompt(false)
        setIsOpen(false)
      }, 1000)
    } catch (err) {
      console.error('Failed to copy prompt:', err)
    }
  }

  // 3. Export Session JSON (Figure 3)
  const handleCopyJson = async () => {
    try {
      let json = ''
      if (onGetSessionJson) {
        json = await onGetSessionJson()
      } else {
        json = JSON.stringify({ session: activeSession, messages }, null, 2)
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(json)
      }

      const safeTitle = (activeSession?.title || 'session')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .slice(0, 50)
      downloadTextFile(`${safeTitle}.json`, json, 'application/json')

      setCopiedJson(true)
      window.dispatchEvent(
        new CustomEvent('opencode:toast', {
          detail: { message: isZh ? '已导出并复制会话 JSON' : 'Exported and copied Session JSON' },
        })
      )
      setTimeout(() => {
        setCopiedJson(false)
        setIsOpen(false)
      }, 1000)
    } catch (err) {
      console.error('Failed to copy json:', err)
    }
  }

  const popoverStyle: React.CSSProperties =
    popoverPlacement === 'right'
      ? { left: '100%', top: '0', marginLeft: '10px' }
      : popoverPlacement === 'right-bottom'
      ? { left: '100%', bottom: '0', marginLeft: '10px' }
      : popoverPlacement === 'top'
      ? { bottom: '100%', left: '0', marginBottom: '8px' }
      : { top: '100%', left: '0', marginTop: '8px' }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center justify-center rounded-md text-[#8b949e] hover:text-[#f0f6fc] transition-colors cursor-pointer select-none ${
          compact
            ? 'w-8 h-8 p-1.5 hover:bg-[#1f232b]'
            : 'px-2 py-1.5 text-xs gap-1.5 hover:bg-[#161920]'
        } ${isOpen ? 'bg-[#1f232b] text-[#f0f6fc]' : ''}`}
        title={isZh ? '导出与工作区工具 (···)' : 'Export & Tools (···)'}
        aria-label={isZh ? '导出与工作区工具 (···)' : 'Export & Tools (···)'}
      >
        <MoreHorizontal className="w-4 h-4" />
        {!compact && <span>{isZh ? '导出与工具' : 'Tools'}</span>}
      </button>

      {isOpen && (
        <div
          style={popoverStyle}
          className="absolute z-50 w-64 rounded-xl border border-[#2a2e38] bg-[#12141a]/98 backdrop-blur-md p-1.5 shadow-2xl text-xs select-none animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 border-b border-zinc-800/80 mb-1 flex items-center justify-between">
            <span>{isZh ? '会话操作与工作区工具' : 'Session & Tools'}</span>
            <span className="text-[10px] font-mono text-zinc-500">···</span>
          </div>

          <div className="space-y-0.5">
            {/* 1. Export Markdown (Primary Button) */}
            <button
              type="button"
              onClick={handleExportMarkdown}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-zinc-200 hover:text-white hover:bg-sky-950/40 border border-transparent hover:border-sky-800/50 transition-colors cursor-pointer text-left group"
            >
              <div className="flex items-center gap-2">
                {copiedMd ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <FileDown className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
                )}
                <span className="font-medium text-sky-100">
                  {copiedMd
                    ? isZh
                      ? '已导出 Markdown'
                      : 'Exported Markdown'
                    : isZh
                    ? '导出 Markdown'
                    : 'Export Markdown'}
                </span>
              </div>
              <span className="text-[10px] font-mono text-sky-400/80 bg-sky-950/80 px-1 py-0.2 rounded border border-sky-800/50">
                .md
              </span>
            </button>

            {/* 2. Copy Prompt (Single prompt / prompts from session like Antigravity) */}
            <button
              type="button"
              onClick={handleCopyPrompt}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer text-left group"
            >
              <div className="flex items-center gap-2">
                {copiedPrompt ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                )}
                <span>
                  {copiedPrompt
                    ? isZh
                      ? '已复制 Prompt'
                      : 'Copied Prompt'
                    : isZh
                    ? '复制会话 Prompt'
                    : 'Copy Prompt'}
                </span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">Prompt</span>
            </button>

            {/* 3. Export Session JSON (Figure 3) */}
            <button
              type="button"
              onClick={handleCopyJson}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer text-left group"
            >
              <div className="flex items-center gap-2">
                {copiedJson ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-zinc-400 group-hover:scale-110 transition-transform" />
                )}
                <span>
                  {copiedJson
                    ? isZh
                      ? '已导出会话 JSON'
                      : 'Exported JSON'
                    : isZh
                    ? '导出会话 JSON'
                    : 'Export Session JSON'}
                </span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">JSON</span>
            </button>

            {/* 4. Background Tasks & Terminal Monitor */}
            {onOpenBackgroundTasks && (
              <button
                type="button"
                onClick={() => {
                  onOpenBackgroundTasks()
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
                  <span>{isZh ? '后台任务与终端监控' : 'Background Tasks & Terminal'}</span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/60 font-mono text-[10px] text-zinc-400">
                  Ctrl+`
                </kbd>
              </button>
            )}

            {/* 5. Subagent Topology & Communication Inspector */}
            {onOpenSubagentTopology && (
              <button
                type="button"
                onClick={() => {
                  onOpenSubagentTopology()
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <Network className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
                  <span>{isZh ? '智能体拓扑与通讯监视' : 'Subagent Topology & Monitor'}</span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/60 font-mono text-[10px] text-zinc-400">
                  Ctrl+Shift+Q
                </kbd>
              </button>
            )}

            <div className="border-t border-zinc-800/60 my-1" />

            {/* 4. Global Search (Ctrl+K) */}
            {onOpenSearch && (
              <button
                type="button"
                onClick={() => {
                  onOpenSearch()
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
                  <span>{isZh ? '全局会话搜索' : 'Search Sessions'}</span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/60 font-mono text-[10px] text-zinc-400">
                  Ctrl+K
                </kbd>
              </button>
            )}

            {/* 5. Locate Active Session in Map (Ctrl+M) */}
            {onOpenMapAndLocate && (
              <button
                type="button"
                onClick={() => {
                  onOpenMapAndLocate(activeSessionId || undefined)
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <Network className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span>{isZh ? '在蓝图地图中定位' : 'Locate in Map'}</span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/60 font-mono text-[10px] text-zinc-400">
                  Ctrl+M
                </kbd>
              </button>
            )}

            {/* 6. Add to Map (Alt+M) */}
            {activeSessionId && onAddSessionToMap && (
              <button
                type="button"
                onClick={() => {
                  onAddSessionToMap(activeSessionId)
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <BookmarkPlus className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
                  <span>{isZh ? '放入蓝图地图' : 'Add to Map'}</span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/60 font-mono text-[10px] text-zinc-400">
                  Alt+M
                </kbd>
              </button>
            )}

            {/* 7. Model Router (Ctrl+Shift+3) */}
            {onOpenModelRouter && (
              <button
                type="button"
                onClick={() => {
                  onOpenModelRouter()
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-zinc-400 group-hover:scale-110 transition-transform" />
                  <span>{isZh ? '模型路由面板' : 'Model Router'}</span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/60 font-mono text-[10px] text-zinc-400">
                  Ctrl+Shift+3
                </kbd>
              </button>
            )}

            {/* 8. Find in Page (Ctrl+F) */}
            {onOpenFind && (
              <button
                type="button"
                onClick={() => {
                  onOpenFind()
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span>{isZh ? '页面内查找' : 'Find in Page'}</span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/60 font-mono text-[10px] text-zinc-400">
                  Ctrl+F
                </kbd>
              </button>
            )}

            {/* 9. Zen Mode (F11) */}
            {onToggleZenMode && (
              <button
                type="button"
                onClick={() => {
                  onToggleZenMode()
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <Maximize2 className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
                  <span>{isZh ? 'Zen 专注阅读模式' : 'Zen Focus Mode'}</span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/60 font-mono text-[10px] text-zinc-400">
                  F11
                </kbd>
              </button>
            )}

            {/* 10. Toggle Top Bar (Ctrl+Shift+B) */}
            {onToggleHeader && (
              <button
                type="button"
                onClick={() => {
                  onToggleHeader()
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  {isHeaderVisible ? (
                    <PanelTopClose className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
                  ) : (
                    <PanelTopOpen className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
                  )}
                  <span>
                    {isZh
                      ? isHeaderVisible
                        ? '隐藏上方会话栏'
                        : '显示上方会话栏'
                      : isHeaderVisible
                      ? 'Hide Top Bar'
                      : 'Show Top Bar'}
                  </span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/60 font-mono text-[10px] text-zinc-400">
                  Ctrl+Shift+B
                </kbd>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
