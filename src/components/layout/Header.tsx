import { useState, useEffect, useRef, useMemo } from 'react'
import {
  X,
  Plus,
  Check,
} from 'lucide-react'
import type { Project, Session } from '../../types/opencode'
import { useI18n } from '../../utils/i18n'
import { usePreferences } from '../../utils/preferences'
import { TabContextMenu } from './TabContextMenu'
import { resolveSessionProject } from '../../utils/session-workspace'
import { getStoredTabTitles } from '../../utils/tab-persistence'
import { AntigravityRunningIndicator, SessionUnreadDot } from '../common/SessionStatusIndicator'
import { reorderTabIds, calculateDropPosition, type DropPosition } from '../../utils/tab-reorder'

interface HeaderProps {
  projects?: Project[]
  sessions: Session[]
  openTabIds: string[]
  activeSessionId: string | null
  unreadSessionIds?: string[]
  busySessionIds?: string[]
  onSelectTab: (sessionId: string) => void
  onCloseTab: (sessionId: string) => void
  onCloseOtherTabs?: (sessionId: string) => void
  onCloseTabsToRight?: (sessionId: string) => void
  onReopenClosedTab?: () => void
  canReopenClosedTab?: boolean
  onNewSession: () => void
  onToggleMap?: () => void
  onUpdateSessionTitle?: (sessionId: string, newTitle: string) => void
  onShowInMap?: (sessionId: string) => void
  onReorderTabs?: (newTabIds: string[]) => void
}

export function Header({
  projects = [],
  sessions,
  openTabIds,
  activeSessionId,
  unreadSessionIds,
  busySessionIds = [],
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onReopenClosedTab,
  canReopenClosedTab,
  onNewSession,
  onToggleMap,
  onUpdateSessionTitle,
  onShowInMap,
  onReorderTabs,
}: HeaderProps) {
  const { lang, t } = useI18n()
  const isZh = lang.startsWith('zh')
  const cachedTitles = useMemo(() => getStoredTabTitles(), [openTabIds, sessions])

  const [contextMenu, setContextMenu] = useState<{
    tabId: string
    title: string
    x: number
    y: number
  } | null>(null)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [copiedTabId, setCopiedTabId] = useState<string | null>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Drag and drop tab reordering state
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    tabId: string
    position: DropPosition
  } | null>(null)

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    if (editingTabId) {
      e.preventDefault()
      return
    }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tabId)
    e.dataTransfer.setData('application/x-opencode-tab', tabId)
    setDraggedTabId(tabId)
  }

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!draggedTabId || draggedTabId === tabId) return

    const rect = e.currentTarget.getBoundingClientRect()
    const position = calculateDropPosition(e.clientX, rect)
    if (!dropTarget || dropTarget.tabId !== tabId || dropTarget.position !== position) {
      setDropTarget({ tabId, position })
    }
  }

  const handleDragLeave = (e: React.DragEvent, tabId: string) => {
    const related = e.relatedTarget as Node | null
    if (related && e.currentTarget.contains(related)) {
      return
    }
    if (dropTarget?.tabId === tabId) {
      setDropTarget(null)
    }
  }

  const handleDrop = (e: React.DragEvent, tabId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedTabId && draggedTabId !== tabId && onReorderTabs) {
      const rect = e.currentTarget.getBoundingClientRect()
      const position = calculateDropPosition(e.clientX, rect)
      const next = reorderTabIds(openTabIds, draggedTabId, tabId, position)
      onReorderTabs(next)
    }
    setDraggedTabId(null)
    setDropTarget(null)
  }

  const handleDragEnd = () => {
    setDraggedTabId(null)
    setDropTarget(null)
  }

  const handleEndSlotDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedTabId && dropTarget?.tabId !== '__end__') {
      setDropTarget({ tabId: '__end__', position: 'after' })
    }
  }

  const handleEndSlotDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedTabId && onReorderTabs && openTabIds.length > 0) {
      const lastTabId = openTabIds[openTabIds.length - 1]
      if (draggedTabId !== lastTabId) {
        const next = reorderTabIds(openTabIds, draggedTabId, lastTabId, 'after')
        onReorderTabs(next)
      }
    }
    setDraggedTabId(null)
    setDropTarget(null)
  }

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const handleCopySessionId = async (
    e: React.MouseEvent,
    tabId: string,
    sessionId: string
  ) => {
    e.stopPropagation()
    e.preventDefault()
    let copied = false
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(sessionId)
        copied = true
      }
    } catch {
      copied = false
    }

    if (!copied) {
      try {
        const textArea = document.createElement('textarea')
        textArea.value = sessionId
        textArea.style.position = 'fixed'
        textArea.style.left = '-9999px'
        textArea.style.top = '-9999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        copied = document.execCommand('copy')
        document.body.removeChild(textArea)
      } catch {
        copied = false
      }
    }

    setCopiedTabId(tabId)
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current)
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopiedTabId(null)
    }, 2000)

    window.dispatchEvent(
      new CustomEvent('opencode-toast', {
        detail: { message: isZh ? '复制session id成功' : 'Session ID copied' },
      })
    )
  }
  useEffect(() => {
    setEditingTabId(null)
  }, [activeSessionId])

  const { prefs } = usePreferences()
  const isStealthActive = Boolean(prefs.translucentUiChrome ?? prefs.translucentPromptInput) && !contextMenu

  return (
    <header className={`h-12 border-b border-[#1f1f2c] bg-[#0f0f15] flex items-center justify-between px-2 gap-2 select-none shrink-0 ${
      isStealthActive ? 'opacity-25 hover:opacity-100 focus-within:opacity-100 transition-all duration-300' : ''
    }`}>
      {/* Multi-Session Tabs */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto no-scrollbar">
        {/* Tab Items */}
        <div
          onWheel={(e) => {
            if (e.deltaY !== 0 && e.currentTarget) {
              e.currentTarget.scrollLeft += e.deltaY
            }
          }}
          onDoubleClick={(e) => {
            if (e.target === e.currentTarget) {
              onNewSession()
            }
          }}
          className="flex items-center gap-1 overflow-x-auto no-scrollbar"
        >
          {openTabIds.map((tabId) => {
            const isDraft = tabId === '__draft__'
            const session = isDraft ? null : sessions.find((s) => s.id === tabId)
            const isActive = activeSessionId === tabId
            const cachedInfo = !isDraft ? cachedTitles[tabId] : null
            const rawTitle = isDraft
              ? null
              : ((session?.title && session.title.trim()) || (cachedInfo?.title && cachedInfo.title.trim()))
            const title = isDraft
              ? (isZh ? '新会话' : 'New session')
              : (rawTitle || (isZh ? '正在加载…' : 'Loading…'))
            const effectiveSession =
              session ||
              (cachedInfo
                ? ({
                    id: tabId,
                    directory: cachedInfo.directory,
                    projectID: cachedInfo.projectID,
                  } as Session)
                : null)
            const projectBadge = effectiveSession ? resolveSessionProject(effectiveSession, projects) : null
            const tabBadge = isDraft ? '+' : (projectBadge?.abbreviation || 'OP')
            const isEditing = !isDraft && editingTabId === tabId
            const sessionIdToCopy = isDraft ? 'draft' : (session?.id || tabId)
            const isCopied = copiedTabId === tabId
            const isUnread = !isDraft && Boolean(unreadSessionIds?.includes(tabId))
            const isRunning = !isDraft && Boolean(busySessionIds?.includes(tabId))

            const handleCommitTitle = () => {
              const trimmed = editingTitle.trim()
              if (trimmed && trimmed !== title) {
                onUpdateSessionTitle?.(tabId, trimmed)
              }
              setEditingTabId(null)
            }

            // Dynamic adaptive sizing: short titles take only space needed; long titles expand gracefully; active tab prioritized
            const titleLen = title.length
            const tabWidthClass = isActive
              ? 'max-w-[280px] shrink-0'
              : titleLen <= 5
              ? 'max-w-[130px] shrink'
              : titleLen <= 12
              ? 'max-w-[185px] shrink'
              : 'max-w-[240px] shrink'

            const isBeingDragged = draggedTabId === tabId
            const isTarget = dropTarget?.tabId === tabId
            const dropPos = isTarget ? dropTarget.position : null

            const dropIndicatorClasses =
              dropPos === 'before'
                ? 'relative before:absolute before:-left-[3px] before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-full before:bg-sky-400 before:shadow-[0_0_8px_rgba(56,189,248,0.9)] before:z-30'
                : dropPos === 'after'
                ? 'relative after:absolute after:-right-[3px] after:top-1.5 after:bottom-1.5 after:w-1 after:rounded-full after:bg-sky-400 after:shadow-[0_0_8px_rgba(56,189,248,0.9)] after:z-30'
                : ''

            return (
              <div
                key={tabId}
                draggable={!isEditing}
                onDragStart={(e) => handleDragStart(e, tabId)}
                onDragOver={(e) => handleDragOver(e, tabId)}
                onDragLeave={(e) => handleDragLeave(e, tabId)}
                onDrop={(e) => handleDrop(e, tabId)}
                onDragEnd={handleDragEnd}
                onClick={() => {
                  if (isActive && !isDraft) {
                    setEditingTabId(tabId)
                    setEditingTitle(title)
                  } else {
                    onSelectTab(tabId)
                  }
                }}
                onContextMenu={(e) => {
                  if (isDraft) return
                  e.preventDefault()
                  e.stopPropagation()
                  setContextMenu({
                    tabId,
                    title,
                    x: e.clientX,
                    y: e.clientY,
                  })
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                    e.stopPropagation()
                    onCloseTab(tabId)
                  }
                }}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                  }
                }}
                className={`group flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-t-md border-t-2 transition-all min-w-[50px] w-auto ${tabWidthClass} ${dropIndicatorClasses} ${
                  isBeingDragged
                    ? 'opacity-35 scale-[0.98] ring-1 ring-sky-500/40 cursor-grabbing'
                    : isTarget
                    ? 'bg-sky-950/40 text-sky-200'
                    : ''
                } ${
                  isActive
                    ? 'bg-[#181824] text-[#f1f5f9] border-t-sky-400 font-medium border-x border-[#262638] shadow-sm cursor-grab active:cursor-grabbing'
                    : 'bg-[#12121a]/80 text-zinc-400 border-t-transparent hover:bg-[#161622] hover:text-zinc-200 border-x border-[#1c1c2a] cursor-grab active:cursor-grabbing'
                }`}
              >
                {/* Project / Folder 2-letter icon badge (e.g. OB, AP, AI) - Swaps with Running Indicator (Image 2) or Unread Blue Dot */}
                <div className="relative inline-flex items-center shrink-0">
                  <span
                    onClick={(e) => handleCopySessionId(e, tabId, sessionIdToCopy)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`min-w-[18px] h-3.5 px-0.5 shrink-0 rounded text-[9px] font-bold font-mono tracking-tight flex items-center justify-center select-none shadow-sm cursor-pointer transition-all ${
                      isCopied
                        ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                        : isRunning
                        ? 'bg-sky-950/40 text-sky-400 border border-sky-500/40 shadow-[0_0_8px_rgba(56,189,248,0.2)]'
                        : isUnread
                        ? 'bg-sky-950/30 text-sky-400 border border-sky-500/30'
                        : 'bg-zinc-800/90 text-zinc-300 border border-zinc-700/60 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/80 active:scale-95'
                    }`}
                    title={
                      isCopied
                        ? (isZh ? '复制session id成功' : 'Session ID copied')
                        : isRunning
                        ? (isZh ? '正在进行中… (点击复制会话ID)' : 'In progress… (Click to copy ID)')
                        : isUnread
                        ? (isZh ? '新消息未读 (点击切换或复制会话ID)' : 'Unread response (Click to view or copy ID)')
                        : isZh
                        ? `${projectBadge ? `所属工程: ${projectBadge.name}\n` : ''}点击复制会话ID: ${sessionIdToCopy}`
                        : `${projectBadge ? `Project: ${projectBadge.name}\n` : ''}Click to copy session ID: ${sessionIdToCopy}`
                    }
                  >
                    {isCopied ? (
                      <Check className="w-2.5 h-2.5 text-emerald-300 stroke-[2.5]" />
                    ) : isRunning ? (
                      <AntigravityRunningIndicator className="w-full h-full flex items-center justify-center" />
                    ) : isUnread ? (
                      <SessionUnreadDot />
                    ) : (
                      tabBadge
                    )}
                  </span>
                  {isCopied && (
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#16181f]/95 text-emerald-400 text-[10px] font-medium rounded-md shadow-xl border border-emerald-500/60 whitespace-nowrap z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-1">
                      {isZh ? '复制session id成功' : 'Session ID copied'}
                    </span>
                  )}
                </div>

                {isEditing ? (
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing || e.keyCode === 229) return
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        e.stopPropagation()
                        handleCommitTitle()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        e.stopPropagation()
                        setEditingTabId(null)
                      }
                    }}
                    onBlur={handleCommitTitle}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    autoFocus
                    className="bg-[#0f1115] text-[#e6edf3] border border-zinc-600 focus:border-sky-400 rounded px-1.5 py-0.5 text-xs outline-none min-w-[70px] max-w-[180px] focus:ring-1 focus:ring-sky-400/30"
                  />
                ) : (
                  <span
                    className="truncate"
                    title={title}
                    onClick={(e) => {
                      if (isActive) {
                        e.stopPropagation()
                        setEditingTabId(tabId)
                        setEditingTitle(title)
                      }
                    }}
                  >
                    {title}
                  </span>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tabId)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 hover:bg-zinc-800 rounded transition-opacity shrink-0 ml-0.5"
                  title={isActive ? `${t.header.closeTab} (Ctrl+W)` : t.header.closeTab}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}

          <button
            onClick={onNewSession}
            onDragOver={handleEndSlotDragOver}
            onDrop={handleEndSlotDrop}
            className={`p-1.5 rounded transition-all shrink-0 ml-0.5 cursor-pointer ${
              dropTarget?.tabId === '__end__'
                ? 'text-sky-300 bg-sky-950/60 ring-1 ring-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.4)]'
                : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1d22]'
            }`}
            title={t.header.newTab}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tab Right-Click Context Menu */}
      {contextMenu && (
        <TabContextMenu
          tabId={contextMenu.tabId}
          sessionTitle={contextMenu.title}
          x={contextMenu.x}
          y={contextMenu.y}
          unreadSessionIds={unreadSessionIds}
          onClose={() => setContextMenu(null)}
          onCloseTab={onCloseTab}
          onCloseOtherTabs={onCloseOtherTabs || (() => {})}
          onCloseTabsToRight={onCloseTabsToRight || (() => {})}
          onReopenClosedTab={onReopenClosedTab || (() => {})}
          canReopen={Boolean(canReopenClosedTab)}
          onRename={(targetId) => {
            const target = sessions.find((s) => s.id === targetId)
            setEditingTabId(targetId)
            setEditingTitle(target?.title || cachedTitles[targetId]?.title || '')
          }}
          onShowInMap={() => {
            if (onShowInMap) {
              onShowInMap(contextMenu.tabId)
            } else if (onToggleMap) {
              onToggleMap()
            }
          }}
        />
      )}
    </header>
  )
}
