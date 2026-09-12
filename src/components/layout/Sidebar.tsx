import { useState, useEffect, useRef, useMemo } from 'react'
import {
  PanelLeftClose,
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
  Plus,
  SlidersHorizontal,
} from 'lucide-react'
import type { Project, Session } from '../../types/opencode'
import type { SessionGroup } from '../../hooks/useSessions'
import { matchCanonicalWorkspace } from '../../services/api'
import { useI18n } from '../../utils/i18n'
import {
  getPinnedSessionIds,
  togglePinSessionId,
  isSessionPinned,
} from '../../utils/pinning'
import {
  doesSessionBelongToProject,
  formatCompactTime,
} from '../../utils/sidebar-helpers'

interface SidebarProps {
  projects: Project[]
  selectedProjectId: string | null
  onSelectProject: (id: string | null) => void
  groupedSessions: SessionGroup[]
  sessions?: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: (directory?: string) => void
  onDeleteSession: (id: string) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  onOpenSettings: () => void
  onOpenSearch?: () => void
  onOpenScheduledTasks?: () => void
  onToggleSidebar?: () => void
  canGoBack?: boolean
  canGoForward?: boolean
  onHistoryBack?: () => void
  onHistoryForward?: () => void
  onUpdateSessionTitle?: (sessionId: string, newTitle: string) => void
  onShowInMap?: (sessionId: string) => void
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
  projects,
  selectedProjectId,
  onSelectProject,
  sessions = [],
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  searchQuery,
  onSearchChange,
  onOpenSettings,
  onOpenSearch,
  onOpenScheduledTasks,
  onToggleSidebar,
  canGoBack = false,
  canGoForward = false,
  onHistoryBack,
  onHistoryForward,
  onUpdateSessionTitle,
  onShowInMap,
}: SidebarProps) {
  const { lang } = useI18n()
  const isZh = lang === 'zh-CN'

  // Pinned session IDs state
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => getPinnedSessionIds())

  // Accordion expansion state for project folders (default all open)
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = { _pinned: true }
    projects.forEach((p) => {
      initial[p.id] = true
    })
    return initial
  })

  // Renaming state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    sessionId: string
    title: string
    x: number
    y: number
  } | null>(null)
  const [copiedId, setCopiedId] = useState(false)
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

  // Pinned sessions list
  const pinnedSessions = useMemo(() => {
    return pinnedIds
      .map((id) => sessionMap.get(id))
      .filter((s): s is Session => Boolean(s))
  }, [pinnedIds, sessionMap])

  // Filter sessions by search query if any
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions
    const q = searchQuery.toLowerCase()
    return sessions.filter(
      (s) =>
        (s.title || '').toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
    )
  }, [sessions, searchQuery])

  // Map sessions into projects
  const projectSessionsMap = useMemo(() => {
    const map = new Map<string, Session[]>()
    canonicalProjects.forEach((proj) => {
      const matched = filteredSessions.filter((sess) =>
        doesSessionBelongToProject(sess, proj)
      )
      map.set(proj.id, matched)
    })
    return map
  }, [canonicalProjects, filteredSessions])

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

  return (
    <aside className="w-72 h-full flex flex-col shrink-0 border-r border-[#21242b] bg-[#0d0f12] text-[#c9d1d9] select-none">
      {/* 1. Top Action Buttons Bar (图4功能 - 并列一行，纯图标，带悬浮说明) */}
      <div className="h-11 px-2.5 flex items-center justify-between border-b border-[#21242b] bg-[#111317]">
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
              className="p-1.5 rounded-md text-[#8b949e] hover:text-orange-400 hover:bg-[#1f232b] transition-colors cursor-pointer"
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

          {/* Scheduled Tasks (⏱) */}
          <div className="relative group">
            <button
              type="button"
              onClick={onOpenScheduledTasks}
              className="p-1.5 rounded-md text-[#8b949e] hover:text-orange-400 hover:bg-[#1f232b] transition-colors cursor-pointer"
              title={isZh ? '计划任务调度 (Scheduled Tasks)' : 'Scheduled Tasks'}
            >
              <Clock className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-full mt-1.5 hidden group-hover:flex items-center px-2 py-1 rounded bg-[#1c1f26] border border-[#2d323d] text-[11px] text-[#f0f6fc] whitespace-nowrap z-50 shadow-xl pointer-events-none">
              <span>{isZh ? '计划任务' : 'Scheduled Tasks'}</span>
            </div>
          </div>
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
                <Pin className="w-3 h-3 text-orange-400 rotate-45" />
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

                return (
                  <div
                    key={`pinned-${session.id}`}
                    onClick={() => onSelectSession(session.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setContextMenu({
                        sessionId: session.id,
                        title: session.title || (isZh ? '未命名会话' : 'Untitled session'),
                        x: e.clientX,
                        y: e.clientY,
                      })
                    }}
                    className={`group relative flex flex-col px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                      isActive
                        ? 'bg-[#1c212a] text-[#f0f6fc] border border-orange-500/40 shadow-sm'
                        : 'text-[#c9d1d9] hover:bg-[#161920] hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate flex-1 font-medium text-left" title={session.title}>
                        {session.title || (isZh ? '新建会话' : 'New session')}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {isActive ? (
                          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        ) : (
                          <span className="text-[10px] text-zinc-500 font-mono">{timeLabel}</span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleTogglePin(session.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-400 hover:text-orange-400 rounded transition-opacity cursor-pointer"
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

          {/* Project Folders Accordion */}
          <div className="space-y-1.5">
            {canonicalProjects.map((proj) => {
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
                        projSessions.map((session) => {
                          const isActive = activeSessionId === session.id
                          const isPinned = isSessionPinned(session.id, pinnedIds)
                          const timeLabel = formatCompactTime(session.time?.updated || session.time?.created)
                          const isEditing = editingSessionId === session.id

                          return (
                            <div
                              key={session.id}
                              onClick={() => {
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
                                  title: session.title || (isZh ? '未命名会话' : 'Untitled session'),
                                  x: e.clientX,
                                  y: e.clientY,
                                })
                              }}
                              className={`group relative flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-all ${
                                isActive
                                  ? 'bg-[#1d232c] text-[#f0f6fc] border border-blue-500/40 font-medium'
                                  : 'text-[#8b949e] hover:bg-[#15181e] hover:text-[#c9d1d9] border border-transparent'
                              }`}
                            >
                              {/* Left: Active Indicator / Title */}
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                {isActive ? (
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 animate-pulse" />
                                ) : (
                                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-700 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
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
                                        setEditingSessionId(null)
                                      }
                                    }}
                                    onBlur={handleCommitTitle}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    autoFocus
                                    className="bg-[#14171d] text-[#f0f6fc] border border-orange-500/80 rounded px-1.5 py-0.5 text-xs outline-none flex-1 min-w-0"
                                  />
                                ) : (
                                  <span
                                    className="truncate text-left"
                                    title={session.title || (isZh ? '未命名会话' : 'Untitled session')}
                                  >
                                    {session.title || (isZh ? '新建会话' : 'New session')}
                                  </span>
                                )}
                              </div>

                              {/* Right: Timestamp & Action buttons (图3: 📌 is pinned on the right) */}
                              <div className="flex items-center gap-1 shrink-0">
                                {/* Time label when not hovering */}
                                <span className={`text-[10px] text-zinc-500 font-mono ${isPinned ? 'hidden' : 'group-hover:hidden'}`}>
                                  {timeLabel}
                                </span>

                                {/* Pin button on the right (📌) */}
                                <button
                                  type="button"
                                  onClick={(e) => handleTogglePin(session.id, e)}
                                  className={`p-0.5 rounded transition-all cursor-pointer ${
                                    isPinned
                                      ? 'text-orange-400 opacity-100'
                                      : 'opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-orange-400'
                                  }`}
                                  title={isPinned ? (isZh ? '取消置顶' : 'Unpin') : (isZh ? '置顶此会话' : 'Pin session')}
                                >
                                  <Pin className={`w-3 h-3 ${isPinned ? 'fill-orange-400' : ''}`} />
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
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 4. Bottom Action Bar */}
      <div className="p-2 border-t border-[#21242b] flex items-center justify-between text-xs text-[#8b949e] bg-[#0e1014]">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#161920] hover:text-[#f0f6fc] transition-colors cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>{isZh ? '系统设置' : 'Settings'}</span>
        </button>

        <a
          href="https://opencode.ai/docs"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-[#161920] hover:text-[#f0f6fc] transition-colors"
          title={isZh ? '帮助文档' : 'Documentation'}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>{isZh ? '帮助' : 'Help'}</span>
        </a>
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
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-orange-300 hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <Pin className="w-3.5 h-3.5 text-orange-400" />
            <span>{isSessionPinned(contextMenu.sessionId, pinnedIds) ? (isZh ? '取消置顶' : 'Unpin') : (isZh ? '置顶会话' : 'Pin Session')}</span>
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
    </aside>
  )
}
