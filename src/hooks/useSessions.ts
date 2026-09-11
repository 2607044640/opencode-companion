import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Project, Session } from '../types/opencode'
import { api, normalizeSession } from '../services/api'
import { sseManager } from '../services/sse'

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

  // Support cross-OS path equivalence (e.g. C:/APISpace vs /home/developer/projects/APISpace)
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

      // If URL specifies ?session=xxx, select that session; otherwise pick latest
      const urlParams = new URLSearchParams(window.location.search)
      const urlSessionId = urlParams.get('session')
      if (urlSessionId && sessList.some((s) => s.id === urlSessionId)) {
        setActiveSessionId(urlSessionId)
        setOpenTabIds((prev) => (prev.includes(urlSessionId) ? prev : [...prev, urlSessionId]))
      } else if (sessList.length > 0 && !activeSessionId) {
        const first = sessList[0].id
        setActiveSessionId(first)
        setOpenTabIds([first])
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
      url.searchParams.set('session', sessionId)
      window.history.replaceState({}, '', url.toString())
    } catch {
      // ignore in non-browser environments
    }
  }, [])

  // Close a tab
  const closeTab = useCallback(
    (sessionId: string) => {
      setOpenTabIds((prev) => {
        const next = prev.filter((id) => id !== sessionId)
        if (activeSessionId === sessionId) {
          setActiveSessionId(next.length > 0 ? next[next.length - 1] : null)
        }
        return next
      })
    },
    [activeSessionId]
  )

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
        selectSession(newSession.id)
        return newSession
      } catch (err) {
        console.error('Failed to create session:', err)
        throw err
      }
    },
    [selectSession]
  )

  // Delete session
  const deleteSession = useCallback(
    async (sessionId: string) => {
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
    return sessions.find((s) => s.id === activeSessionId) || null
  }, [sessions, activeSessionId])

  return {
    projects,
    sessions,
    selectedProjectId,
    setSelectedProjectId,
    activeSessionId,
    activeSession,
    openTabIds,
    searchQuery,
    setSearchQuery,
    loading,
    groupedSessions,
    selectSession,
    closeTab,
    createNewSession,
    deleteSession,
    refresh,
  }
}
