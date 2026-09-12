import { useEffect, useRef, useState } from 'react'
import { X, Copy, Check, RotateCcw, ArrowRightToLine, Layers, MapPin, Edit3 } from 'lucide-react'
import { useI18n } from '../../utils/i18n'

interface TabContextMenuProps {
  tabId: string
  sessionTitle: string
  x: number
  y: number
  onClose: () => void
  onCloseTab: (sessionId: string) => void
  onCloseOtherTabs: (sessionId: string) => void
  onCloseTabsToRight: (sessionId: string) => void
  onReopenClosedTab: () => void
  canReopen: boolean
  onRename?: (sessionId: string) => void
  onShowInMap?: () => void
}

export function TabContextMenu({
  tabId,
  sessionTitle,
  x,
  y,
  onClose,
  onCloseTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onReopenClosedTab,
  canReopen,
  onRename,
  onShowInMap,
}: TabContextMenuProps) {
  const { lang } = useI18n()
  const isZh = lang === 'zh-CN'
  const menuRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  // Adjust menu position to stay within viewport bounds
  const [position, setPosition] = useState({ left: x, top: y })

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight

      let adjustedX = x
      let adjustedY = y

      if (x + rect.width > vw - 10) {
        adjustedX = Math.max(10, vw - rect.width - 10)
      }
      if (y + rect.height > vh - 10) {
        adjustedY = Math.max(10, vh - rect.height - 10)
      }

      setPosition({ left: adjustedX, top: adjustedY })
    }
  }, [x, y])

  // Close on outside click or Escape key
  useEffect(() => {
    const handleDown = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      } else if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    window.addEventListener('mousedown', handleDown, true)
    window.addEventListener('keydown', handleDown, true)
    return () => {
      window.removeEventListener('mousedown', handleDown, true)
      window.removeEventListener('keydown', handleDown, true)
    }
  }, [onClose])

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(tabId)
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
        onClose()
      }, 600)
    } catch {
      onClose()
    }
  }

  return (
    <div
      ref={menuRef}
      style={{ left: position.left, top: position.top }}
      className="fixed z-50 min-w-[200px] rounded-xl border border-[#2a2e38] bg-[#12141a]/95 backdrop-blur-md p-1 shadow-2xl text-xs select-none animation-fade-in"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Title Header */}
      <div className="px-2.5 py-1.5 text-[11px] text-zinc-400 font-mono truncate border-b border-zinc-800/60 mb-1 max-w-[220px]">
        {sessionTitle || tabId.slice(0, 12)}
      </div>

      {/* Close Tab */}
      <button
        type="button"
        onClick={() => {
          onCloseTab(tabId)
          onClose()
        }}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <X className="w-3.5 h-3.5 text-zinc-400" />
          <span>{isZh ? '关闭标签' : 'Close Tab'}</span>
        </span>
        <span className="text-[10px] font-mono text-zinc-500">Ctrl+W</span>
      </button>

      {/* Close Other Tabs */}
      <button
        type="button"
        onClick={() => {
          onCloseOtherTabs(tabId)
          onClose()
        }}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
      >
        <Layers className="w-3.5 h-3.5 text-zinc-400" />
        <span>{isZh ? '关闭其他标签' : 'Close Other Tabs'}</span>
      </button>

      {/* Close Tabs to the Right */}
      <button
        type="button"
        onClick={() => {
          onCloseTabsToRight(tabId)
          onClose()
        }}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
      >
        <ArrowRightToLine className="w-3.5 h-3.5 text-zinc-400" />
        <span>{isZh ? '关闭右侧所有标签' : 'Close Tabs to the Right'}</span>
      </button>

      {/* Reopen Closed Tab */}
      <button
        type="button"
        disabled={!canReopen}
        onClick={() => {
          onReopenClosedTab()
          onClose()
        }}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
          <span>{isZh ? '重新打开已关闭标签' : 'Reopen Closed Tab'}</span>
        </span>
        <span className="text-[10px] font-mono text-zinc-500">Ctrl+Shift+T</span>
      </button>

      <div className="h-px bg-zinc-800/60 my-1" />

      {/* Rename */}
      {onRename && (
        <button
          type="button"
          onClick={() => {
            onRename(tabId)
            onClose()
          }}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
        >
          <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
          <span>{isZh ? '重命名' : 'Rename'}</span>
        </button>
      )}

      {/* Put into Map / Show in Map */}
      {onShowInMap && (
        <button
          type="button"
          onClick={() => {
            onShowInMap()
            onClose()
          }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-orange-300 hover:bg-orange-950/30 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-orange-400" />
            <span>{isZh ? '放入地图' : 'Add to Map'}</span>
          </span>
          <span className="text-[10px] font-mono text-orange-500/70">Ctrl+M</span>
        </button>
      )}

      {/* Copy Session ID */}
      <button
        type="button"
        onClick={handleCopyId}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400">{isZh ? '已复制会话 ID' : 'Copied Session ID'}</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5 text-zinc-400" />
            <span>{isZh ? '复制会话 ID' : 'Copy Session ID'}</span>
          </>
        )}
      </button>
    </div>
  )
}
