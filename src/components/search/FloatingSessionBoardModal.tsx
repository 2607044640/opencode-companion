import { useEffect, useMemo, useRef, useState } from 'react'
import { Columns3, Search, X, Star, ChevronDown, ChevronRight, Folder, Plus, GripVertical, HelpCircle } from 'lucide-react'
import type { Project, Session } from '../../types/opencode'
import { api } from '../../services/api'
import { useI18n } from '../../utils/i18n'
import { isEditableTarget, isIMEActive } from '../../utils/shortcuts'
import { getPinnedSessionIds, togglePinSessionId } from '../../utils/pinning'
import { getArchivedSessionIds, toggleArchiveSessionId } from '../../utils/archiving'
import { resolveSessionProject, sessionBelongsToProjectFilter } from '../../utils/session-workspace'
import { formatCompactTime } from '../../utils/sidebar-helpers'
import { SessionTrailingIndicator } from '../common/SessionStatusIndicator'
import { CountdownConfirmDialog } from '../common/CountdownConfirmDialog'
import {
  SESSION_BOARD_STORAGE_KEY, createSessionBoard, readSessionBoard, saveSessionBoard,
  moveBoardSession, moveBoardGroup, moveBoardColumn, recentBoardSessions,
  type SessionBoardState,
} from '../../utils/session-board'
import './session-board.css'

interface Props {
  sessions: readonly Session[]
  projects: readonly Project[]
  initialSelectedProjectId?: string | null
  activeSessionId?: string | null
  unreadSessionIds: readonly string[]
  busySessionIds: readonly string[]
  onClose: () => void
  onSelectSession: (id: string) => void
  onNewSession: (directory?: string) => void
  onUpdateSessionTitle?: (id: string, newTitle: string) => void
}

type DragItem = { kind: 'session' | 'group' | 'column'; id: string }
type Editor = { kind: 'column' | 'group' | 'session'; id?: string; columnId?: string; value: string; sessionId?: string; groupId?: string }
type HoverTarget =
  | { kind: 'session'; session: Session; groupId?: string }
  | { kind: 'group'; id: string; name: string }
  | { kind: 'column'; id: string; name: string }

export function FloatingSessionBoardModal({ sessions, projects, initialSelectedProjectId, activeSessionId, unreadSessionIds, busySessionIds, onClose, onSelectSession, onNewSession, onUpdateSessionTitle }: Props) {
  const { lang } = useI18n()
  const zh = lang === 'zh-CN'
  const [board, setBoard] = useState(() => {
    try { return readSessionBoard(localStorage) } catch { return createSessionBoard() }
  })
  const [query, setQuery] = useState('')
  const [projectId, setProjectId] = useState(initialSelectedProjectId || '')
  const [activeOnly, setActiveOnly] = useState(true)
  const [starredOnly, setStarredOnly] = useState(false)
  const [focusedGroup, setFocusedGroup] = useState<string | null>(null)
  const [pinned, setPinned] = useState(getPinnedSessionIds)
  const [archived, setArchived] = useState(getArchivedSessionIds)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [deleting, setDeleting] = useState<DragItem | null>(null)
  const [dragging, setDragging] = useState<DragItem | null>(null)
  const [dropTarget, setDropTarget] = useState('')
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null)
  const [showAllUngrouped, setShowAllUngrouped] = useState(false)
  const hoverTargetRef = useRef<HoverTarget | null>(null)
  const lastActionAt = useRef(0)
  const setHover = (target: HoverTarget | null) => {
    hoverTargetRef.current = target
    setHoverTarget(target)
  }
  const dragged = useRef<DragItem | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const boardRef = useRef(board)
  boardRef.current = board

  useEffect(() => {
    if (query.trim() || showAllUngrouped) root.current?.querySelector('.sb-search-results')?.scrollIntoView({ block: 'nearest' })
  }, [query, showAllUngrouped])

  const commit = (next: SessionBoardState) => {
    if (next === boardRef.current) return
    try {
      saveSessionBoard(next, localStorage)
      boardRef.current = next
      setBoard(next)
      setError('')
    } catch { setError(zh ? '保存失败，未应用改动。请检查浏览器存储空间。' : 'Could not save. Change was not applied; check browser storage.') }
  }

  const recycle = (id: string) => {
    lastActionAt.current = Date.now()
    commit(moveBoardSession(boardRef.current, id, null))
    setNotice(zh ? '已移回待整理底栏' : 'Moved to tray')
  }

  const archive = (id: string) => {
    lastActionAt.current = Date.now()
    const res = toggleArchiveSessionId(id)
    setArchived(res.archivedIds)
    setNotice(res.archived ? (zh ? '已归档会话' : 'Archived conversation') : (zh ? '已取消归档会话' : 'Unarchived conversation'))
  }

  const finishDrag = () => { dragged.current = null; setDragging(null); setDropTarget('') }

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    root.current?.focus()
    const sync = (event: StorageEvent) => {
      if (event.key === SESSION_BOARD_STORAGE_KEY || event.key === null) setBoard(readSessionBoard(localStorage))
      setPinned(getPinnedSessionIds())
      setArchived(getArchivedSessionIds())
    }
    const status = () => { setPinned(getPinnedSessionIds()); setArchived(getArchivedSessionIds()) }
    const resetHover = () => setHover(null)
    const handleDragEnd = () => finishDrag()
    const keydown = (event: KeyboardEvent) => {
      if (isIMEActive(event)) return
      if (isEditableTarget(event.target)) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const target = hoverTargetRef.current
      if (!target) return
      const k = event.key.toLowerCase()

      if (target.kind === 'session') {
        if (event.key === 'F2' || event.code === 'F2') {
          event.preventDefault()
          lastActionAt.current = Date.now()
          setEditor({ kind: 'session', sessionId: target.session.id, value: target.session.title || target.session.id })
        } else if (k === 'd') {
          event.preventDefault()
          archive(target.session.id)
        } else if (k === 'r') {
          event.preventDefault()
          if (target.groupId) {
            recycle(target.session.id)
          } else {
            setNotice(zh ? '该会话已在待整理底栏中' : 'Conversation is already in tray')
          }
        }
      } else if (target.kind === 'group') {
        if (event.key === 'F2' || event.code === 'F2') {
          event.preventDefault()
          lastActionAt.current = Date.now()
          setEditor({ kind: 'group', id: target.id, value: target.name })
        }
      } else if (target.kind === 'column') {
        if (event.key === 'F2' || event.code === 'F2') {
          event.preventDefault()
          lastActionAt.current = Date.now()
          setEditor({ kind: 'column', id: target.id, value: target.name })
        }
      }
    }
    window.addEventListener('storage', sync)
    window.addEventListener('opencode_pinned_sessions_updated', status)
    window.addEventListener('opencode_archived_sessions_updated', status)
    window.addEventListener('keydown', keydown)
    window.addEventListener('blur', resetHover)
    window.addEventListener('dragend', handleDragEnd)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('opencode_pinned_sessions_updated', status)
      window.removeEventListener('opencode_archived_sessions_updated', status)
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('blur', resetHover)
      window.removeEventListener('dragend', handleDragEnd)
      setHover(null)
      previous?.focus()
    }
  }, [])

  const filtered = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
    return sessions.filter(session => {
      if (activeOnly && archived.includes(session.id)) return false
      if (starredOnly && !pinned.includes(session.id)) return false
      const badge = resolveSessionProject(session, projects)
      if (projectId && !sessionBelongsToProjectFilter(session, projectId, projects, badge)) return false
      const text = `${session.title} ${session.id} ${badge.name} ${session.directory}`.toLocaleLowerCase()
      return tokens.every(token => text.includes(token))
    })
  }, [sessions, projects, query, projectId, activeOnly, archived, starredOnly, pinned])
  const visible = new Map(filtered.map(session => [session.id, session]))
  const recent = recentBoardSessions(filtered, board)
  const allGrouped = new Set(board.columns.flatMap(column => column.groups.flatMap(group => group.sessionIds)))
  const overflow = filtered.filter(session => !allGrouped.has(session.id) && !recent.some(item => item.id === session.id))

  const startDrag = (event: React.DragEvent, item: DragItem) => {
    dragged.current = item
    root.current?.focus()
    setDragging(item)
    event.dataTransfer.setData('application/x-opencode-session-board', JSON.stringify(item))
    event.dataTransfer.effectAllowed = 'move'
    event.stopPropagation()
  }
  const over = (event: React.DragEvent, target: string, accepts: DragItem['kind'][]) => {
    if (!dragged.current || !accepts.includes(dragged.current.kind)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget(target)
  }
  const drop = (event: React.DragEvent, action: (item: DragItem) => void) => {
    event.preventDefault()
    event.stopPropagation()
    if (dragged.current) action(dragged.current)
    finishDrag()
  }
  const editCommit = () => {
    if (!editor?.value.trim()) return
    const name = editor.value.trim()
    if (editor.kind === 'session' && editor.sessionId) {
      if (onUpdateSessionTitle) {
        onUpdateSessionTitle(editor.sessionId, name)
      } else {
        api.updateSession(editor.sessionId, { title: name }).catch(() => {})
      }
      setNotice(zh ? '已重命名会话' : 'Renamed conversation')
      setEditor(null)
      return
    }
    const state = boardRef.current
    const id = editor.id || crypto.randomUUID()
    let next = state
    if (editor.kind === 'column') {
      next = editor.id ? { ...state, columns: state.columns.map(column => column.id === id ? { ...column, name } : column) }
        : { ...state, columns: [...state.columns, { id, name, groups: [] }] }
      if (editor.groupId) next = moveBoardGroup(next, editor.groupId, id)
      if (editor.sessionId) {
        const gid = crypto.randomUUID()
        next = {
          ...next,
          columns: next.columns.map(col => col.id === id ? {
            ...col,
            groups: [{ id: gid, name: zh ? '新分组' : 'New Group', sessionIds: [], collapsed: false }]
          } : col)
        }
        next = moveBoardSession(next, editor.sessionId, gid)
      }
    } else {
      next = { ...state, columns: state.columns.map(column => ({ ...column, groups: editor.id
        ? column.groups.map(group => group.id === id ? { ...group, name } : group)
        : column.id === editor.columnId ? [...column.groups, { id, name, sessionIds: [], collapsed: false }] : column.groups })) }
      if (editor.sessionId) next = moveBoardSession(next, editor.sessionId, id)
    }
    commit(next)
    setEditor(null)
  }

  const addGroup = (columnId?: string, sessionId?: string) => {
    if (!columnId) {
      const id = crypto.randomUUID()
      commit({ ...boardRef.current, columns: [...boardRef.current.columns, { id, name: zh ? '新列' : 'New column', groups: [] }] })
      columnId = id
    }
    setEditor({ kind: 'group', columnId, sessionId, value: '' })
  }
  const deleteItem = () => {
    if (!deleting) return
    let next = boardRef.current
    const removedGroups = next.columns.flatMap(column => deleting.kind === 'column' && column.id === deleting.id ? column.groups : column.groups.filter(group => group.id === deleting.id))
    for (const id of removedGroups.flatMap(group => group.sessionIds)) next = moveBoardSession(next, id, null)
    next = { ...next, columns: next.columns.filter(column => !(deleting.kind === 'column' && column.id === deleting.id)).map(column => ({ ...column, groups: column.groups.filter(group => !(deleting.kind === 'group' && group.id === deleting.id)) })) }
    commit(next)
    if (focusedGroup === deleting.id) setFocusedGroup(null)
    setDeleting(null)
  }

  const renderSession = (session: Session, groupId?: string) => {
    const badge = resolveSessionProject(session, projects)
    const target = `session:${session.id}`
    const isArchived = archived.includes(session.id)
    const isHovered = hoverTarget?.kind === 'session' && hoverTarget.session.id === session.id
    return <div key={session.id} className={`sb-session ${activeSessionId === session.id ? 'sb-selected' : ''} ${dropTarget === target ? 'sb-insert' : ''} ${isArchived ? 'sb-session-archived' : ''} ${isHovered ? 'sb-hovered' : ''}`}
      draggable onDragStart={event => startDrag(event, { kind: 'session', id: session.id })} onDragEnd={finishDrag}
      onMouseEnter={() => setHover({ kind: 'session', session, groupId })}
      onMouseLeave={() => { if (hoverTargetRef.current?.kind === 'session' && hoverTargetRef.current.session.id === session.id) setHover(null) }}
      onDragOver={event => groupId && over(event, target, ['session'])}
      onDrop={event => { if (dragged.current?.kind === 'session') drop(event, item => { if (groupId) commit(moveBoardSession(boardRef.current, item.id, groupId, session.id)); else recycle(item.id) }) }}>
      <button className="sb-session-open" title={`${session.title}\n${badge.name} · ${session.directory}${groupId ? '\n[R] ' + (zh ? '移回底栏待整理' : 'Return to tray') : ''}\n[D] ${isArchived ? (zh ? '取消归档' : 'Unarchive') : (zh ? '归档' : 'Archive')}\n[F2] ${zh ? '重命名会话' : 'Rename conversation'}`}
        onClick={() => {
          if (Date.now() - lastActionAt.current < 350) return
          onSelectSession(session.id)
          onClose()
        }}
        >
        <Folder size={12} className="sb-folder" />
        <span className="sb-session-text"><span className="sb-title">{session.title || session.id}</span>
          {!groupId && <span className="sb-meta">[{badge.name}] · {formatCompactTime(session.time.updated)}</span>}
        </span>
        <SessionTrailingIndicator isRunning={busySessionIds.includes(session.id)} isUnread={unreadSessionIds.includes(session.id)} />
      </button>
      <button className={`sb-star ${pinned.includes(session.id) ? 'sb-pinned' : ''}`} title={zh ? '置顶 / 取消置顶' : 'Pin / unpin'} aria-label={zh ? '置顶 / 取消置顶' : 'Pin / unpin'}
        onClick={() => { togglePinSessionId(session.id); setPinned(getPinnedSessionIds()) }}><Star size={11} fill={pinned.includes(session.id) ? 'currentColor' : 'none'} /></button>
    </div>
  }

  return <div className={`session-board-overlay ${dragging ? 'sb-dragging' : ''}`} role="dialog" aria-modal="true" aria-label={zh ? '会话整理看板' : 'Session board'} data-floating-modal ref={root} tabIndex={-1}
    onMouseDown={event => { if (event.target === event.currentTarget || (event.target instanceof HTMLElement && ['MAIN', 'SECTION', 'ASIDE'].includes(event.target.tagName))) root.current?.focus() }}
    onFocusCapture={event => { if (isEditableTarget(event.target)) setHover(null) }}
    onKeyDown={event => {
      if (isIMEActive(event)) return
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation()
        if (editor) setEditor(null)
        else if (deleting) setDeleting(null)
        else onClose()
      }
      if (event.key === 'Tab') {
        const focusRoot = root.current?.querySelector('.sb-editor, .sb-confirm-scope') || root.current
        const nodes = Array.from(focusRoot?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, [tabindex="0"]') || []).filter(node => node.getClientRects().length)
        const first = nodes[0], last = nodes.at(-1)
        if (document.activeElement === root.current || !focusRoot?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus() }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }}>
    <header className="sb-toolbar">
      <label className="sb-search"><Search size={15} /><input ref={input} value={query} onChange={event => setQuery(event.target.value)} placeholder="Press Tab to focus search..." />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={13} /></button>}</label>
      <button className={starredOnly ? 'sb-active' : ''} onClick={() => setStarredOnly(!starredOnly)}><Star size={12} /> Starred</button>
      <button className={activeOnly ? 'sb-active' : ''} onClick={() => setActiveOnly(!activeOnly)} title={zh ? '仅显示未归档会话' : 'Only non-archived conversations'}>Active only</button>
      <select aria-label={zh ? '项目范围' : 'Project scope'} value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">{zh ? '全部项目' : 'All projects'}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name || project.worktree}</option>)}</select>
      {focusedGroup && <button className="sb-active" onClick={() => setFocusedGroup(null)}>Focus ×</button>}
      <span className="sb-table-label"><Columns3 size={12} /> Table</span>
      <button onClick={onClose} aria-label={zh ? '关闭看板' : 'Close board'} title="Esc"><X size={16} /></button>
    </header>
    {(error || notice) && <div className={`sb-notice ${error ? 'sb-error' : ''}`} role="status">{error || notice}<button onClick={() => { setError(''); setNotice('') }} aria-label="Dismiss">×</button></div>}
    <div className="sb-body">
      <main className="sb-board" onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget('') }}>
        <div className="sb-columns">
          {board.columns.map(column => <section key={column.id} className={`sb-column ${dropTarget === `column:${column.id}` ? 'sb-drop' : ''}`}
            onDragOver={event => over(event, `column:${column.id}`, ['column', 'group'])}
            onDrop={event => drop(event, item => { if (item.kind === 'column') commit(moveBoardColumn(boardRef.current, item.id, column.id)); if (item.kind === 'group') commit(moveBoardGroup(boardRef.current, item.id, column.id)) })}>
            <div className="sb-column-heading" draggable onDragStart={event => startDrag(event, { kind: 'column', id: column.id })} onDragEnd={finishDrag}
              onMouseEnter={() => setHover({ kind: 'column', id: column.id, name: column.name })}
              onMouseLeave={() => { if (hoverTargetRef.current?.kind === 'column' && hoverTargetRef.current.id === column.id) setHover(null) }}>
              <GripVertical size={12} /><button className="sb-column-name" onClick={() => setEditor({ kind: 'column', id: column.id, value: column.name })} title={zh ? '重命名列（按 F2 或点击，拖动排序）' : 'Rename column (F2 or click; drag to reorder)'}>{column.name}</button>
              <button aria-label={zh ? '删除列，保留会话' : 'Remove column; keep chats'} onClick={() => setDeleting({ kind: 'column', id: column.id })}>×</button>
            </div>
            {column.groups.filter(group => !focusedGroup || focusedGroup === group.id).map(group => {
              const groupSessions = group.sessionIds.flatMap(id => visible.has(id) ? [visible.get(id)!] : [])
              return <div key={group.id} className={`sb-card ${dropTarget === `group:${group.id}` ? 'sb-drop' : ''}`}
                onDragOver={event => over(event, `group:${group.id}`, ['session', 'group'])}
                onDrop={event => { if (dragged.current?.kind !== 'column') drop(event, item => { if (item.kind === 'session') commit(moveBoardSession(boardRef.current, item.id, group.id)); if (item.kind === 'group') commit(moveBoardGroup(boardRef.current, item.id, column.id, group.id)) }) }}>
                <div className="sb-card-header" draggable onDragStart={event => startDrag(event, { kind: 'group', id: group.id })} onDragEnd={finishDrag}
                  onMouseEnter={() => setHover({ kind: 'group', id: group.id, name: group.name })}
                  onMouseLeave={() => { if (hoverTargetRef.current?.kind === 'group' && hoverTargetRef.current.id === group.id) setHover(null) }}>
                  <button className="sb-group-toggle" onClick={() => commit({ ...board, columns: board.columns.map(col => ({ ...col, groups: col.groups.map(g => g.id === group.id ? { ...g, collapsed: !g.collapsed } : g) })) })} aria-expanded={!group.collapsed}>
                    {group.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}<span>{group.name}</span></button>
                  <span className="sb-count" title={zh ? '当前筛选下的会话数' : 'Conversations matching filters'}>{groupSessions.length}</span>
                  <button className="sb-group-action" title={zh ? '重命名分组' : 'Rename group'} onClick={() => setEditor({ kind: 'group', id: group.id, value: group.name })}>✎</button>
                  <button className="sb-group-action" title={zh ? '聚焦分组' : 'Focus group'} onClick={() => setFocusedGroup(focusedGroup === group.id ? null : group.id)}>◎</button>
                  <button className="sb-group-action" title={zh ? '删除分组，保留会话' : 'Remove group; keep chats'} onClick={() => setDeleting({ kind: 'group', id: group.id })}>×</button>
                </div>
                {!group.collapsed && <div className="sb-group-content">{groupSessions.map(session => renderSession(session, group.id))}{!groupSessions.length && <div className="sb-empty">{zh ? '拖入会话' : 'Drop conversations here'}</div>}</div>}
              </div>
            })}
            {dragging && (
              <button className={`sb-placeholder sb-new-group ${dropTarget === `newgroup:${column.id}` ? 'sb-drop' : ''}`} onClick={() => addGroup(column.id)}
                onDragOver={event => over(event, `newgroup:${column.id}`, ['session', 'group'])} onDrop={event => drop(event, item => { if (item.kind === 'session') addGroup(column.id, item.id); if (item.kind === 'group') commit(moveBoardGroup(boardRef.current, item.id, column.id)) })}>+ New Group</button>
            )}
          </section>)}
          {(dragging || board.columns.length === 0) && (
            <button className={`sb-placeholder sb-new-column ${dropTarget === 'newcolumn' ? 'sb-drop' : ''}`} onClick={() => setEditor({ kind: 'column', value: '' })}
              onDragOver={event => over(event, 'newcolumn', ['session', 'group', 'column'])} onDrop={event => drop(event, item => {
                if (item.kind === 'session') setEditor({ kind: 'column', value: '', sessionId: item.id })
                if (item.kind === 'group') setEditor({ kind: 'column', value: '', groupId: item.id })
                if (item.kind === 'column') commit(moveBoardColumn(boardRef.current, item.id))
              })}><Plus size={16} /><span>New Column</span></button>
          )}
        </div>
        {(query.trim() || showAllUngrouped) && <section className="sb-search-results"><h2>{zh ? '匹配会话（可拖入分组）' : 'Matching chats (drag into groups)'} · {(query.trim() ? filtered : overflow).length}</h2><div className="sb-results-grid">{(query.trim() ? filtered : overflow).map(session => renderSession(session, allGrouped.has(session.id) ? board.columns.flatMap(column => column.groups).find(group => group.sessionIds.includes(session.id))?.id : undefined))}</div>{!filtered.length && <div className="sb-empty">{zh ? '没有匹配的会话' : 'No matching conversations'}</div>}</section>}
      </main>
      <div className={`sb-dock ${dropTarget === 'recent' ? 'sb-drop' : ''}`}
        onDragOver={event => over(event, 'recent', ['session'])}
        onDrop={event => drop(event, item => { if (item.kind === 'session') recycle(item.id) })}>
        <div className="sb-dock-list">
          {recent.map(session => renderSession(session))}
          {!recent.length && <div className="sb-dock-empty">{zh ? '暂无待整理对话（悬浮卡片按 R 可移回这里）' : 'No chats in tray (hover card + press R to return here)'}</div>}
          {overflow.length > 0 && <button className="sb-dock-overflow" onClick={() => setShowAllUngrouped(!showAllUngrouped)} title={zh ? `另有 ${overflow.length} 条未分组会话，点击查看` : `+${overflow.length} more ungrouped chats`}>+{overflow.length}</button>}
        </div>
      </div>
    </div>
    <footer className="sb-footer">
      <button onClick={() => { onNewSession(projects.find(project => project.id === projectId)?.worktree); onClose() }}>+ New chat</button>
      <button onClick={() => addGroup(board.columns[0]?.id)}>+ New group</button>
      <div className="sb-help-container">
        <button className="sb-help-btn" type="button" aria-label={zh ? '快捷操作说明' : 'Shortcuts & Help'}>
          <HelpCircle size={15} />
        </button>
        <div className="sb-help-tooltip" role="tooltip">
          <div className="sb-help-title">{zh ? '快捷操作说明' : 'Shortcuts & Tips'}</div>
          <div className="sb-help-item"><kbd>Tab</kbd><span>{zh ? '聚焦搜索框' : 'Focus search'}</span></div>
          <div className="sb-help-item"><kbd>悬浮 + F2</kbd><span>{zh ? '重命名会话 / 分组 / 列' : 'Rename item'}</span></div>
          <div className="sb-help-item"><kbd>悬浮 + R</kbd><span>{zh ? '移回底栏待整理' : 'Return to tray'}</span></div>
          <div className="sb-help-item"><kbd>悬浮 + D</kbd><span>{zh ? '快速归档 / 恢复' : 'Archive / Restore'}</span></div>
          <div className="sb-help-item"><kbd>单击</kbd><span>{zh ? '直接进入会话' : 'Open chat'}</span></div>
          <div className="sb-help-item"><kbd>拖拽</kbd><span>{zh ? '跨组 / 跨列自由分类' : 'Drag to arrange'}</span></div>
          <div className="sb-help-item"><kbd>Ctrl+Shift+A</kbd><span>{zh ? '切换看板' : 'Toggle board'}</span></div>
          <div className="sb-help-item"><kbd>Esc</kbd><span>{zh ? '关闭看板' : 'Close'}</span></div>
        </div>
      </div>
    </footer>
    {editor && <div className="sb-editor-shade"><form className="sb-editor" onSubmit={event => { event.preventDefault(); editCommit() }}><label>{editor.kind === 'session' ? (zh ? '重命名会话' : 'Rename Conversation') : editor.id ? (zh ? '重命名' : 'Rename') : editor.kind === 'group' ? 'New Group' : 'New Column'}<input autoFocus maxLength={100} value={editor.value} onChange={event => setEditor({ ...editor, value: event.target.value })} onKeyDown={event => { if (isIMEActive(event) && event.key === 'Enter') event.preventDefault() }} /></label><div><button type="button" onClick={() => setEditor(null)}>{zh ? '取消' : 'Cancel'}</button><button type="submit" disabled={!editor.value.trim()}>{zh ? '保存' : 'Save'}</button></div></form></div>}
    {deleting && <div className="sb-confirm-scope"><CountdownConfirmDialog isOpen title={zh ? '移除组织容器？' : 'Remove this container?'} description={zh ? '其中会话将移回待整理区，历史会保留。' : 'Conversations return to the ungrouped pool. History is preserved.'} onConfirm={deleteItem} onClose={() => setDeleting(null)} isDestructive /></div>}
  </div>
}
