import { useState, useEffect, useRef, useMemo } from 'react'
import {
  PanelLeftClose,
  Columns3,
  PanelLeftOpen,
  ArrowLeft,
  ArrowRight,
  History,
  Clock,
  Search,
  Pin,
  PinOff,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Folder,
  Settings,
  HelpCircle,
  Trash2,
  Edit3,
  MapPin,
  Copy,
  Check,
  Bookmark,
  Plus,
  SlidersHorizontal,
  Archive,
  ArchiveRestore,
  GripVertical,
  PanelTopClose,
  PanelTopOpen,
  FileDown,
  FileText,
} from 'lucide-react'
import type { Project, Session, Message, SessionStatusPayload, TodoItem } from '../../types/opencode'
import type { SessionGroup } from '../../hooks/useSessions'
import type { SettingsTab } from '../settings/SettingsModal'
import { TokenStatsWidget } from './TokenStatsWidget'
import { RelayHubDropdown } from './RelayHubDropdown'
import { ShortcutMenu } from './ShortcutMenu'
import { TodoButton } from '../chat/TodoButton'
import { useDaemonHeartbeat } from '../../utils/daemon-heartbeat'
import { api, matchCanonicalWorkspace } from '../../services/api'
import { exportSessionToMarkdown, extractSessionPrompts } from '../../utils/export-markdown'
import { useI18n } from '../../utils/i18n'
import { usePreferences } from '../../utils/preferences'
import { SessionPreviewPopover } from '../search/SessionPreviewPopover'
import {
  AntigravityRunningIndicator,
  SessionUnreadDot,
  SessionTrailingIndicator,
} from '../common/SessionStatusIndicator'
import {
  getPinnedSessionIds,
  togglePinSessionId,
  isSessionPinned,
  reorderPinnedSessionIds,
  sortProjectsByLatestActivity,
} from '../../utils/pinning'
import {
  getArchivedSessionIds,
  archiveSessionId,
  unarchiveSessionId,
  toggleArchiveSessionId,
  isSessionArchived,
} from '../../utils/archiving'
import {
  doesSessionBelongToProject,
  formatCompactTime,
  DEFAULT_FOLDER_LIMIT,
  getVisibleSessions,
  calculateNextLimit,
} from '../../utils/sidebar-helpers'
import { isSessionUnread, markSessionUnread, markSessionRead } from '../../utils/session-unread'

interface SidebarProps {
  isOpen?: boolean
  projects: Project[]
  selectedProjectId: string | null
  onSelectProject: (id: string | null) => void
  groupedSessions: SessionGroup[]
  sessions?: Session[]
  activeSessionId: string | null
  activeSession?: Session | null
  messages?: Message[]
  todos?: TodoItem[] | null
  sessionStatus?: SessionStatusPayload
  runKnown?: boolean
  unreadSessionIds?: string[]
  busySessionIds?: string[]
  onSelectSession: (id: string) => void
  onNewSession: (directory?: string) => void
  onDeleteSession: (id: string) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  onOpenSettings: (tab?: SettingsTab) => void
  onOpenSearch?: () => void
  onOpenSessionBoard?: () => void
  onOpenScheduledTasks?: () => void
  onOpenBackgroundTasks?: () => void
  onOpenSubagentTopology?: () => void
  onToggleSidebar?: () => void
  canGoBack?: boolean
  canGoForward?: boolean
  onHistoryBack?: () => void
  onHistoryForward?: () => void
  onUpdateSessionTitle?: (sessionId: string, newTitle: string) => void
  onShowInMap?: (sessionId: string) => void
  onOpenMapAndLocate?: (sessionId?: string) => void
  onAddSessionToMap?: (sessionId: string) => void
  onOpenModelRouter?: () => void
  onOpenRelayHub?: () => void
  onGetSessionJson?: () => Promise<string>
  onToggleZenMode?: () => void
  onOpenFind?: () => void
  isHeaderVisible?: boolean
  onToggleHeader?: () => void
  onDaemonRestored?: () => void
  onDaemonLost?: () => void
}

function getProjectDisplayName(proj?: Project | null): string {
  if (!proj) return 'All Projects'
  if (proj.name) return proj.name
  if (proj.worktree && proj.worktree !== '/') {
    const parts = proj.worktree.split('/').filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }
  return proj.id || 'Project'
}

export function Sidebar({
  isOpen = true,
  projects,
  selectedProjectId,
  onSelectProject,
  sessions = [],
  activeSessionId,
  activeSession,
  messages = [],
  todos,
  sessionStatus,
  runKnown = true,
  unreadSessionIds,
  busySessionIds = [],
  onSelectSession,
  onNewSession,
  onDeleteSession,
  searchQuery,
  onSearchChange,
  onOpenSettings,
  onOpenSearch,
  onOpenSessionBoard,
  onOpenScheduledTasks,
  onOpenBackgroundTasks,
  onOpenSubagentTopology,
  onToggleSidebar,
  canGoBack = false,
  canGoForward = false,
  onHistoryBack,
  onHistoryForward,
  onUpdateSessionTitle,
  onShowInMap,
  onOpenMapAndLocate,
  onAddSessionToMap,
  onOpenModelRouter,
  onOpenRelayHub,
  onGetSessionJson,
  onToggleZenMode,
  onOpenFind,
  isHeaderVisible = true,
  onToggleHeader,
  onDaemonRestored,
  onDaemonLost,
}: SidebarProps) {
  const { lang } = useI18n()
  const isZh = lang === 'zh-CN'
  const { prefs } = usePreferences()

  // Diagnostic state monitoring for AI inspection (replacing removed visual status dots)
  const { state: daemonState, attempt: daemonAttempt } = useDaemonHeartbeat({
    onRestored: onDaemonRestored,
    onLost: onDaemonLost,
  })

  useEffect(() => {
    const diag = {
      timestamp: new Date().toISOString(),
      daemon: { state: daemonState, attempt: daemonAttempt },
      session: { status: sessionStatus?.type || 'idle', runKnown },
      loopback: '127.0.0.1 (hardened isolated loopback)',
    }
    try {
      ;(window as any).__ocCompanionDiagnostics = diag
    } catch {}
    console.log('[Companion:Diagnostics]', JSON.stringify(diag))
  }, [daemonState, daemonAttempt, sessionStatus, runKnown])

  // Pinned & Archived session IDs state
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => getPinnedSessionIds())
  const [archivedIds, setArchivedIds] = useState<string[]>(() => getArchivedSessionIds())
  const [previewTarget, setPreviewTarget] = useState<{ session: Session; mouseX: number; mouseY: number } | null>(null)

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'opencode_pinned_sessions') {
        setPinnedIds(getPinnedSessionIds())
      } else if (e.key === 'opencode_archived_sessions') {
        setArchivedIds(getArchivedSessionIds())
      }
    }
    const handlePinnedUpdate = () => setPinnedIds(getPinnedSessionIds())
    const handleArchivedUpdate = () => setArchivedIds(getArchivedSessionIds())

    window.addEventListener('storage', handleStorage)
    window.addEventListener('opencode_pinned_sessions_updated', handlePinnedUpdate)
    window.addEventListener('opencode_archived_sessions_updated', handleArchivedUpdate)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('opencode_pinned_sessions_updated', handlePinnedUpdate)
      window.removeEventListener('opencode_archived_sessions_updated', handleArchivedUpdate)
    }
  }, [])

  // Accordion expansion state for project folders (default all open)
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = { _pinned: true, _archived: false }
    projects.forEach((p) => {
      initial[p.id] = true
    })
    return initial
  })

  // Progressive disclosure limits for folder sessions (default 7, +5 on each "See more")
  const [folderLimits, setFolderLimits] = useState<Record<string, number>>({})

  const handleSeeMore = (folderKey: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setFolderLimits((prev) => ({
      ...prev,
      [folderKey]: calculateNextLimit(prev[folderKey] ?? DEFAULT_FOLDER_LIMIT),
    }))
  }

  // Renaming state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // Drag-and-drop state for pinned sessions reordering
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null)
  const [dragOverSessionId, setDragOverSessionId] = useState<string | null>(null)

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    sessionId: string
    title: string
    x: number
    y: number
  } | null>(null)
  const [copiedId, setCopiedId] = useState(false)
  const [copiedMd, setCopiedMd] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Filter canonical projects
  const canonicalProjects = useMemo(() => {
    return projects.filter(
      (p) => p.id !== 'global' && Boolean(matchCanonicalWorkspace(p.worktree, p.name))
    )
  }, [projects])

  // Map of sessions for quick lookup
  const sessionMap = useMemo(() => {
    const map = new Map<string, Session>()
    sessions.forEach((s) => map.set(s.id, s))
    return map
  }, [sessions])

  // Pinned sessions list (strictly excluding archived; filtered by search query if any)
  const pinnedSessions = useMemo(() => {
    const list = pinnedIds
      .filter((id) => !archivedIds.includes(id))
      .map((id) => sessionMap.get(id))
      .filter((s): s is Session => Boolean(s))
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter(
      (s) =>
        (s.title || '').toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
    )
  }, [pinnedIds, archivedIds, sessionMap, searchQuery])

  // Archived sessions list
  const archivedSessions = useMemo(() => {
    return archivedIds
      .map((id) => sessionMap.get(id))
      .filter((s): s is Session => Boolean(s))
  }, [archivedIds, sessionMap])

  // Filter sessions by search query if any (strictly excluding archived)
  const filteredSessions = useMemo(() => {
    const activeNonArchived = sessions.filter((s) => !archivedIds.includes(s.id))
    if (!searchQuery.trim()) return activeNonArchived
    const q = searchQuery.toLowerCase()
    return activeNonArchived.filter(
      (s) =>
        (s.title || '').toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
    )
  }, [sessions, archivedIds, searchQuery])

  // Sessions for project folders in accordion: strictly exclude pinned sessions so pinned sessions are not duplicated
  const unpinnedFilteredSessions = useMemo(() => {
    const pinnedSet = new Set(pinnedIds)
    return filteredSessions.filter((s) => !pinnedSet.has(s.id))
  }, [filteredSessions, pinnedIds])

  // Map sessions into projects (strictly unpinned sessions, sorted by latest activity descending)
  const projectSessionsMap = useMemo(() => {
    const map = new Map<string, Session[]>()
    canonicalProjects.forEach((proj) => {
      const matched = unpinnedFilteredSessions.filter((sess) =>
        doesSessionBelongToProject(sess, proj)
      )
      // Sort sessions within project by timestamp descending
      matched.sort((a, b) => {
        const timeA = a.time?.updated || a.time?.created || 0
        const timeB = b.time?.updated || b.time?.created || 0
        return timeB - timeA
      })
      map.set(proj.id, matched)
    })
    return map
  }, [canonicalProjects, unpinnedFilteredSessions])

  // Sort project folders by the timestamp of their latest visible unpinned session (descending)
  const sortedCanonicalProjects = useMemo(() => {
    return sortProjectsByLatestActivity<Project, Session>(
      canonicalProjects,
      projectSessionsMap,
      (p) => matchCanonicalWorkspace(p.worktree, p.name)?.name || getProjectDisplayName(p)
    )
  }, [canonicalProjects, projectSessionsMap])

  useEffect(() => {
    setEditingSessionId(null)
  }, [activeSessionId])

  // Dismiss context menu on outside click or Esc
  useEffect(() => {
    if (!contextMenu) return
    const handleDown = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') {
        setContextMenu(null)
      } else if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    window.addEventListener('mousedown', handleDown, true)
    window.addEventListener('keydown', handleDown, true)
    return () => {
      window.removeEventListener('mousedown', handleDown, true)
      window.removeEventListener('keydown', handleDown, true)
    }
  }, [contextMenu])

  const toggleProjectExpand = (projId: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projId]: !prev[projId],
    }))
  }

  const handleTogglePin = (sessionId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const res = togglePinSessionId(sessionId)
    setPinnedIds(res.pinnedIds)
  }

  const handleToggleArchive = (sessionId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const res = toggleArchiveSessionId(sessionId)
    setArchivedIds(res.archivedIds)
    setPinnedIds(getPinnedSessionIds())
  }

  const handleArchive = (sessionId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const res = archiveSessionId(sessionId)
    setArchivedIds(res.archivedIds)
    setPinnedIds(getPinnedSessionIds())
  }

  const handleUnarchive = (sessionId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const res = unarchiveSessionId(sessionId)
    setArchivedIds(res.archivedIds)
  }

  const handleCommitTitle = () => {
    const trimmed = editingTitle.trim()
    if (editingSessionId && trimmed) {
      const current = sessionMap.get(editingSessionId)
      if (current && trimmed !== current.title) {
        onUpdateSessionTitle?.(editingSessionId, trimmed)
      }
    }
    setEditingSessionId(null)
  }

  // Find project name for a session
  const getSessionProjectName = (session: Session): string => {
    for (const proj of canonicalProjects) {
      if (doesSessionBelongToProject(session, proj)) {
        const canonical = matchCanonicalWorkspace(proj.worktree, proj.name)
        return canonical?.name || getProjectDisplayName(proj)
      }
    }
    return 'APISpace'
  }

  const isStealthActive = Boolean(prefs.translucentUiChrome ?? prefs.translucentPromptInput) && !contextMenu

  if (isOpen === false) {
    return (
      <aside className={`w-12 h-full flex flex-col items-center py-2 shrink-0 border-r border-[#1f1f2c] bg-[#0f0f15] text-[#c9d1d9] select-none justify-between ${
        isStealthActive ? 'opacity-25 hover:opacity-100 focus-within:opacity-100 transition-all duration-300' : ''
      }`}>
        {/* Top: Expand Sidebar Icon + Top Bar Toggle (hidden when collapseNavRailTopButtons is active) */}
        {!prefs.collapseNavRailTopButtons ? (
          <div className="flex flex-col items-center gap-1.5">
            {/* Toggle Sidebar [|] */}
            <button
              type="button"
              onClick={onToggleSidebar}
              className="p-2 rounded-md text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#1f232b] transition-colors cursor-pointer"
              title={isZh ? '展开侧边栏 (Ctrl+B)' : 'Show Sidebar (Ctrl+B)'}
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
            <button type="button" onClick={onOpenSessionBoard}
              className="p-2 rounded-md text-[#8b949e] hover:text-sky-400 hover:bg-[#1f232b]"
              title={isZh ? '会话整理看板 (Ctrl+Shift+A)' : 'Session board (Ctrl+Shift+A)'} aria-label={isZh ? '会话整理看板' : 'Session board'}>
              <Columns3 className="w-4 h-4" />
            </button>

            {/* Toggle Top Bar (Ctrl+Shift+B) */}
            <button
              type="button"
              onClick={onToggleHeader}
              className={`p-2 rounded-md transition-colors cursor-pointer ${
                !isHeaderVisible
                  ? 'text-sky-400 hover:text-sky-300 hover:bg-[#1f232b]'
                  : 'text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#1f232b]'
              }`}
              title={
                isZh
                  ? isHeaderVisible
                    ? '隐藏上方栏 (Ctrl+Shift+B)'
                    : '显示上方栏 (Ctrl+Shift+B)'
                  : isHeaderVisible
                  ? 'Hide Top Bar (Ctrl+Shift+B)'
                  : 'Show Top Bar (Ctrl+Shift+B)'
              }
            >
              {isHeaderVisible ? <PanelTopClose className="w-4 h-4" /> : <PanelTopOpen className="w-4 h-4" />}
            </button>
          </div>
        ) : (
          <div />
        )}

        {/* Bottom Cluster: Todo List + Token Stats + Relay Hub + Three-Dot Tools/Export Menu + Settings */}
        <div className="flex flex-col items-center gap-2">
          {/* Todo List Button (strictly shown only when active session has todos) */}
          {todos && todos.length > 0 && (
            <TodoButton
              todos={todos}
              compact
              placement="right"
            />
          )}

          {/* Token Stats Ring (compact with hover popover) */}
          <TokenStatsWidget
            activeSession={activeSession}
            messages={messages}
            compact
            popoverPlacement="right"
          />

          {/* Relay Hub Billing (compact with hover popover) */}
          <RelayHubDropdown
            onOpenSettings={() => (onOpenRelayHub ? onOpenRelayHub() : onOpenSettings?.('relays'))}
            compact
            popoverPlacement="right"
          />

          <div className="w-6 border-t border-[#21242b] my-0.5" />

          {/* Three-dot Tools & Export Menu (···) directly above Settings */}
          <ShortcutMenu
            activeSession={activeSession}
            activeSessionId={activeSessionId}
            messages={messages}
            onOpenMapAndLocate={onOpenMapAndLocate}
            onAddSessionToMap={onAddSessionToMap}
            onOpenSearch={onOpenSearch}
            onOpenModelRouter={onOpenModelRouter}
            onOpenBackgroundTasks={onOpenBackgroundTasks}
            onOpenSubagentTopology={onOpenSubagentTopology}
            onGetSessionJson={onGetSessionJson}
            onToggleZenMode={onToggleZenMode}
            onOpenFind={onOpenFind}
            isHeaderVisible={isHeaderVisible}
            onToggleHeader={onToggleHeader}
            onToggleSidebar={onToggleSidebar}
            isSidebarOpen={false}
            onOpenSessionBoard={onOpenSessionBoard}
            compact
            popoverPlacement="right-bottom"
          />

          {/* Settings */}
          <button
            type="button"
            onClick={() => onOpenSettings()}
            className="p-2 rounded-md text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#1f232b] transition-colors cursor-pointer"
            title={isZh ? '设置' : 'Settings'}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {previewTarget && (
          <SessionPreviewPopover
            session={previewTarget.session}
            mouseX={previewTarget.mouseX}
            mouseY={previewTarget.mouseY}
            projects={projects}
            onClose={() => setPreviewTarget(null)}
            onSelectSession={(id) => {
              setPreviewTarget(null)
              onSelectSession(id)
            }}
          />
        )}
      </aside>
    )
  }

  return (
    <aside className={`w-64 sm:w-[260px] h-full flex flex-col shrink-0 border-r border-[#1f1f2c] bg-[#0f0f15] text-[#c9d1d9] select-none ${
      isStealthActive ? 'opacity-25 hover:opacity-100 focus-within:opacity-100 transition-all duration-300' : ''
    }`}>
      {/* 1. Top Action Buttons Bar (图4功能 - 并列一行，纯图标，带悬浮说明) */}
      <div className="h-11 px-2.5 flex items-center justify-between border-b border-[#1f1f2c] bg-[#12121a]">
        {/* Left: Sidebar Toggle, Back, Forward */}
        <div className="flex items-center gap-1">
          {/* Toggle Sidebar [|] */}
          <div className="relative group">
            <button
              type="button"
              onClick={onToggleSidebar}
              className="p-1.5 rounded-md text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#1f232b] transition-colors cursor-pointer"
              title={isZh ? '收起侧边栏 (Ctrl+B)' : 'Hide Sidebar (Ctrl+B)'}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
            <div className="absolute left-0 top-full mt-1.5 hidden group-hover:flex items-center gap-1 px-2 py-1 rounded bg-[#1c1f26] border border-[#2d323d] text-[11px] text-[#f0f6fc] whitespace-nowrap z-50 shadow-xl pointer-events-none">
              <span>{isZh ? '收起侧边栏' : 'Hide Sidebar'}</span>
              <kbd className="text-[9px] font-mono text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded">Ctrl+B</kbd>
            </div>
          </div>

          {/* Toggle Top Bar (Ctrl+Shift+B) */}
          <div className="relative group">
            <button
              type="button"
              onClick={onToggleHeader}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                !isHeaderVisible
                  ? 'text-sky-400 hover:text-sky-300 hover:bg-[#1f232b]'
                  : 'text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#1f232b]'
              }`}
              title={
                isZh
                  ? isHeaderVisible
                    ? '隐藏上方栏 (Ctrl+Shift+B)'
                    : '显示上方栏 (Ctrl+Shift+B)'
                  : isHeaderVisible
                  ? 'Hide Top Bar (Ctrl+Shift+B)'
                  : 'Show Top Bar (Ctrl+Shift+B)'
              }
            >
              {isHeaderVisible ? <PanelTopClose className="w-4 h-4" /> : <PanelTopOpen className="w-4 h-4" />}
            </button>
            <div className="absolute left-0 top-full mt-1.5 hidden group-hover:flex items-center gap-1 px-2 py-1 rounded bg-[#1c1f26] border border-[#2d323d] text-[11px] text-[#f0f6fc] whitespace-nowrap z-50 shadow-xl pointer-events-none">
              <span>{isZh ? (isHeaderVisible ? '隐藏上方栏' : '显示上方栏') : (isHeaderVisible ? 'Hide Top Bar' : 'Show Top Bar')}</span>
              <kbd className="text-[9px] font-mono text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded">Ctrl+Shift+B</kbd>
            </div>
          </div>

          {/* History Back (←) */}
          <div className="relative group">
            <button
              type="button"
              onClick={onHistoryBack}
              disabled={!canGoBack}
              className="p-1.5 rounded-md text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#1f232b] disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
              title={isZh ? '后退到上一个会话' : 'Back to previous session'}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="absolute left-0 top-full mt-1.5 hidden group-hover:flex items-center px-2 py-1 rounded bg-[#1c1f26] border border-[#2d323d] text-[11px] text-[#f0f6fc] whitespace-nowrap z-50 shadow-xl pointer-events-none">
              <span>{isZh ? '后退' : 'Back'}</span>
            </div>
          </div>

          {/* History Forward (→) */}
          <div className="relative group">
            <button
              type="button"
              onClick={onHistoryForward}
              disabled={!canGoForward}
              className="p-1.5 rounded-md text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#1f232b] disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
              title={isZh ? '前进到下一个会话' : 'Forward to next session'}
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="absolute left-0 top-full mt-1.5 hidden group-hover:flex items-center px-2 py-1 rounded bg-[#1c1f26] border border-[#2d323d] text-[11px] text-[#f0f6fc] whitespace-nowrap z-50 shadow-xl pointer-events-none">
              <span>{isZh ? '前进' : 'Forward'}</span>
            </div>
          </div>
        </div>

        {/* Right: New Session (+), Conversation History (Ctrl+K), Scheduled Tasks (⏱) */}
        <div className="flex items-center gap-1">
          {/* New Conversation (+) */}
          <div className="relative group">
            <button
              type="button"
              onClick={() => onNewSession()}
              className="p-1.5 rounded-md text-[#8b949e] hover:text-sky-400 hover:bg-[#1f232b] transition-colors cursor-pointer"
              title={isZh ? '新建会话 (Ctrl+N)' : 'New Conversation (Ctrl+N)'}
            >
              <Plus className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-full mt-1.5 hidden group-hover:flex items-center gap-1 px-2 py-1 rounded bg-[#1c1f26] border border-[#2d323d] text-[11px] text-[#f0f6fc] whitespace-nowrap z-50 shadow-xl pointer-events-none">
              <span>{isZh ? '新建对话' : 'New Conversation'}</span>
              <kbd className="text-[9px] font-mono text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded">Ctrl+N</kbd>
            </div>
          </div>

          {/* Conversation History (Clock-arrow / Ctrl+K) */}
          <div className="relative group">
            <button
              type="button"
              onClick={onOpenSearch}
              className="p-1.5 rounded-md text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#1f232b] transition-colors cursor-pointer"
              title={isZh ? '历史记录与搜索 (Ctrl+K)' : 'Conversation History (Ctrl+K)'}
            >
              <History className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-full mt-1.5 hidden group-hover:flex items-center gap-1 px-2 py-1 rounded bg-[#1c1f26] border border-[#2d323d] text-[11px] text-[#f0f6fc] whitespace-nowrap z-50 shadow-xl pointer-events-none">
              <span>{isZh ? '对话历史' : 'Conversation History'}</span>
              <kbd className="text-[9px] font-mono text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded">Ctrl+K</kbd>
            </div>
          </div>

          <button type="button" onClick={onOpenSessionBoard}
            className="p-1.5 rounded-md text-[#8b949e] hover:text-sky-400 hover:bg-[#1f232b] transition-colors"
            title={isZh ? '会话整理看板 (Ctrl+Shift+A)' : 'Session board (Ctrl+Shift+A)'} aria-label={isZh ? '会话整理看板' : 'Session board'}>
            <Columns3 className="w-4 h-4" />
          </button>

          {/* Scheduled Tasks (⏱) */}
          <div className="relative group">
            <button
              type="button"
              onClick={onOpenScheduledTasks}
              className="p-1.5 rounded-md text-[#8b949e] hover:text-sky-400 hover:bg-[#1f232b] transition-colors cursor-pointer"
              title={isZh ? '计划任务调度 (Scheduled Tasks)' : 'Scheduled Tasks'}
            >
              <Clock className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-full mt-1.5 hidden group-hover:flex items-center px-2 py-1 rounded bg-[#1c1f26] border border-[#2d323d] text-[11px] text-[#f0f6fc] whitespace-nowrap z-50 shadow-xl pointer-events-none">
              <span>{isZh ? '计划任务' : 'Scheduled Tasks'}</span>
            </div>
          </div>

          {/* Shortcuts & Tools Menu (···) */}
          <ShortcutMenu
            activeSession={activeSession}
            activeSessionId={activeSessionId}
            messages={messages}
            onOpenMapAndLocate={onOpenMapAndLocate}
            onAddSessionToMap={onAddSessionToMap}
            onOpenSearch={onOpenSearch}
            onOpenModelRouter={onOpenModelRouter}
            onOpenBackgroundTasks={onOpenBackgroundTasks}
            onOpenSubagentTopology={onOpenSubagentTopology}
            onGetSessionJson={onGetSessionJson}
            onToggleZenMode={onToggleZenMode}
            onOpenFind={onOpenFind}
            isHeaderVisible={isHeaderVisible}
            onToggleHeader={onToggleHeader}
            compact
            popoverPlacement="bottom"
          />
        </div>
      </div>

      {/* 2. Compact Search Input Bar */}
      <div className="p-2 border-b border-[#21242b] bg-[#0e1014]">
        <div
          className="relative cursor-pointer group"
          onClick={() => onOpenSearch?.()}
        >
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#656d76] group-hover:text-zinc-300 transition-colors" />
          <input
            id="session-search-input"
            type="text"
            readOnly={Boolean(onOpenSearch)}
            placeholder={isZh ? '搜索会话...' : 'Search conversations...'}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onClick={(e) => {
              if (onOpenSearch) {
                e.preventDefault()
                e.stopPropagation()
                onOpenSearch()
              }
            }}
            onFocus={(e) => {
              if (onOpenSearch) {
                e.target.blur()
                onOpenSearch()
              }
            }}
            className="w-full bg-[#15181d] border border-[#242830] text-xs text-[#e6edf3] pl-8 pr-12 py-1.5 rounded-md placeholder-[#656d76] focus:outline-none focus:border-[#388bfd] cursor-pointer"
          />
          <kbd className="absolute right-2 top-2 px-1 py-0.5 text-[9px] font-mono text-zinc-500 bg-zinc-800/80 border border-zinc-700/60 rounded pointer-events-none group-hover:text-zinc-300 transition-colors">
            Ctrl K
          </kbd>
        </div>
      </div>

      {/* 3. Main Tree Scroll Area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Pinned Conversations (图1) */}
        {pinnedSessions.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-[#8b949e] uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Pin className="w-3 h-3 text-zinc-400 rotate-45" />
                {isZh ? '置顶会话' : 'Pinned Conversations'}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                {pinnedSessions.length}
              </span>
            </div>

            <div className="space-y-1">
              {pinnedSessions.map((session) => {
                const isActive = activeSessionId === session.id
                const projectName = getSessionProjectName(session)
                const timeLabel = formatCompactTime(session.time?.updated || session.time?.created)
                const isDragging = draggingSessionId === session.id
                const isDragOver = dragOverSessionId === session.id && !isDragging
                const safeTitle = (session.title && session.title.trim()) || (isZh ? '未命名会话' : 'Untitled session')

                return (
                  <div
                    key={`pinned-${session.id}`}
                    draggable={editingSessionId !== session.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-opencode-pinned-id', session.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDraggingSessionId(session.id)
                    }}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes('application/x-opencode-pinned-id')) {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        if (dragOverSessionId !== session.id) {
                          setDragOverSessionId(session.id)
                        }
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverSessionId === session.id) {
                        setDragOverSessionId(null)
                      }
                    }}
                    onDrop={(e) => {
                      if (e.dataTransfer.types.includes('application/x-opencode-pinned-id')) {
                        e.preventDefault()
                        const sourceId = e.dataTransfer.getData('application/x-opencode-pinned-id')
                        if (sourceId && sourceId !== session.id) {
                          const nextIds = reorderPinnedSessionIds(sourceId, session.id)
                          setPinnedIds(nextIds)
                        }
                        setDraggingSessionId(null)
                        setDragOverSessionId(null)
                      }
                    }}
                    onDragEnd={() => {
                      setDraggingSessionId(null)
                      setDragOverSessionId(null)
                    }}
                    onClick={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                        e.preventDefault()
                        e.stopPropagation()
                        setPreviewTarget({ session, mouseX: e.clientX, mouseY: e.clientY })
                        return
                      }
                      onSelectSession(session.id)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setContextMenu({
                        sessionId: session.id,
                        title: safeTitle,
                        x: e.clientX,
                        y: e.clientY,
                      })
                    }}
                    className={`group relative flex flex-col px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                      isActive
                        ? 'bg-[#1f202b] text-white border border-transparent shadow-sm'
                        : 'text-[#c9d1d9] hover:bg-[#161920] hover:text-white border border-transparent'
                    } ${isDragging ? 'opacity-40 border-dashed border-sky-500/60' : ''} ${
                      isDragOver ? 'ring-2 ring-sky-500/80 bg-sky-950/20 border-sky-500/60' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span title={isZh ? '拖拽调整置顶顺序' : 'Drag to reorder'} className="shrink-0 flex items-center">
                          <GripVertical
                            className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                          />
                        </span>
                        <span className="truncate flex-1 font-medium text-left" title={safeTitle}>
                          {safeTitle}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <SessionTrailingIndicator
                          isRunning={Boolean(busySessionIds?.includes(session.id))}
                          isUnread={isSessionUnread(session.id, unreadSessionIds || [])}
                          runningTitle={isZh ? '正在进行中…' : 'In progress…'}
                          unreadTitle={isZh ? '新消息未读' : 'Unread'}
                          fallback={<span className="text-[10px] text-zinc-500 font-mono">{timeLabel}</span>}
                        />
                        <button
                          type="button"
                          onClick={(e) => handleArchive(session.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-400 hover:text-zinc-200 rounded transition-opacity cursor-pointer"
                          title={isZh ? '归档会话' : 'Archive session'}
                        >
                          <Archive className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleTogglePin(session.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-400 hover:text-zinc-200 rounded transition-opacity cursor-pointer"
                          title={isZh ? '取消置顶' : 'Unpin'}
                        >
                          <PinOff className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mt-0.5">
                      <Folder className="w-3 h-3 text-zinc-500" />
                      <span className="truncate">{projectName}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Projects Tree Section (可展开和伸缩，图2 & 图3) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-[#8b949e] uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-zinc-400" />
              {isZh ? '工程列表' : 'Projects'}
            </span>
            <div className="flex items-center gap-1 text-zinc-500">
              <button
                type="button"
                onClick={() => onSelectProject(null)}
                className="p-1 hover:text-zinc-200 transition-colors"
                title={isZh ? '全部项目' : 'All Projects'}
              >
                <SlidersHorizontal className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Project Folders Accordion (sorted dynamically by latest unpinned session) */}
          <div className="space-y-1.5">
            {sortedCanonicalProjects.map((proj) => {
              const canonical = matchCanonicalWorkspace(proj.worktree, proj.name)
              const projName = canonical?.name || getProjectDisplayName(proj)
              const isExpanded = expandedProjects[proj.id] ?? true
              const projSessions = projectSessionsMap.get(proj.id) || []
              const isSelectedProject =
                selectedProjectId === proj.id ||
                Boolean(proj.associatedIds && selectedProjectId && proj.associatedIds.includes(selectedProjectId))

              return (
                <div key={proj.id} className="rounded-lg overflow-hidden">
                  {/* Folder Header Row */}
                  <div
                    onClick={() => {
                      toggleProjectExpand(proj.id)
                      onSelectProject(proj.id)
                    }}
                    className={`group flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                      isSelectedProject
                        ? 'bg-[#1a1d24] text-white'
                        : 'text-[#8b949e] hover:bg-[#14161b] hover:text-[#e6edf3]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      )}
                      <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="truncate">{projName}</span>
                      {projSessions.some((s) => busySessionIds?.includes(s.id)) ? (
                        <AntigravityRunningIndicator title={isZh ? '该工程下有正在运行的会话' : 'Sessions running in project'} />
                      ) : projSessions.some((s) => isSessionUnread(s.id, unreadSessionIds || [])) ? (
                        <SessionUnreadDot
                          className="w-1.5 h-1.5 shadow-[0_0_6px_#3b82f6]"
                          title={isZh ? '包含未读会话' : 'Contains unread session'}
                        />
                      ) : null}
                    </div>

                    {/* Right Hover Actions on Project Header */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-zinc-600 font-mono mr-1">
                        {projSessions.length}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onNewSession(proj.worktree)
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-white transition-opacity"
                        title={isZh ? `在 ${projName} 中新建对话` : `New session in ${projName}`}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Nested Sessions (图3) */}
                  {isExpanded && (
                    <div className="pl-5 pr-1 py-1 space-y-1 border-l border-zinc-800/60 ml-3.5 mt-0.5">
                      {projSessions.length === 0 ? (
                        <div className="py-2 text-[11px] text-zinc-600 italic">
                          {isZh ? '暂无会话' : 'No sessions'}
                        </div>
                      ) : (
                        (() => {
                          const currentLimit = folderLimits[proj.id] ?? DEFAULT_FOLDER_LIMIT
                          const { visibleItems, hasMore, remaining, nextStep } = getVisibleSessions(
                            projSessions,
                            currentLimit
                          )

                          return (
                            <>
                              {visibleItems.map((session) => {
                                const isActive = activeSessionId === session.id
                          const isPinned = isSessionPinned(session.id, pinnedIds)
                          const timeLabel = formatCompactTime(session.time?.updated || session.time?.created)
                          const isEditing = editingSessionId === session.id

                          return (
                            <div
                              key={session.id}
                              onClick={(e) => {
                                if (e.ctrlKey || e.metaKey) {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setPreviewTarget({ session, mouseX: e.clientX, mouseY: e.clientY })
                                  return
                                }
                                if (isActive) {
                                  setEditingSessionId(session.id)
                                  setEditingTitle(session.title || '')
                                } else {
                                  onSelectSession(session.id)
                                }
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setContextMenu({
                                  sessionId: session.id,
                                  title: (session.title && session.title.trim()) || (isZh ? '未命名会话' : 'Untitled session'),
                                  x: e.clientX,
                                  y: e.clientY,
                                })
                              }}
                              className={`group relative flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-all ${
                                isActive
                                  ? 'bg-[#1f202b] text-white border border-transparent font-medium'
                                  : 'text-[#8b949e] hover:bg-[#15181e] hover:text-[#c9d1d9] border border-transparent'
                              }`}
                            >
                              {/* Title */}
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
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
                                        setEditingSessionId(null)
                                      }
                                    }}
                                    onBlur={handleCommitTitle}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    autoFocus
                                    className="bg-[#14171d] text-[#f0f6fc] border border-zinc-600 focus:border-sky-400 rounded px-1.5 py-0.5 text-xs outline-none flex-1 min-w-0 focus:ring-1 focus:ring-sky-400/30"
                                  />
                                ) : (
                                  <span
                                    className="truncate text-left"
                                    title={(session.title && session.title.trim()) || (isZh ? '未命名会话' : 'Untitled session')}
                                  >
                                    {(session.title && session.title.trim()) || (isZh ? '未命名会话' : 'Untitled session')}
                                  </span>
                                )}
                              </div>

                              {/* Right: Running indicator / Unread blue dot / Timestamp / Action buttons */}
                              <div className="flex items-center gap-1 shrink-0">
                                <SessionTrailingIndicator
                                  isRunning={Boolean(busySessionIds?.includes(session.id))}
                                  isUnread={isSessionUnread(session.id, unreadSessionIds || [])}
                                  runningTitle={isZh ? '正在进行中…' : 'In progress…'}
                                  unreadTitle={isZh ? '新消息未读' : 'Unread'}
                                  fallback={
                                    <span className={`text-[10px] text-zinc-500 font-mono ${isPinned ? 'hidden' : 'group-hover:hidden'}`}>
                                      {timeLabel}
                                    </span>
                                  }
                                />

                                {/* Pin button on the right (📌) */}
                                <button
                                  type="button"
                                  onClick={(e) => handleTogglePin(session.id, e)}
                                  className={`p-0.5 rounded transition-all cursor-pointer ${
                                    isPinned
                                      ? 'text-zinc-300 opacity-100'
                                      : 'opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-200'
                                  }`}
                                  title={isPinned ? (isZh ? '取消置顶' : 'Unpin') : (isZh ? '置顶此会话' : 'Pin session')}
                                >
                                  <Pin className={`w-3 h-3 ${isPinned ? 'fill-zinc-300' : ''}`} />
                                </button>

                                {/* Archive button on hover */}
                                <button
                                  type="button"
                                  onClick={(e) => handleArchive(session.id, e)}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-500 hover:text-zinc-200 transition-opacity cursor-pointer"
                                  title={isZh ? '归档会话' : 'Archive session'}
                                >
                                  <Archive className="w-3 h-3" />
                                </button>

                                {/* More options button (...) */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setContextMenu({
                                      sessionId: session.id,
                                      title: session.title || (isZh ? '未命名会话' : 'Untitled session'),
                                      x: e.clientX,
                                      y: e.clientY,
                                    })
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-500 hover:text-white transition-opacity"
                                  title={isZh ? '更多操作' : 'More options'}
                                >
                                  <MoreHorizontal className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )
                        })}

                        {/* See more button at the very bottom (default 7, +5 per click) */}
                        {hasMore && (
                          <button
                            type="button"
                            onClick={(e) => handleSeeMore(proj.id, e)}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 mt-1 rounded text-[11px] font-medium text-zinc-400 hover:text-zinc-200 bg-[#161922]/60 hover:bg-[#1f2430] border border-zinc-800/50 hover:border-zinc-700/80 transition-all cursor-pointer group"
                            title={
                              isZh
                                ? `点击展开更多会话 (加载 +${nextStep} 个，还剩 ${remaining} 个)`
                                : `Click to see more sessions (+${nextStep}, ${remaining} left)`
                            }
                          >
                            <div className="flex items-center gap-1.5">
                              <ChevronDown className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 transition-transform group-hover:translate-y-0.5" />
                              <span>{isZh ? '查看更多 (See more)' : 'See more'}</span>
                              <span className="text-[10px] text-zinc-500 font-mono">
                                (+{nextStep})
                              </span>
                            </div>
                            <span className="text-[10px] text-zinc-500 font-mono group-hover:text-zinc-400">
                              {remaining} {isZh ? '个未显示' : 'left'}
                            </span>
                          </button>
                        )}
                      </>
                    )
                  })()
                )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Archived Conversations Section */}
        {archivedSessions.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-zinc-800/60 mt-2">
            <div
              onClick={() => toggleProjectExpand('_archived')}
              className="group flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-medium cursor-pointer text-[#8b949e] hover:bg-[#14161b] hover:text-[#e6edf3] transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                {expandedProjects._archived ? (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                )}
                <Archive className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
                <span className="truncate">{isZh ? '已归档会话' : 'Archived Conversations'}</span>
              </div>
              <span className="text-[10px] text-zinc-600 font-mono">
                {archivedSessions.length}
              </span>
            </div>

            {expandedProjects._archived && (
              <div className="pl-5 pr-1 py-1 space-y-1 border-l border-sky-900/40 ml-3.5 mt-0.5">
                {(() => {
                  const currentLimit = folderLimits['_archived'] ?? DEFAULT_FOLDER_LIMIT
                  const { visibleItems, hasMore, remaining, nextStep } = getVisibleSessions(
                    archivedSessions,
                    currentLimit
                  )

                  return (
                    <>
                      {visibleItems.map((session) => {
                        const isActive = activeSessionId === session.id
                  const timeLabel = formatCompactTime(session.time?.updated || session.time?.created)

                  return (
                    <div
                      key={`archived-${session.id}`}
                      onClick={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                        e.preventDefault()
                        e.stopPropagation()
                        setPreviewTarget({ session, mouseX: e.clientX, mouseY: e.clientY })
                        return
                      }
                      onSelectSession(session.id)
                    }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setContextMenu({
                          sessionId: session.id,
                          title: (session.title && session.title.trim()) || (isZh ? '未命名会话' : 'Untitled session'),
                          x: e.clientX,
                          y: e.clientY,
                        })
                      }}
                      className={`group relative flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-all ${
                        isActive
                          ? 'bg-[#151922] text-sky-200 border border-sky-500/40 font-medium'
                          : 'text-zinc-500 hover:bg-[#15181e] hover:text-zinc-300 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Archive className="w-3 h-3 text-sky-500/60 shrink-0" />
                        <span
                          className="truncate text-left"
                          title={(session.title && session.title.trim()) || (isZh ? '未命名会话' : 'Untitled session')}
                        >
                          {(session.title && session.title.trim()) || (isZh ? '未命名会话' : 'Untitled session')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-zinc-600 font-mono group-hover:hidden">
                          {timeLabel}
                        </span>

                        {/* Unarchive Button */}
                        <button
                          type="button"
                          onClick={(e) => handleUnarchive(session.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-400 hover:text-sky-400 transition-opacity cursor-pointer"
                          title={isZh ? '恢复会话 (取消归档)' : 'Unarchive session'}
                        >
                          <ArchiveRestore className="w-3 h-3" />
                        </button>

                        {/* Delete Permanently Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(isZh ? `确定彻底删除归档会话 "${session.title}" 吗？此操作无法撤销。` : `Permanently delete "${session.title}"?`)) {
                              onDeleteSession(session.id)
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-400 hover:text-rose-400 transition-opacity cursor-pointer"
                          title={isZh ? '彻底删除' : 'Delete permanently'}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* See more button for archived sessions */}
                {hasMore && (
                  <button
                    type="button"
                    onClick={(e) => handleSeeMore('_archived', e)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 mt-1 rounded text-[11px] font-medium text-sky-300/80 hover:text-sky-200 bg-sky-950/20 hover:bg-sky-950/40 border border-sky-900/30 hover:border-sky-800/50 transition-all cursor-pointer group"
                    title={
                      isZh
                        ? `点击展开更多归档会话 (加载 +${nextStep} 个，还剩 ${remaining} 个)`
                        : `Click to see more archived sessions (+${nextStep}, ${remaining} left)`
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      <ChevronDown className="w-3 h-3 text-sky-500/70 group-hover:text-sky-400 transition-transform group-hover:translate-y-0.5" />
                      <span>{isZh ? '查看更多 (See more)' : 'See more'}</span>
                      <span className="text-[10px] text-sky-500/60 font-mono">
                        (+{nextStep})
                      </span>
                    </div>
                    <span className="text-[10px] text-sky-500/60 font-mono group-hover:text-sky-400">
                      {remaining} {isZh ? '个未显示' : 'left'}
                    </span>
                  </button>
                )}
              </>
            )
          })()}
        </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Bottom Action Bar with Ambient Status & Settings */}
      <div className="p-2 border-t border-[#21242b] flex flex-col gap-2 bg-[#0e1014] text-xs text-[#8b949e]">
        {/* Status & Settings */}
        <div className="flex items-center justify-between pt-0.5">
          <button
            type="button"
            onClick={() => onOpenSettings()}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#161920] hover:text-[#f0f6fc] transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{isZh ? '系统设置' : 'Settings'}</span>
          </button>

          <div className="flex items-center gap-1.5">
            {todos && todos.length > 0 && (
              <TodoButton todos={todos} compact placement="top" />
            )}
            <a
              href="https://opencode.ai/docs"
              target="_blank"
              rel="noreferrer"
              className="flex items-center p-1 rounded hover:bg-[#161920] hover:text-[#f0f6fc] transition-colors"
              title={isZh ? '帮助文档' : 'Documentation'}
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* 5. Right-Click Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 210),
            top: Math.min(contextMenu.y, window.innerHeight - 220),
          }}
          className="fixed z-50 min-w-[190px] rounded-xl border border-[#2a2e38] bg-[#12141a]/95 backdrop-blur-md p-1 shadow-2xl text-xs select-none animation-fade-in"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="px-2.5 py-1.5 text-[11px] text-zinc-400 font-mono truncate border-b border-zinc-800/60 mb-1 max-w-[200px]">
            {contextMenu.title}
          </div>

          {/* Toggle Pin in Context Menu */}
          <button
            type="button"
            onClick={() => {
              const targetId = contextMenu.sessionId
              handleTogglePin(targetId)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-sky-300 hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <Pin className="w-3.5 h-3.5 text-sky-400" />
            <span>{isSessionPinned(contextMenu.sessionId, pinnedIds) ? (isZh ? '取消置顶' : 'Unpin') : (isZh ? '置顶会话' : 'Pin Session')}</span>
          </button>

          {/* Mark Unread / Mark Read */}
          <button
            type="button"
            onClick={() => {
              const targetId = contextMenu.sessionId
              if (isSessionUnread(targetId, unreadSessionIds || [])) {
                markSessionRead(targetId)
              } else {
                markSessionUnread(targetId)
              }
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-sky-300 hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <Bookmark className="w-3.5 h-3.5 text-sky-400" />
            <span>
              {isSessionUnread(contextMenu.sessionId, unreadSessionIds || [])
                ? (isZh ? '标为已读' : 'Mark as Read')
                : (isZh ? '标为未读' : 'Mark Unread')}
            </span>
          </button>

          {/* Toggle Archive in Context Menu */}
          <button
            type="button"
            onClick={() => {
              const targetId = contextMenu.sessionId
              handleToggleArchive(targetId)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-sky-300 hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            {isSessionArchived(contextMenu.sessionId, archivedIds) ? (
              <>
                <ArchiveRestore className="w-3.5 h-3.5 text-sky-400" />
                <span>{isZh ? '恢复会话 (取消归档)' : 'Restore Session'}</span>
              </>
            ) : (
              <>
                <Archive className="w-3.5 h-3.5 text-sky-400" />
                <span>{isZh ? '归档会话' : 'Archive Session'}</span>
              </>
            )}
          </button>

          {/* Rename */}
          <button
            type="button"
            onClick={() => {
              const targetId = contextMenu.sessionId
              setEditingSessionId(targetId)
              setEditingTitle(contextMenu.title)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
            <span>{isZh ? '重命名' : 'Rename'}</span>
          </button>

          {/* Put into Map */}
          {onShowInMap && (
            <button
              type="button"
              onClick={() => {
                onShowInMap(contextMenu.sessionId)
                setContextMenu(null)
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-sky-300 hover:bg-sky-950/30 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-sky-400" />
                <span>{isZh ? '放入地图' : 'Add to Map'}</span>
              </span>
              <span className="text-[10px] font-mono text-sky-500/70">Ctrl+M</span>
            </button>
          )}

          {/* Export Markdown */}
          <button
            type="button"
            onClick={async () => {
              try {
                const targetId = contextMenu.sessionId
                const targetSession = sessions.find((s) => s.id === targetId) || (activeSession?.id === targetId ? activeSession : null)
                const targetMsgs =
                  activeSessionId === targetId && messages && messages.length > 0
                    ? messages
                    : await api.getMessages(targetId)
                const md = exportSessionToMarkdown(targetSession, targetMsgs)
                if (navigator.clipboard) {
                  await navigator.clipboard.writeText(md)
                }
                setCopiedMd(true)
                window.dispatchEvent(
                  new CustomEvent('opencode:toast', {
                    detail: { message: isZh ? '已导出并复制会话 Markdown' : 'Copied Session Markdown' },
                  })
                )
                setTimeout(() => {
                  setCopiedMd(false)
                  setContextMenu(null)
                }, 500)
              } catch (err) {
                console.error('Failed to export markdown:', err)
                setContextMenu(null)
              }
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              {copiedMd ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <FileDown className="w-3.5 h-3.5 text-sky-400" />
              )}
              <span>{copiedMd ? (isZh ? '已导出 Markdown' : 'Exported Markdown') : (isZh ? '导出 Markdown' : 'Export Markdown')}</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">.md</span>
          </button>

          {/* Copy Prompt (Antigravity-style) */}
          <button
            type="button"
            onClick={async () => {
              try {
                const targetId = contextMenu.sessionId
                const targetMsgs =
                  activeSessionId === targetId && messages && messages.length > 0
                    ? messages
                    : await api.getMessages(targetId)
                const prompts = extractSessionPrompts(targetMsgs)
                if (prompts.length > 0) {
                  if (navigator.clipboard) {
                    await navigator.clipboard.writeText(prompts.join('\n\n---\n\n'))
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
                    setContextMenu(null)
                  }, 500)
                } else {
                  window.dispatchEvent(
                    new CustomEvent('opencode:toast', {
                      detail: { message: isZh ? '当前会话暂无用户 Prompt' : 'No prompt found in session' },
                    })
                  )
                  setContextMenu(null)
                }
              } catch (err) {
                console.error('Failed to copy prompt:', err)
                setContextMenu(null)
              }
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              {copiedPrompt ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
              )}
              <span>{copiedPrompt ? (isZh ? '已复制 Prompt' : 'Copied Prompt') : (isZh ? '复制会话 Prompt' : 'Copy Prompt')}</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">Prompt</span>
          </button>

          {/* Copy Session ID */}
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(contextMenu.sessionId)
                setCopiedId(true)
                setTimeout(() => {
                  setCopiedId(false)
                  setContextMenu(null)
                }, 500)
              } catch {
                setContextMenu(null)
              }
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            {copiedId ? (
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

          <div className="h-px bg-zinc-800/60 my-1" />

          {/* Delete Session */}
          <button
            type="button"
            onClick={() => {
              const targetId = contextMenu.sessionId
              const targetTitle = contextMenu.title
              setContextMenu(null)
              if (confirm(isZh ? `确定要删除会话 "${targetTitle}" 吗？` : `Delete session "${targetTitle}"?`)) {
                onDeleteSession(targetId)
              }
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-950/40 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isZh ? '删除会话' : 'Delete Session'}</span>
          </button>
        </div>
      )}

      {previewTarget && (
        <SessionPreviewPopover
          session={previewTarget.session}
          mouseX={previewTarget.mouseX}
          mouseY={previewTarget.mouseY}
          projects={projects}
          onClose={() => setPreviewTarget(null)}
          onSelectSession={(id) => {
            setPreviewTarget(null)
            onSelectSession(id)
          }}
        />
      )}
    </aside>
  )
}
