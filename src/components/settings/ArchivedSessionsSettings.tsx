import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Archive,
  ArchiveRestore,
  Trash2,
  Search,
  RotateCcw,
  Clock,
  Coins,
  Loader2,
} from 'lucide-react'
import { api } from '../../services/api'
import type { Session } from '../../types/opencode'
import {
  getArchivedSessionIds,
  unarchiveSessionId,
  saveArchivedSessionIds,
} from '../../utils/archiving'
import { formatCompactTime } from '../../utils/sidebar-helpers'
import { useI18n } from '../../utils/i18n'

export interface ArchivedSessionsSettingsProps {
  onSessionRestored?: (sessionId: string) => void
}

export const ArchivedSessionsSettings: React.FC<ArchivedSessionsSettingsProps> = ({
  onSessionRestored,
}) => {
  const { lang } = useI18n()
  const isZh = lang === 'zh-CN'

  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<Session[]>([])
  const [archivedIds, setArchivedIds] = useState<string[]>(() => getArchivedSessionIds())
  const [searchQuery, setSearchQuery] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const all = await api.getSessions()
      setSessions(all)
      setArchivedIds(getArchivedSessionIds())
    } catch (err) {
      console.error('Failed to load archived sessions:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const handleUpdate = () => {
      setArchivedIds(getArchivedSessionIds())
    }
    window.addEventListener('storage', handleUpdate)
    window.addEventListener('opencode_archived_sessions_updated', handleUpdate)
    return () => {
      window.removeEventListener('storage', handleUpdate)
      window.removeEventListener('opencode_archived_sessions_updated', handleUpdate)
    }
  }, [])

  // Filter archived sessions
  const archivedSessions = useMemo(() => {
    const sessionMap = new Map<string, Session>()
    sessions.forEach((s) => sessionMap.set(s.id, s))

    const list: Session[] = []
    archivedIds.forEach((id) => {
      const found = sessionMap.get(id)
      if (found) {
        list.push(found)
      } else {
        // Session might exist in storage list even if not yet returned by backend
        list.push({
          id,
          slug: id,
          projectID: 'global',
          directory: '',
          title: isZh ? '已归档会话' : 'Archived session',
          agent: 'Atlas',
          model: { id: '', providerID: '' },
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          cost: 0,
          time: { created: Date.now(), updated: Date.now() },
        })
      }
    })

    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter(
      (s) =>
        (s.title || '').toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.directory || '').toLowerCase().includes(q)
    )
  }, [sessions, archivedIds, searchQuery, isZh])

  // Unarchive single session
  const handleRestore = useCallback(
    (sessionId: string) => {
      const res = unarchiveSessionId(sessionId)
      setArchivedIds(res.archivedIds)
      onSessionRestored?.(sessionId)
    },
    [onSessionRestored]
  )

  // Restore all archived sessions
  const handleRestoreAll = useCallback(() => {
    if (archivedIds.length === 0) return
    const msg = isZh
      ? `确定要将所有 ${archivedIds.length} 个已归档会话全部恢复到活跃列表吗？`
      : `Restore all ${archivedIds.length} archived sessions to the active list?`
    if (!window.confirm(msg)) return

    saveArchivedSessionIds([])
    setArchivedIds([])
  }, [archivedIds, isZh])

  // Permanently delete an archived session
  const handleDelete = useCallback(
    async (session: Session) => {
      const confirmMsg = isZh
        ? `确定要彻底删除会话 "${session.title || session.id}" 吗？此操作不可撤销！`
        : `Permanently delete session "${session.title || session.id}"? This cannot be undone.`
      if (!window.confirm(confirmMsg)) return

      try {
        setDeletingId(session.id)
        await api.deleteSession(session.id)
        const updated = archivedIds.filter((id) => id !== session.id)
        saveArchivedSessionIds(updated)
        setArchivedIds(updated)
        setSessions((prev) => prev.filter((s) => s.id !== session.id))
      } catch (err) {
        console.error('Failed to permanently delete session:', err)
        alert(isZh ? '删除会话失败，请重试' : 'Failed to delete session')
      } finally {
        setDeletingId(null)
      }
    },
    [archivedIds, isZh]
  )

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#21242b]">
        <div>
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-semibold text-zinc-100">
              {isZh ? '已归档会话管理' : 'Archived Conversations'}
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-amber-950/60 text-amber-300 border border-amber-800/50">
              {archivedIds.length}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            {isZh
              ? '已归档的会话被移出侧边栏活跃树状视图，但历史记录与令牌消耗完整保留。'
              : 'Archived sessions are hidden from active project trees while retaining all messages and token history.'}
          </p>
        </div>

        {archivedIds.length > 0 && (
          <button
            type="button"
            onClick={handleRestoreAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1d2028] hover:bg-amber-950/40 text-zinc-300 hover:text-amber-300 border border-[#2b2f3a] hover:border-amber-700/50 transition-colors cursor-pointer self-start sm:self-auto shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isZh ? '全部恢复' : 'Restore All'}</span>
          </button>
        )}
      </div>

      {/* Search Filter if there are archived sessions */}
      {archivedIds.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isZh ? '搜索已归档会话标题或目录...' : 'Search archived sessions...'}
            className="w-full bg-[#13151b] text-zinc-200 pl-9 pr-3 py-2 text-xs rounded-lg border border-[#232731] focus:outline-none focus:border-amber-500/70 transition-colors placeholder:text-zinc-500"
          />
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-zinc-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
          <span className="text-xs">{isZh ? '正在加载已归档会话...' : 'Loading archived sessions...'}</span>
        </div>
      ) : archivedSessions.length === 0 ? (
        /* Empty State */
        <div className="py-12 px-4 rounded-xl border border-dashed border-[#232731] bg-[#111318]/50 flex flex-col items-center justify-center text-center space-y-2.5">
          <div className="w-10 h-10 rounded-full bg-zinc-800/60 flex items-center justify-center text-zinc-400">
            <Archive className="w-5 h-5 text-zinc-500" />
          </div>
          <div className="text-xs font-medium text-zinc-300">
            {searchQuery
              ? isZh ? '未找到匹配的已归档会话' : 'No matching archived sessions found'
              : isZh ? '暂无已归档会话' : 'No archived sessions'}
          </div>
          <p className="text-[11px] text-zinc-500 max-w-sm">
            {isZh
              ? '在侧边栏会话项悬停点击“归档”图标，或在会话右键菜单中选择“归档会话”，即可将不需要即时查看的会话收纳于此。'
              : 'Hover over any session in the sidebar and click the archive button or use the right-click menu to archive it.'}
          </p>
        </div>
      ) : (
        /* Archived Sessions List */
        <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
          {archivedSessions.map((session) => {
            const timeLabel = formatCompactTime(session.time?.updated || session.time?.created)
            const tokenTotal =
              (session.tokens?.input || 0) + (session.tokens?.output || 0)
            const isDeleting = deletingId === session.id

            return (
              <div
                key={session.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[#21242b] bg-[#14161d] hover:border-zinc-700/70 transition-all group"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <Archive className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />
                    <span
                      className="text-xs font-medium text-zinc-200 truncate"
                      title={session.title}
                    >
                      {session.title || (isZh ? '未命名会话' : 'Untitled session')}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-zinc-600" />
                      <span>{timeLabel}</span>
                    </span>

                    {tokenTotal > 0 && (
                      <span className="flex items-center gap-1">
                        <Coins className="w-3 h-3 text-zinc-600" />
                        <span>{tokenTotal.toLocaleString()} tok</span>
                      </span>
                    )}

                    {session.directory && (
                      <span
                        className="truncate max-w-[200px] text-zinc-600"
                        title={session.directory}
                      >
                        {session.directory.split(/[/\\]/).filter(Boolean).slice(-2).join('/')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRestore(session.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer"
                    title={isZh ? '恢复此会话到活跃列表' : 'Restore to active list'}
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    <span>{isZh ? '恢复' : 'Restore'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => handleDelete(session)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 border border-transparent hover:border-rose-900/40 transition-colors cursor-pointer disabled:opacity-50"
                    title={isZh ? '彻底删除此会话' : 'Permanently delete'}
                  >
                    {isDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
