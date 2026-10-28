import { useState, useEffect, useRef, useMemo } from 'react'
import {
  X,
  Plus,
  Check,
} from 'lucide-react'
import type { Message, Project, Session, SessionStatusPayload } from '../../types/opencode'
import { useI18n } from '../../utils/i18n'
import { TabContextMenu } from './TabContextMenu'
import type { SettingsTab } from '../settings/SettingsModal'
import { resolveSessionProject } from '../../utils/session-workspace'
import { getStoredTabTitles } from '../../utils/tab-persistence'

interface HeaderProps {
  projects?: Project[]
  sessions: Session[]
  openTabIds: string[]
  activeSessionId: string | null
  activeSession?: Session | null
  sessionStatus?: SessionStatusPayload
  /** False until the daemon run map answers. Hide idle and retry chrome. */
  runKnown?: boolean
  messages?: Message[]
  unreadSessionIds?: string[]
  onSelectTab: (sessionId: string) => void
  onCloseTab: (sessionId: string) => void
  onCloseOtherTabs?: (sessionId: string) => void
  onCloseTabsToRight?: (sessionId: string) => void
  onReopenClosedTab?: () => void
  canReopenClosedTab?: boolean
  onNewSession: () => void
  isSidebarOpen?: boolean
  onToggleSidebar?: () => void
  onToggleMap?: () => void
  onOpenMapAndLocate?: (sessionId?: string) => void
  onAddSessionToMap?: (sessionId: string) => void
  onOpenSearch?: () => void
  onToggleZenMode?: () => void
  zenShortcutLabel?: string
  /** Returns full session JSON string for the active session */
  onGetSessionJson?: () => Promise<string>
  onUpdateSessionTitle?: (sessionId: string, newTitle: string) => void
  onShowInMap?: (sessionId: string) => void
  onOpenSettings?: (tab?: SettingsTab) => void
  onOpenModelRouter?: () => void
  onOpenRelayHub?: () => void
  onDaemonRestored?: () => void
  onDaemonLost?: () => void
}

export function Header({
  projects = [],
  sessions,
  openTabIds,
  activeSessionId,
  unreadSessionIds,
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

  return (
    <header className="h-12 border-b border-[#24272b] bg-[#0f1115] flex items-center justify-between px-2 gap-2 select-none shrink-0">
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

            return (
              <div
                key={tabId}
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
                className={`group flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-t-md cursor-pointer border-t-2 transition-all min-w-[50px] w-auto ${tabWidthClass} ${
                  isActive
                    ? 'bg-[#16181d] text-[#e6edf3] border-t-orange-500 font-medium border-x border-[#272a30] shadow-sm'
                    : 'bg-[#121418]/80 text-[#8b949e] border-t-transparent hover:bg-[#181b20] hover:text-[#c9d1d9] border-x border-[#1a1d24]'
                }`}
              >
                {/* Project / Folder 2-letter icon badge (e.g. OB, AP, AI) - Click to copy session ID */}
                <div className="relative inline-flex items-center shrink-0">
                  <span
                    onClick={(e) => handleCopySessionId(e, tabId, sessionIdToCopy)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`min-w-[18px] h-3.5 px-0.5 shrink-0 rounded text-[9px] font-bold font-mono tracking-tight flex items-center justify-center select-none shadow-sm cursor-pointer transition-all ${
                      isCopied
                        ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                        : 'bg-amber-950/80 text-amber-400 border border-amber-800/40 hover:brightness-125 hover:border-amber-600/80 active:scale-95'
                    }`}
                    title={
                      isZh
                        ? `${projectBadge ? `所属工程: ${projectBadge.name}\n` : ''}点击复制会话ID: ${sessionIdToCopy}`
                        : `${projectBadge ? `Project: ${projectBadge.name}\n` : ''}Click to copy session ID: ${sessionIdToCopy}`
                    }
                  >
                    {isCopied ? <Check className="w-2.5 h-2.5 text-emerald-300 stroke-[2.5]" /> : tabBadge}
                  </span>
                  {isCopied && (
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#16181f]/95 text-emerald-400 text-[10px] font-medium rounded-md shadow-xl border border-emerald-500/60 whitespace-nowrap z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-1">
                      {isZh ? '复制session id成功' : 'Session ID copied'}
                    </span>
                  )}
                </div>

                {/* Unread marker (blue dot) */}
                {!isDraft && Boolean(unreadSessionIds?.includes(tabId)) && (
                  <span
                    className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] ring-1 ring-blue-400/50 shrink-0 animate-pulse"
                    title={isZh ? '新消息未读' : 'Unread response'}
                  />
                )}

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
                    className="bg-[#0f1115] text-[#e6edf3] border border-orange-500/80 rounded px-1.5 py-0.5 text-xs outline-none min-w-[70px] max-w-[180px] focus:ring-1 focus:ring-orange-500/50"
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
            className="p-1.5 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1d22] rounded transition-colors shrink-0 ml-0.5"
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
