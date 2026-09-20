import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { Project, Session } from '../types/opencode'
import { api, normalizeSession, canonicalizeDirectory, sanitizeSessionTitle } from '../services/api'
import { sseManager } from '../services/sse'
import {
  calculateCloseTabState,
  closeOtherTabsState,
  closeTabsToRightState,
} from '../utils/tab-navigation'
import {
  getArchivedSessionIds,
  archiveSessionId,
  unarchiveSessionId,
  toggleArchiveSessionId,
  isSessionArchived,
} from '../utils/archiving'
import { planSessionActivation, resolveCanonicalProjectId } from '../utils/session-workspace'

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
  const [archivedIds, setArchivedIds] = useState<string[]>(() => getArchivedSessionIds())
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [openTabIds, setOpenTabIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)

  const sessionsRef = useRef<Session[]>(sessions)
  const projectsRef = useRef<Project[]>(projects)
  const activeSessionIdRef = useRef<string | null>(activeSessionId)
  const selectGenerationRef = useRef(0)

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])
  useEffect(() => {
    projectsRef.current = projects
  }, [projects])
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  const writeSessionUrl = useCallback((sessionId: string | null) => {
    try {
      const url = new URL(window.location.href)
      if (!sessionId || sessionId === DRAFT_SESSION_ID) {
        url.searchParams.delete('session')
      } else {
        url.searchParams.set('session', sessionId)
      }
      window.history.replaceState({}, '', url.toString())
    } catch {
      // ignore in non-browser environments
    }
  }, [])

  const applySessionActivation = useCallback(
    (plan: ReturnType<typeof planSessionActivation>) => {
      if (!plan.session) return
      const session = plan.session
      if (plan.shouldInsert) {
        setSessions((prev) => (prev.some((s) => s.id === session.id) ? prev : [session, ...prev]))
      }
      setActiveSessionId(session.id)
      setOpenTabIds((prev) => (prev.includes(session.id) ? prev : [...prev, session.id]))
      if (plan.projectId) {
        setSelectedProjectId(plan.projectId)
      }
      writeSessionUrl(session.id)
    },
    [writeSessionUrl]
  )

  const refresh = useCallback(async () => {
    try {
      const [projList, sessList] = await Promise.all([
        api.getProjects(),
        api.getSessions(),
      ])
      setProjects(projList)

      const urlParams = new URLSearchParams(window.location.search)
      const urlSessionId = urlParams.get('session')
      let nextSessions = sessList
      let fetchedMissing: Session | null = null

      if (urlSessionId && !sessList.some((s) => s.id === urlSessionId)) {
        try {
          fetchedMissing = await api.getSession(urlSessionId)
          nextSessions = [fetchedMissing, ...sessList.filter((s) => s.id !== fetchedMissing?.id)]
        } catch (err) {
          console.error('Failed to fetch deep-linked session:', err)
        }
      }

      setSessions(nextSessions)

      if (urlSessionId) {
        const plan = planSessionActivation({
          sessionId: urlSessionId,
          localSessions: nextSessions,
          fetchedSession: fetchedMissing,
          projects: projList,
        })
        if (plan.session) {
          applySessionActivation({ ...plan, shouldInsert: false })
          return
        }
      }

      if (nextSessions.length > 0 && !activeSessionIdRef.current) {
        const validSessions = nextSessions.filter((s) => {
          const isAbandoned =
            Boolean(s.title?.startsWith('New session - ')) &&
            (!s.tokens || (s.tokens.input === 0 && s.tokens.output === 0)) &&
            (!s.summary || s.summary.files === 0)
          return !isAbandoned
        })
        if (validSessions.length > 0) {
          const first = validSessions[0]
          setActiveSessionId(first.id)
          setOpenTabIds([first.id])
          const pid = resolveCanonicalProjectId(first, projList)
          if (pid) setSelectedProjectId(pid)
        }
      }
    } catch (err) {
      console.error('Failed to load projects/sessions:', err)
    } finally {
      setLoading(false)
    }
  }, [applySessionActivation])

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

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'opencode_archived_sessions') {
        setArchivedIds(getArchivedSessionIds())
      }
    }
    const handleArchivedUpdate = () => setArchivedIds(getArchivedSessionIds())
    window.addEventListener('storage', handleStorage)
    window.addEventListener('opencode_archived_sessions_updated', handleArchivedUpdate)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('opencode_archived_sessions_updated', handleArchivedUpdate)
    }
  }, [])

  const selectSession = useCallback((sessionId: string) => {
    const generation = ++selectGenerationRef.current
    if (sessionId === DRAFT_SESSION_ID) {
      setActiveSessionId(DRAFT_SESSION_ID)
      setOpenTabIds((prev) => (prev.includes(DRAFT_SESSION_ID) ? prev : [...prev, DRAFT_SESSION_ID]))
      writeSessionUrl(DRAFT_SESSION_ID)
      return
    }

    const localPlan = planSessionActivation({
      sessionId,
      localSessions: sessionsRef.current,
      fetchedSession: null,
      projects: projectsRef.current,
    })
    if (localPlan.session) {
      applySessionActivation(localPlan)
      return
    }

    void api
      .getSession(sessionId)
      .then((fetched) => {
        if (generation !== selectGenerationRef.current) return
        const remotePlan = planSessionActivation({
          sessionId,
          localSessions: sessionsRef.current,
          fetchedSession: fetched,
          projects: projectsRef.current,
        })
        applySessionActivation(remotePlan)
      })
      .catch((err: unknown) => {
        if (generation !== selectGenerationRef.current) return
        console.error('Failed to fetch session for selection:', err)
        setActiveSessionId(sessionId)
        setOpenTabIds((prev) => (prev.includes(sessionId) ? prev : [...prev, sessionId]))
        writeSessionUrl(sessionId)
      })
  }, [applySessionActivation, writeSessionUrl])

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

      // Exclude archived sessions from active history list
      if (archivedIds.includes(s.id)) return false

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
        agent: 'build',
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
      const sanitizedPatch = { ...patch }
      if (patch.title !== undefined) {
        sanitizedPatch.title = sanitizeSessionTitle(patch.title)
      }
      // 1. Optimistic update in local state
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, ...sanitizedPatch } : s))
      )

      // 2. Persist to backend if title is being updated
      if (patch.title !== undefined) {
        try {
          const current = sessions.find((s) => s.id === sessionId)
          await api.updateSession(sessionId, {
            title: sanitizedPatch.title,
            directory: current?.directory,
          })
        } catch (err) {
          console.error('Failed to update session title on server:', err)
        }
      }
    },
    [sessions]
  )

  const archivedSessions = useMemo(() => {
    const set = new Set(archivedIds)
    return sessions.filter((s) => set.has(s.id))
  }, [sessions, archivedIds])

  const archiveSession = useCallback((sessionId: string) => {
    const res = archiveSessionId(sessionId)
    setArchivedIds(res.archivedIds)
    return res
  }, [])

  const unarchiveSession = useCallback((sessionId: string) => {
    const res = unarchiveSessionId(sessionId)
    setArchivedIds(res.archivedIds)
    return res
  }, [])

  const toggleArchiveSession = useCallback((sessionId: string) => {
    const res = toggleArchiveSessionId(sessionId)
    setArchivedIds(res.archivedIds)
    return res
  }, [])

  return {
    projects,
    sessions,
    archivedIds,
    archivedSessions,
    archiveSession,
    unarchiveSession,
    toggleArchiveSession,
    isArchived: (sessionId: string) => isSessionArchived(sessionId, archivedIds),
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
