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
  PanelTopClose,
  PanelTopOpen,
} from 'lucide-react'
import { useI18n } from '../../utils/i18n'

interface ShortcutMenuProps {
  activeSessionId?: string | null
  onOpenMapAndLocate?: (sessionId?: string) => void
  onAddSessionToMap?: (sessionId: string) => void
  onOpenSearch?: () => void
  onOpenModelRouter?: () => void
  onGetSessionJson?: () => Promise<string>
  onToggleZenMode?: () => void
  onOpenFind?: () => void
  isHeaderVisible?: boolean
  onToggleHeader?: () => void
  compact?: boolean
  popoverPlacement?: 'right' | 'top' | 'bottom'
}

export function ShortcutMenu({
  activeSessionId,
  onOpenMapAndLocate,
  onAddSessionToMap,
  onOpenSearch,
  onOpenModelRouter,
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
  const [copied, setCopied] = useState(false)
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

  const handleCopyJson = async () => {
    if (!onGetSessionJson) return
    try {
      const json = await onGetSessionJson()
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(json)
        setCopied(true)
        setTimeout(() => {
          setCopied(false)
          setIsOpen(false)
        }, 800)
      }
    } catch {}
  }

  const popoverStyle: React.CSSProperties =
    popoverPlacement === 'right'
      ? { left: '100%', top: '0', marginLeft: '10px' }
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
        title={isZh ? '快捷键与工具 (···)' : 'Shortcuts & Tools (···)'}
        aria-label={isZh ? '快捷键与工具 (···)' : 'Shortcuts & Tools (···)'}
      >
        <MoreHorizontal className="w-4 h-4" />
        {!compact && <span>{isZh ? '快捷键与工具' : 'Shortcuts'}</span>}
      </button>

      {isOpen && (
        <div
          style={popoverStyle}
          className="absolute z-50 w-64 rounded-xl border border-[#2a2e38] bg-[#12141a]/98 backdrop-blur-md p-1.5 shadow-2xl text-xs select-none animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 border-b border-zinc-800/80 mb-1 flex items-center justify-between">
            <span>{isZh ? '快捷键与工作区工具' : 'Shortcuts & Workspace Tools'}</span>
            <span className="text-[10px] font-mono text-zinc-500">···</span>
          </div>

          <div className="space-y-0.5">
            {/* 1. Global Search (Ctrl+K) */}
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

            {/* 2. Locate Active Session in Map (Ctrl+M) */}
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

            {/* 3. Add to Map (Alt+M) */}
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
                  <BookmarkPlus className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                  <span>{isZh ? '放入蓝图地图' : 'Add to Map'}</span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/60 font-mono text-[10px] text-zinc-400">
                  Alt+M
                </kbd>
              </button>
            )}

            {/* 4. Model Router (Ctrl+Shift+3) */}
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
                  <Cpu className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
                  <span>{isZh ? '模型路由面板' : 'Model Router'}</span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/60 font-mono text-[10px] text-zinc-400">
                  Ctrl+Shift+3
                </kbd>
              </button>
            )}

            {/* 5. Copy / Export Session JSON */}
            {onGetSessionJson && (
              <button
                type="button"
                onClick={handleCopyJson}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-zinc-400 group-hover:scale-110 transition-transform" />
                  )}
                  <span>
                    {copied
                      ? isZh
                        ? '已复制会话 JSON'
                        : 'Copied Session JSON'
                      : isZh
                      ? '导出会话 JSON'
                      : 'Export Session JSON'}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500">JSON</span>
              </button>
            )}

            <div className="border-t border-zinc-800/60 my-1" />

            {/* 6. Find in Page (Ctrl+F) */}
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

            {/* 7. Zen Mode (F11) */}
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

            {/* 8. Toggle Top Bar (Ctrl+Shift+B) */}
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
                    <PanelTopClose className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
                  ) : (
                    <PanelTopOpen className="w-3.5 h-3.5 text-orange-400 group-hover:scale-110 transition-transform" />
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
