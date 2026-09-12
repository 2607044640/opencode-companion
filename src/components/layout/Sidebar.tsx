import { useState, useEffect, useRef } from 'react'
import {
  LayoutGrid,
  FolderPlus,
  Settings,
  HelpCircle,
  Search,
  SquarePen,
  Trash2,
  Folder,
  Layers,
  ChevronRight,
  Edit3,
  MapPin,
  Copy,
  Check,
} from 'lucide-react'
import type { Project } from '../../types/opencode'
import type { SessionGroup } from '../../hooks/useSessions'
import { matchCanonicalWorkspace } from '../../services/api'
import { useI18n } from '../../utils/i18n'

interface SidebarProps {
  projects: Project[]
  selectedProjectId: string | null
  onSelectProject: (id: string | null) => void
  groupedSessions: SessionGroup[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  onOpenSettings: () => void
  onOpenSearch?: () => void
  onUpdateSessionTitle?: (sessionId: string, newTitle: string) => void
  onShowInMap?: (sessionId: string) => void
}

const PROJECT_COLORS: Record<string, string> = {
  cyan: 'bg-cyan-900/50 text-cyan-400 border-cyan-700/50',
  blue: 'bg-blue-900/50 text-blue-400 border-blue-700/50',
  green: 'bg-emerald-900/50 text-emerald-400 border-emerald-700/50',
  purple: 'bg-purple-900/50 text-purple-400 border-purple-700/50',
  magenta: 'bg-pink-900/50 text-pink-400 border-pink-700/50',
  pink: 'bg-pink-900/50 text-pink-400 border-pink-700/50',
  amber: 'bg-amber-900/50 text-amber-400 border-amber-700/50',
  orange: 'bg-orange-900/50 text-orange-400 border-orange-700/50',
  mint: 'bg-emerald-900/50 text-emerald-400 border-emerald-700/50',
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
  groupedSessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  searchQuery,
  onSearchChange,
  onOpenSettings,
  onOpenSearch,
  onUpdateSessionTitle,
  onShowInMap,
}: SidebarProps) {
  const { lang } = useI18n()
  const isZh = lang === 'zh-CN'
  const selectedProject = selectedProjectId
    ? projects.find(
        (p) =>
          p.id === selectedProjectId ||
          Boolean(p.associatedIds && p.associatedIds.includes(selectedProjectId))
      )
    : null
  const currentProjectName = selectedProjectId ? getProjectDisplayName(selectedProject) : (isZh ? '全部项目' : 'All Projects')

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    sessionId: string
    title: string
    x: number
    y: number
  } | null>(null)
  const [copiedId, setCopiedId] = useState(false)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setEditingSessionId(null)
  }, [activeSessionId])

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

  return (
    <aside className="h-full flex flex-row shrink-0 border-r border-[#24272b] bg-[#0e1012] select-none">
      {/* 1. Left Project Navigation Pane */}
      <div className="w-fit min-w-[120px] max-w-[176px] h-full flex flex-col border-r border-[#1f2226] bg-[#0c0d0e]">
        {/* Top Header */}
        <div className="h-12 px-3 flex items-center gap-2 border-b border-[#1f2226] text-[#8b949e]">
          <LayoutGrid className="w-4 h-4 text-[#8b949e]" />
          <span className="text-xs font-medium uppercase tracking-wider text-[#656d76]">
            {isZh ? '工作区' : 'Workspace'}
          </span>
        </div>

        {/* Projects Section */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="flex items-center justify-between px-2 py-1.5 text-xs text-[#8b949e] font-medium">
            <span className="flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5" />
              {isZh ? '工程列表' : 'Projects'}
            </span>
            <button
              onClick={() => onSelectProject(null)}
              className="text-[10px] text-[#656d76] hover:text-[#e6edf3] transition-colors"
              title={isZh ? '查看全部工程' : 'View all projects'}
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* All Projects Option */}
          <button
            onClick={() => onSelectProject(null)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              selectedProjectId === null
                ? 'bg-[#1e2227] text-[#e6edf3]'
                : 'text-[#8b949e] hover:bg-[#16181b] hover:text-[#c9d1d9]'
            }`}
          >
            <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold border border-zinc-700 bg-zinc-800 text-zinc-300">
              <Layers className="w-3 h-3" />
            </div>
            <span className="truncate">{isZh ? '全部项目' : 'All Projects'}</span>
          </button>

          {/* Project List: strictly canonical workspaces */}
          {projects
            .filter((p) => p.id !== 'global' && Boolean(matchCanonicalWorkspace(p.worktree, p.name)))
            .map((proj) => {
              const matchedCanonical = matchCanonicalWorkspace(proj.worktree, proj.name)
              const colorKey = proj.icon?.color || matchedCanonical?.defaultColor || 'blue'
              const colorClass =
                PROJECT_COLORS[colorKey] ||
                PROJECT_COLORS[matchedCanonical?.defaultColor || 'blue'] ||
                'bg-zinc-800 text-zinc-300 border-zinc-700'
              const projName = matchedCanonical?.name || getProjectDisplayName(proj)
              const initial = (projName || 'P').charAt(0).toUpperCase()
              const isSelected =
                selectedProjectId === proj.id ||
                Boolean(proj.associatedIds && selectedProjectId && proj.associatedIds.includes(selectedProjectId))

              return (
                <button
                  key={proj.id}
                  onClick={() => onSelectProject(proj.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-[#1e2227] text-[#e6edf3]'
                      : 'text-[#8b949e] hover:bg-[#16181b] hover:text-[#c9d1d9]'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold border ${colorClass}`}
                  >
                    {initial}
                  </div>
                  <span className="truncate flex-1 text-left">{projName}</span>
                  {isSelected && <ChevronRight className="w-3 h-3 text-zinc-500" />}
                </button>
              )
            })}
        </div>

        {/* Bottom Actions */}
        <div className="p-2 border-t border-[#1f2226] space-y-1">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-[#8b949e] hover:bg-[#16181b] hover:text-[#e6edf3] transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{isZh ? '系统设置' : 'Settings'}</span>
          </button>
          <a
            href="https://opencode.ai/docs"
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-[#8b949e] hover:bg-[#16181b] hover:text-[#e6edf3] transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{isZh ? '帮助文档' : 'Help'}</span>
          </a>
        </div>
      </div>

      {/* 2. Middle Session List Pane (Replicating Image 2) */}
      <div className="w-72 h-full flex flex-col bg-[#111316]">
        {/* Search & New Session Bar */}
        <div className="p-3 border-b border-[#1f2226] space-y-2">
          <div
            className="relative cursor-pointer group"
            onClick={() => onOpenSearch?.()}
          >
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#656d76] group-hover:text-zinc-300 transition-colors" />
            <input
              id="session-search-input"
              type="text"
              readOnly={Boolean(onOpenSearch)}
              placeholder={isZh ? `在 ${currentProjectName} 中搜索会话...` : `Search sessions in ${currentProjectName}...`}
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
              className="w-full bg-[#16181d] border border-[#272a30] text-xs text-[#e6edf3] pl-8 pr-14 py-1.5 rounded-md placeholder-[#656d76] focus:outline-none focus:border-[#388bfd] cursor-pointer"
            />
            <kbd className="absolute right-2 top-2 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 bg-zinc-800/80 border border-zinc-700/60 rounded pointer-events-none group-hover:text-zinc-300 transition-colors">
              Ctrl K
            </kbd>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-wider">
              {currentProjectName}
            </span>
            <button
              onClick={onNewSession}
              className="flex items-center gap-1.5 px-2 py-1 bg-[#1f2329] hover:bg-[#2b313a] text-zinc-200 text-xs font-medium rounded border border-[#30363d] transition-colors shadow-sm"
              title={isZh ? '开启新会话' : 'Start a new session'}
            >
              <SquarePen className="w-3 h-3 text-orange-400" />
              <span>{isZh ? '新建会话' : 'New session'}</span>
            </button>
          </div>
        </div>

        {/* Sessions Grouped List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {groupedSessions.length === 0 ? (
            <div className="text-center py-10 text-xs text-[#656d76]">
              {isZh ? '暂无会话记录' : 'No sessions found'}
            </div>
          ) : (
            groupedSessions.map((group) => (
              <div key={group.label} className="space-y-1">
                <div className="px-2 text-[11px] font-semibold text-[#656d76] tracking-wider uppercase">
                  {group.label}
                </div>
                {group.sessions.map((session) => {
                  const isActive = activeSessionId === session.id
                  const agentInitial = ((session.agent || 'A').charAt(0) || 'A').toUpperCase()
                  const isEditing = editingSessionId === session.id

                  const handleCommitTitle = () => {
                    const trimmed = editingTitle.trim()
                    if (trimmed && trimmed !== session.title) {
                      onUpdateSessionTitle?.(session.id, trimmed)
                    }
                    setEditingSessionId(null)
                  }

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
                      className={`group relative flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs cursor-pointer transition-all ${
                        isActive
                          ? 'bg-[#1f242c] text-[#f0f6fc] border border-[#388bfd]/30 font-medium'
                          : 'text-[#8b949e] hover:bg-[#16191f] hover:text-[#c9d1d9]'
                      }`}
                    >
                      {/* Agent Badge Icon (orange A as shown in screenshot) */}
                      <div className="w-4 h-4 shrink-0 rounded flex items-center justify-center text-[10px] font-bold bg-amber-950/70 text-amber-400 border border-amber-700/50">
                        {agentInitial}
                      </div>

                      {/* Session Title (Click when already active to inline edit) */}
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
                          className="bg-[#14171d] text-[#f0f6fc] border border-orange-500/80 rounded px-1.5 py-0.5 text-xs outline-none flex-1 min-w-0 focus:ring-1 focus:ring-orange-500/50"
                        />
                      ) : (
                        <span
                          className="truncate flex-1 text-left"
                          title={session.title || (isZh ? '未命名会话' : 'Untitled session')}
                          onClick={(e) => {
                            if (isActive) {
                              e.stopPropagation()
                              setEditingSessionId(session.id)
                              setEditingTitle(session.title || '')
                            }
                          }}
                        >
                          {session.title || (isZh ? '新建会话' : 'New session')}
                        </span>
                      )}

                      {/* Delete action button on hover */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(isZh ? `确定要删除会话 "${session.title || session.id}" 吗？` : `Delete session "${session.title || session.id}"?`)) {
                            onDeleteSession(session.id)
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 rounded transition-opacity"
                        title={isZh ? '删除会话' : 'Delete session'}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Sidebar Session Right-Click Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 210),
            top: Math.min(contextMenu.y, window.innerHeight - 190),
          }}
          className="fixed z-50 min-w-[190px] rounded-xl border border-[#2a2e38] bg-[#12141a]/95 backdrop-blur-md p-1 shadow-2xl text-xs select-none animation-fade-in"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Header Title */}
          <div className="px-2.5 py-1.5 text-[11px] text-zinc-400 font-mono truncate border-b border-zinc-800/60 mb-1 max-w-[200px]">
            {contextMenu.title}
          </div>

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
