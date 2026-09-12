import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { Project, Session } from '../types/opencode'
import { api, normalizeSession, canonicalizeDirectory } from '../services/api'
import { sseManager } from '../services/sse'
import {
  calculateCloseTabState,
  closeOtherTabsState,
  closeTabsToRightState,
} from '../utils/tab-navigation'

export const DRAFT_SESSION_ID = '__draft__'

export interface SessionGroup {
  label: string
  sessions: Session[]
}

function normalizePath(p?: string): string {
  if (!p) return ''
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function isSameOrSubdirectory(parentPath: string, targetPath: string): boolean {
  const parent = normalizePath(parentPath)
  const target = normalizePath(targetPath)
  if (!parent || !target) return false
  if (parent === target) return true
  if (target.startsWith(parent + '/')) return true

  // Support cross-OS path equivalence (e.g. C:/projects/APISpace vs /workspace/projects/APISpace)
  const parentSegments = parent.split('/').filter(Boolean)
  const parentBase = parentSegments.pop()
  if (!parentBase) return false

  const targetSegments = target.split('/').filter(Boolean)
  if (targetSegments.includes(parentBase)) {
    return true
  }

  return false
}

export function useSessions() {
  const [projects, setProjects] = useState<Project[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [openTabIds, setOpenTabIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)

  const refresh = useCallback(async () => {
    try {
      const [projList, sessList] = await Promise.all([
        api.getProjects(),
        api.getSessions(),
      ])
      setProjects(projList)
      setSessions(sessList)

      // If URL specifies ?session=xxx, select that session; otherwise pick latest valid session
      const urlParams = new URLSearchParams(window.location.search)
      const urlSessionId = urlParams.get('session')
      if (urlSessionId && sessList.some((s) => s.id === urlSessionId)) {
        setActiveSessionId(urlSessionId)
        setOpenTabIds((prev) => (prev.includes(urlSessionId) ? prev : [...prev, urlSessionId]))
      } else if (sessList.length > 0 && !activeSessionId) {
        const validSessions = sessList.filter((s) => {
          const isAbandoned =
            Boolean(s.title?.startsWith('New session - ')) &&
            (!s.tokens || (s.tokens.input === 0 && s.tokens.output === 0)) &&
            (!s.summary || s.summary.files === 0)
          return !isAbandoned
        })
        if (validSessions.length > 0) {
          const first = validSessions[0].id
          setActiveSessionId(first)
          setOpenTabIds([first])
        }
      }
    } catch (err) {
      console.error('Failed to load projects/sessions:', err)
    } finally {
      setLoading(false)
    }
  }, [activeSessionId])

  useEffect(() => {
    refresh()

    // Listen to session lifecycle events from SSE
    const unsubCreated = sseManager.on('session.created', (rawSession: any) => {
      const session = normalizeSession(rawSession)
      setSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)])
    })

    const unsubDeleted = sseManager.on('session.deleted', (data: { id?: string; sessionID?: string }) => {
      const targetId = data.id || data.sessionID
      if (targetId) {
        setSessions((prev) => prev.filter((s) => s.id !== targetId))
        setOpenTabIds((prev) => {
          const next = prev.filter((id) => id !== targetId)
          setActiveSessionId((current) => {
            if (current === targetId) {
              return next.length > 0 ? next[next.length - 1] : null
            }
            return current
          })
          return next
        })
      }
    })

    const unsubUpdated = sseManager.on('session.updated', (rawSession: any) => {
      const session = normalizeSession(rawSession)
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, ...session } : s)))
    })

    return () => {
      unsubCreated()
      unsubDeleted()
      unsubUpdated()
    }
  }, [refresh])

  // Select a session and add it to open tabs if not present
  const selectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
    setOpenTabIds((prev) => {
      if (!prev.includes(sessionId)) {
        return [...prev, sessionId]
      }
      return prev
    })
    try {
      const url = new URL(window.location.href)
      if (sessionId === DRAFT_SESSION_ID) {
        url.searchParams.delete('session')
      } else {
        url.searchParams.set('session', sessionId)
      }
      window.history.replaceState({}, '', url.toString())
    } catch {
      // ignore in non-browser environments
    }
  }, [])

  const recentlyClosedRef = useRef<string[]>([])
  const [recentlyClosedTabIds, setRecentlyClosedTabIds] = useState<string[]>([])

  const recordClosedTab = useCallback((tabId: string) => {
    if (tabId === DRAFT_SESSION_ID) return
    recentlyClosedRef.current = [tabId, ...recentlyClosedRef.current.filter((id) => id !== tabId)].slice(0, 30)
    setRecentlyClosedTabIds([...recentlyClosedRef.current])
  }, [])

  // Close a tab
  const closeTab = useCallback(
    (sessionId?: string) => {
      const targetId = sessionId ?? activeSessionId
      if (!targetId) return
      recordClosedTab(targetId)
      setOpenTabIds((prev) => {
        const result = calculateCloseTabState(prev, activeSessionId, targetId)
        if (activeSessionId === targetId) {
          setActiveSessionId(result.nextActiveId)
          try {
            const url = new URL(window.location.href)
            if (result.nextActiveId) {
              url.searchParams.set('session', result.nextActiveId)
            } else {
              url.searchParams.delete('session')
            }
            window.history.replaceState({}, '', url.toString())
          } catch {}
        }
        return result.nextTabs
      })
    },
    [activeSessionId, recordClosedTab]
  )

  // Reopen the most recently closed session tab (Ctrl+Shift+T)
  const reopenClosedTab = useCallback(() => {
    const list = recentlyClosedRef.current
    const foundIdx = list.findIndex((id) => sessions.some((s) => s.id === id) && !openTabIds.includes(id))
    if (foundIdx === -1) return false
    const targetId = list[foundIdx]
    recentlyClosedRef.current = [...list.slice(0, foundIdx), ...list.slice(foundIdx + 1)]
    setRecentlyClosedTabIds([...recentlyClosedRef.current])
    selectSession(targetId)
    return true
  }, [sessions, openTabIds, selectSession])

  // Close all tabs except the specified one
  const closeOtherTabs = useCallback(
    (keepId: string) => {
      setOpenTabIds((prev) => {
        const { nextTabs, closedIds } = closeOtherTabsState(prev, keepId)
        closedIds.forEach((id) => recordClosedTab(id))
        if (activeSessionId !== keepId) {
          selectSession(keepId)
        }
        return nextTabs
      })
    },
    [activeSessionId, recordClosedTab, selectSession]
  )

  // Close all tabs to the right of the specified one
  const closeTabsToRight = useCallback(
    (targetId: string) => {
      setOpenTabIds((prev) => {
        const { nextTabs, closedIds } = closeTabsToRightState(prev, targetId)
        closedIds.forEach((id) => recordClosedTab(id))
        if (activeSessionId && closedIds.includes(activeSessionId)) {
          selectSession(targetId)
        }
        return nextTabs
      })
    },
    [activeSessionId, recordClosedTab, selectSession]
  )

  // Start draft session (does NOT call backend api.createSession)
  const startDraftSession = useCallback(() => {
    setActiveSessionId(DRAFT_SESSION_ID)
    setOpenTabIds((prev) => (prev.includes(DRAFT_SESSION_ID) ? prev : [...prev, DRAFT_SESSION_ID]))
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('session')
      window.history.replaceState({}, '', url.toString())
    } catch {}
  }, [])

  // Create new session
  const createNewSession = useCallback(
    async (params?: {
      title?: string
      agent?: string
      directory?: string
      model?: { id: string; providerID: string; variant?: string }
    }) => {
      try {
        const newSession = await api.createSession(params)
        setSessions((prev) => [newSession, ...prev])
        // Swap draft tab in-place if open, or select new session
        setOpenTabIds((prev) => {
          if (prev.includes(DRAFT_SESSION_ID)) {
            return prev.map((id) => (id === DRAFT_SESSION_ID ? newSession.id : id))
          }
          return prev.includes(newSession.id) ? prev : [...prev, newSession.id]
        })
        setActiveSessionId(newSession.id)
        try {
          const url = new URL(window.location.href)
          url.searchParams.set('session', newSession.id)
          window.history.replaceState({}, '', url.toString())
        } catch {}
        return newSession
      } catch (err) {
        console.error('Failed to create session:', err)
        throw err
      }
    },
    []
  )

  // Delete session
  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === DRAFT_SESSION_ID) {
        closeTab(sessionId)
        return
      }
      try {
        await api.deleteSession(sessionId)
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
        closeTab(sessionId)
      } catch (err) {
        console.error('Failed to delete session:', err)
        throw err
      }
    },
    [closeTab]
  )

  // Filter and group sessions with directory-based matching
  const filteredSessions = useMemo(() => {
    const selectedProject = selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId || (p.associatedIds && p.associatedIds.includes(selectedProjectId)))
      : null

    return sessions.filter((s) => {
      // Never show draft session in history list
      if (s.id === DRAFT_SESSION_ID) return false

      // Filter out abandoned empty sessions created by previous instant new-session clicks
      const isAbandonedEmpty =
        Boolean(s.title?.startsWith('New session - ')) &&
        (!s.tokens || (s.tokens.input === 0 && s.tokens.output === 0)) &&
        (!s.summary || s.summary.files === 0)
      if (isAbandonedEmpty) return false

      let matchProject = true
      if (selectedProject) {
        if (selectedProject.id === 'global' || selectedProject.worktree === '/') {
          matchProject = true
        } else {
          const dirMatch = Boolean(
            s.directory &&
            selectedProject.worktree &&
            isSameOrSubdirectory(selectedProject.worktree, s.directory)
          )
          const idMatch =
            s.projectID === selectedProject.id ||
            Boolean(selectedProject.associatedIds && selectedProject.associatedIds.includes(s.projectID))
          matchProject = dirMatch || idMatch
        }
      }

      const matchQuery = searchQuery
        ? (s.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.id.toLowerCase().includes(searchQuery.toLowerCase())
        : true

      return matchProject && matchQuery
    })
  }, [sessions, projects, selectedProjectId, searchQuery])

  // Group sessions by date category (Today, Yesterday, Older)
  const groupedSessions = useMemo((): SessionGroup[] => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const groups: Record<string, Session[]> = {
      Today: [],
      Yesterday: [],
      Older: [],
    }

    filteredSessions.forEach((session) => {
      const time = session.time?.updated || session.time?.created || 0
      const date = new Date(time)

      if (date >= today) {
        groups.Today.push(session)
      } else if (date >= yesterday) {
        groups.Yesterday.push(session)
      } else {
        groups.Older.push(session)
      }
    })

    const result: SessionGroup[] = []
    if (groups.Today.length > 0) result.push({ label: 'Today', sessions: groups.Today })
    if (groups.Yesterday.length > 0) result.push({ label: 'Yesterday', sessions: groups.Yesterday })
    if (groups.Older.length > 0) result.push({ label: 'Older', sessions: groups.Older })

    return result
  }, [filteredSessions])

  const activeSession = useMemo(() => {
    if (activeSessionId === DRAFT_SESSION_ID) {
      const selectedProject = selectedProjectId
        ? projects.find(
            (p) =>
              p.id === selectedProjectId ||
              Boolean(p.associatedIds && p.associatedIds.includes(selectedProjectId))
          )
        : null
      return {
        id: DRAFT_SESSION_ID,
        slug: 'draft',
        projectID: selectedProjectId || 'global',
        directory: canonicalizeDirectory(selectedProject?.worktree) || '',
        title: '新会话',
        agent: 'Atlas - Plan Executor',
        model: { id: 'grok-4.6', providerID: 'obsidian' },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        cost: 0,
        time: { created: Date.now(), updated: Date.now() },
      } as Session
    }
    return sessions.find((s) => s.id === activeSessionId) || null
  }, [sessions, activeSessionId, selectedProjectId, projects])

  const updateSession = useCallback(
    async (sessionId: string, patch: Partial<Session>) => {
      if (sessionId === DRAFT_SESSION_ID) return
      // 1. Optimistic update in local state
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, ...patch } : s))
      )

      // 2. Persist to backend if title is being updated
      if (patch.title !== undefined) {
        try {
          const current = sessions.find((s) => s.id === sessionId)
          await api.updateSession(sessionId, {
            title: patch.title,
            directory: current?.directory,
          })
        } catch (err) {
          console.error('Failed to update session title on server:', err)
        }
      }
    },
    [sessions]
  )

  return {
    projects,
    sessions,
    selectedProjectId,
    setSelectedProjectId,
    activeSessionId,
    activeSession,
    isDraftSession: activeSessionId === DRAFT_SESSION_ID,
    openTabIds,
    searchQuery,
    setSearchQuery,
    loading,
    groupedSessions,
    selectSession,
    startDraftSession,
    closeTab,
    reopenClosedTab,
    closeOtherTabs,
    closeTabsToRight,
    recentlyClosedTabIds,
    createNewSession,
    deleteSession,
    updateSession,
    refresh,
  }
}
