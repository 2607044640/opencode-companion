import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  X,
  FolderGit2,
  Clock,
  ArrowRight,
  Folder,
  MessageSquare,
  FileText,
  Loader2,
  User,
  Bot,
  Sparkles,
  Archive,
} from 'lucide-react'
import type { Session, Project } from '../../types/opencode'
import { matchCanonicalWorkspace, api } from '../../services/api'
import { useI18n, type TranslationDictionary } from '../../utils/i18n'
import { getArchivedSessionIds, isSessionArchived } from '../../utils/archiving'
import type { SearchMode, MessageSearchHit } from './search-types'
import { messageCache, extractSearchableDocs } from './message-cache'
import {
  queryAllCachedMessages,
  type SessionSearchTarget,
} from './message-search'
import {
  formatProjectPill,
  resolveSessionProject,
  selectSearchCorpus,
  sessionBelongsToProjectFilter,
  type SessionProjectBadge,
} from '../../utils/session-workspace'

import { HighlightedText } from '../map/canvas/HighlightedText'

export interface FloatingSearchModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onSelectSession: (sessionId: string, messageId?: string) => void
  readonly sessions: readonly Session[]
  readonly projects: readonly Project[]
  readonly initialSelectedProjectId?: string | null
  readonly unreadSessionIds?: readonly string[]
}

function formatSessionTime(timestamp?: number, t?: TranslationDictionary): string {
  if (!timestamp) return ''
  const now = Date.now()
  const diff = now - timestamp
  const oneMinute = 60 * 1000
  const oneHour = 60 * oneMinute
  const oneDay = 24 * oneHour

  if (diff < oneMinute) return t ? t.search.timeJustNow : '刚刚'
  if (diff < oneHour) return t ? t.search.timeMinutesAgo(Math.floor(diff / oneMinute)) : `${Math.floor(diff / oneMinute)} 分钟前`
  if (diff < oneDay) return t ? t.search.timeHoursAgo(Math.floor(diff / oneHour)) : `${Math.floor(diff / oneHour)} 小时前`
  if (diff < 2 * oneDay) return t ? t.search.timeYesterday : '昨天'
  if (diff < 7 * oneDay) return t ? t.search.timeDaysAgo(Math.floor(diff / oneDay)) : `${Math.floor(diff / oneDay)} 天前`

  const date = new Date(timestamp)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

const FALLBACK_SEARCH_BADGE: SessionProjectBadge = {
  id: 'unknown',
  name: 'Project',
  colorClass: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  abbreviation: 'PR',
}

function toMessageSearchMeta(badge: SessionProjectBadge, directory?: string) {
  return {
    projectId: badge.id,
    projectName: formatProjectPill(badge.name),
    projectColorClass: badge.colorClass,
    directory,
  }
}

export function FloatingSearchModal(props: FloatingSearchModalProps) {
  if (!props.isOpen) {
    return null
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-modal="floating-search"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none"
      style={{
        backdropFilter: 'blur(8px)',
        background: 'rgba(0, 0, 0, 0.6)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          props.onClose()
        }
      }}
    >
      <div
        className="flex flex-col bg-[#0f1115] border border-[#272a31] text-[#e6edf3] overflow-hidden"
        style={{
          width: '85vw',
          height: '85vh',
          maxWidth: '98vw',
          maxHeight: '96vh',
          borderRadius: '12px',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.45)',
        }}
      >
        <FloatingSearchContent {...props} />
      </div>
    </div>
  )
}

function FloatingSearchContent({
  onClose,
  onSelectSession,
  sessions,
  projects,
  initialSelectedProjectId,
  unreadSessionIds,
}: FloatingSearchModalProps) {
  const { t, lang } = useI18n()
  const isZh = lang === 'zh-CN'
  const [archivedIds, setArchivedIds] = useState<string[]>(() => getArchivedSessionIds())

  useEffect(() => {
    const handleArchivedUpdate = () => setArchivedIds(getArchivedSessionIds())
    window.addEventListener('storage', handleArchivedUpdate)
    window.addEventListener('opencode_archived_sessions_updated', handleArchivedUpdate)
    return () => {
      window.removeEventListener('storage', handleArchivedUpdate)
      window.removeEventListener('opencode_archived_sessions_updated', handleArchivedUpdate)
    }
  }, [])

  const [searchMode, setSearchMode] = useState<SearchMode>(() => {
    try {
      const saved = sessionStorage.getItem('opencode_search_mode')
      if (saved === 'messages' || saved === 'titles') {
        return saved
      }
    } catch {
      // Ignore storage error
    }
    return 'titles'
  })

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedProjectIdFilter, setSelectedProjectIdFilter] = useState<string>(
    () => initialSelectedProjectId || 'ALL'
  )

  const [messageHits, setMessageHits] = useState<MessageSearchHit[]>([])
  const [isSearchingMessages, setIsSearchingMessages] = useState(false)

  const isComposingRef = useRef(false)
  const lastCompositionEndTimeRef = useRef(0)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listContainerRef = useRef<HTMLDivElement | null>(null)

  // 1. Continuous input focus: auto-focus search input immediately on modal open
  useEffect(() => {
    searchInputRef.current?.focus()
    const timer = setTimeout(() => {
      searchInputRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  // Chinese IME Shield: composition listeners and state detection
  const handleCompositionStart = () => {
    isComposingRef.current = true
  }

  const handleCompositionEnd = () => {
    isComposingRef.current = false
    lastCompositionEndTimeRef.current = Date.now()
  }

  const isIMEActive = (e: React.KeyboardEvent | KeyboardEvent) => {
    const isComp = 'nativeEvent' in e ? e.nativeEvent.isComposing : e.isComposing
    return (
      isComposingRef.current ||
      Boolean(isComp) ||
      e.keyCode === 229 ||
      e.key === 'Process' ||
      Date.now() - lastCompositionEndTimeRef.current < 60
    )
  }

  const sessionProjectMap = useMemo(() => {
    const map = new Map<string, SessionProjectBadge>()
    for (const s of sessions) {
      map.set(s.id, resolveSessionProject(s, projects))
    }
    return map
  }, [sessions, projects])

  // Filter projects for the dropdown
  const filterProjectOptions = useMemo(() => {
    const distinct = new Map<string, string>()
    for (const p of projects) {
      if (p.id === 'global' || p.worktree === '/') continue
      const canonical = matchCanonicalWorkspace(p.worktree, p.name)
      const name = canonical?.name || p.name || p.worktree.split('/').filter(Boolean).pop() || p.id
      distinct.set(p.id, name)
    }
    return Array.from(distinct.entries()).map(([id, name]) => ({ id, name }))
  }, [projects])

  const projectFilteredSessions = useMemo(() => {
    return selectSearchCorpus(sessions, query, selectedProjectIdFilter, (session) => {
      const badge = sessionProjectMap.get(session.id) || FALLBACK_SEARCH_BADGE
      return sessionBelongsToProjectFilter(session, selectedProjectIdFilter, projects, badge)
    })
  }, [sessions, query, selectedProjectIdFilter, sessionProjectMap, projects])

  // Titles mode: Filtered & Ranked sessions
  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase()

    if (!q) {
      // Sort by recent updated time descending
      return [...projectFilteredSessions].sort((a, b) => {
        const timeA = a.time?.updated || a.time?.created || 0
        const timeB = b.time?.updated || b.time?.created || 0
        return timeB - timeA
      })
    }

    const words = q.split(/\s+/).filter(Boolean)

    // Relevance scoring
    const scored: { session: Session; score: number }[] = []

    for (const s of projectFilteredSessions) {
      const rawTitle = s.title?.trim() || 'Untitled Session'
      const titleLower = rawTitle.toLowerCase()
      const dirLower = (s.directory || '').toLowerCase()
      const agentLower = (s.agent || '').toLowerCase()
      const projNameLower = (sessionProjectMap.get(s.id)?.name || '').toLowerCase()

      let score = 0
      // Full phrase matches
      if (titleLower.startsWith(q)) {
        score += 150
      } else if (titleLower.includes(q)) {
        score += 100
      } else if (projNameLower.includes(q)) {
        score += 50
      } else if (dirLower.includes(q)) {
        score += 30
      } else if (agentLower.includes(q)) {
        score += 20
      }

      // Multi-word matching
      if (words.length > 1) {
        let allWordsMatched = true
        let wordScore = 0
        for (const w of words) {
          const inTitle = titleLower.includes(w)
          const inProj = projNameLower.includes(w)
          const inDir = dirLower.includes(w)
          const inAgent = agentLower.includes(w)

          if (inTitle) {
            wordScore += titleLower.startsWith(w) ? 40 : 25
          } else if (inProj) {
            wordScore += 15
          } else if (inDir) {
            wordScore += 10
          } else if (inAgent) {
            wordScore += 5
          } else {
            allWordsMatched = false
            break
          }
        }
        if (allWordsMatched) {
          score += wordScore
        }
      }

      if (score > 0) {
        scored.push({ session: s, score })
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      const timeA = a.session.time?.updated || a.session.time?.created || 0
      const timeB = b.session.time?.updated || b.session.time?.created || 0
      return timeB - timeA
    })

    return scored.map((item) => item.session)
  }, [projectFilteredSessions, query, sessionProjectMap])

  // Messages mode: Lazy background indexing & full-text query pipeline
  useEffect(() => {
    if (searchMode !== 'messages') {
      setMessageHits([])
      setIsSearchingMessages(false)
      return
    }

    const trimmed = query.trim()
    if (!trimmed) {
      setMessageHits([])
      setIsSearchingMessages(false)
      return
    }

    let isCancelled = false
    const abortController = new AbortController()

    const debounceTimer = setTimeout(async () => {
      if (isCancelled) return

      const cachedTargets: SessionSearchTarget[] = []
      const uncachedSessions: Session[] = []

      for (const session of projectFilteredSessions) {
        const cachedDocs = messageCache.get(session.id, session.time?.updated)
        const meta = toMessageSearchMeta(
          sessionProjectMap.get(session.id) || FALLBACK_SEARCH_BADGE,
          session.directory
        )
        if (cachedDocs) {
          cachedTargets.push({
            sessionId: session.id,
            sessionTitle: session.title || 'Untitled Session',
            docs: cachedDocs,
            meta,
            updatedAt: session.time?.updated,
          })
        } else {
          uncachedSessions.push(session)
        }
      }

      // Instant 0ms response from cached sessions
      const initialHits = queryAllCachedMessages(cachedTargets, trimmed)
      if (!isCancelled) {
        setMessageHits(initialHits)
      }

      if (uncachedSessions.length === 0) {
        setIsSearchingMessages(false)
        return
      }

      setIsSearchingMessages(true)

      // Concurrent fetch pool (max 6 requests in-flight)
      const CONCURRENCY_LIMIT = 6
      const allTargets = [...cachedTargets]

      for (let i = 0; i < uncachedSessions.length; i += CONCURRENCY_LIMIT) {
        if (isCancelled || abortController.signal.aborted) break

        const batch = uncachedSessions.slice(i, i + CONCURRENCY_LIMIT)
        await Promise.all(
          batch.map(async (session) => {
            try {
              if (isCancelled || abortController.signal.aborted) return
              const rawMessages = await api.getMessages(session.id)
              const docs = extractSearchableDocs(rawMessages)
              messageCache.set(session.id, session.time?.updated || 0, docs)

              const meta = toMessageSearchMeta(
                sessionProjectMap.get(session.id) || FALLBACK_SEARCH_BADGE,
                session.directory
              )
              allTargets.push({
                sessionId: session.id,
                sessionTitle: session.title || 'Untitled Session',
                docs,
                meta,
                updatedAt: session.time?.updated,
              })
            } catch {
              // Ignore individual session failure or abort
            }
          })
        )

        if (!isCancelled) {
          const updatedHits = queryAllCachedMessages(allTargets, trimmed)
          setMessageHits(updatedHits)
        }
      }

      if (!isCancelled) {
        setIsSearchingMessages(false)
      }
    }, 180)

    return () => {
      isCancelled = true
      abortController.abort()
      clearTimeout(debounceTimer)
    }
  }, [searchMode, query, projectFilteredSessions, sessionProjectMap])

  // Total items in current active mode
  const currentItemCount = searchMode === 'titles' ? filteredSessions.length : messageHits.length
  const safeIndex = currentItemCount > 0 ? Math.min(Math.max(0, selectedIndex), currentItemCount - 1) : 0

  // Scroll active item into view smoothly without stealing DOM focus
  useEffect(() => {
    if (!listContainerRef.current) return
    const activeEl = listContainerRef.current.querySelector<HTMLElement>(`[data-index="${safeIndex}"]`)
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [safeIndex])

  const handleSelectSessionAction = useCallback(
    (sessionId: string, messageId?: string) => {
      onSelectSession(sessionId, messageId)
      onClose()
    },
    [onSelectSession, onClose]
  )

  const handleSelectCurrent = useCallback(() => {
    if (searchMode === 'titles') {
      if (filteredSessions.length > 0 && filteredSessions[safeIndex]) {
        handleSelectSessionAction(filteredSessions[safeIndex].id)
      }
    } else {
      if (messageHits.length > 0 && messageHits[safeIndex]) {
        const hit = messageHits[safeIndex]
        handleSelectSessionAction(hit.sessionId, hit.messageId)
      }
    }
  }, [searchMode, filteredSessions, messageHits, safeIndex, handleSelectSessionAction])

  const handleSwitchMode = (mode: SearchMode) => {
    setSearchMode(mode)
    try {
      sessionStorage.setItem('opencode_search_mode', mode)
    } catch {
      // Ignore
    }
    setSelectedIndex(0)
    searchInputRef.current?.focus()
  }

  // Keyboard navigation inside search input
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isIMEActive(e)) {
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (currentItemCount === 0) return
      setSelectedIndex((prev) => {
        const cur = Math.min(Math.max(0, prev), currentItemCount - 1)
        return (cur + 1) % currentItemCount
      })
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (currentItemCount === 0) return
      setSelectedIndex((prev) => {
        const cur = Math.min(Math.max(0, prev), currentItemCount - 1)
        return (cur - 1 + currentItemCount) % currentItemCount
      })
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      handleSelectCurrent()
      return
    }
  }

  // Lossless keystroke redirection and navigation from anywhere on modal to search input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (isIMEActive(e)) {
        if (document.activeElement !== searchInputRef.current) {
          searchInputRef.current?.focus()
        }
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      const activeEl = document.activeElement
      const isInputActive =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable)

      if (isInputActive) {
        return
      }

      // Continuous input focus: Up/Down arrow navigation keeps focus in the search box
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (currentItemCount > 0) {
          setSelectedIndex((prev) => {
            const cur = Math.min(Math.max(0, prev), currentItemCount - 1)
            return (cur + 1) % currentItemCount
          })
        }
        searchInputRef.current?.focus()
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (currentItemCount > 0) {
          setSelectedIndex((prev) => {
            const cur = Math.min(Math.max(0, prev), currentItemCount - 1)
            return (cur - 1 + currentItemCount) % currentItemCount
          })
        }
        searchInputRef.current?.focus()
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        handleSelectCurrent()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        const input = searchInputRef.current
        if (input) {
          input.focus()
          input.select()
        }
        return
      }

      if (e.key === 'Backspace') {
        e.preventDefault()
        const input = searchInputRef.current
        if (input) {
          input.focus()
          const start = input.selectionStart ?? input.value.length
          const end = input.selectionEnd ?? input.value.length
          if (start !== end) {
            const nextVal = input.value.slice(0, start) + input.value.slice(end)
            setQuery(nextVal)
            setSelectedIndex(0)
            requestAnimationFrame(() => {
              input.setSelectionRange(start, start)
            })
          } else if (start > 0) {
            const nextVal = input.value.slice(0, start - 1) + input.value.slice(start)
            setQuery(nextVal)
            setSelectedIndex(0)
            requestAnimationFrame(() => {
              input.setSelectionRange(start - 1, start - 1)
            })
          }
        }
        return
      }

      if (e.key === 'Delete') {
        e.preventDefault()
        const input = searchInputRef.current
        if (input) {
          input.focus()
          const start = input.selectionStart ?? input.value.length
          const end = input.selectionEnd ?? input.value.length
          if (start !== end) {
            const nextVal = input.value.slice(0, start) + input.value.slice(end)
            setQuery(nextVal)
            setSelectedIndex(0)
            requestAnimationFrame(() => {
              input.setSelectionRange(start, start)
            })
          } else if (start < input.value.length) {
            const nextVal = input.value.slice(0, start) + input.value.slice(start + 1)
            setQuery(nextVal)
            setSelectedIndex(0)
            requestAnimationFrame(() => {
              input.setSelectionRange(start, start)
            })
          }
        }
        return
      }

      if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      }

      // Lossless printable character redirection: typing anywhere focuses search input and inserts first character
      if (e.key.length === 1) {
        e.preventDefault()
        const input = searchInputRef.current
        if (input) {
          input.focus()
          const start = input.selectionStart ?? input.value.length
          const end = input.selectionEnd ?? input.value.length
          const nextVal = input.value.slice(0, start) + e.key + input.value.slice(end)
          setQuery(nextVal)
          setSelectedIndex(0)
          requestAnimationFrame(() => {
            input.setSelectionRange(start + 1, start + 1)
          })
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [currentItemCount, handleSelectCurrent, onClose])

  // Continuous input focus: clicking non-interactive modal areas keeps focus in search input
  const handleNonInteractiveMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button, select, input, textarea, a, .session-search-item')) {
      return
    }
    e.preventDefault()
    if (document.activeElement !== searchInputRef.current) {
      searchInputRef.current?.focus()
    }
  }

  return (
    <>
      <style>{`
        /* Native WebKit Search Artifact Elimination */
        .a1-search-input::-webkit-search-cancel-button,
        .a1-search-input::-webkit-search-decoration,
        .a1-search-input::-webkit-search-results-button,
        .a1-search-input::-webkit-search-results-decoration {
          display: none !important;
          -webkit-appearance: none;
        }
      `}</style>

      {/* 2. Unified Single-Row Top Bar & Anti-Clutter */}
      <div
        className="h-12 border-b border-[#24272b] px-4 flex items-center gap-3 bg-[#12141a] shrink-0"
        onMouseDown={handleNonInteractiveMouseDown}
      >
        {/* Left: Search input occupying remaining width */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleSearchKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder={
              searchMode === 'titles'
                ? t.search.placeholderTitles
                : t.search.placeholderMessages
            }
            className="a1-search-input w-full bg-[#16181e] text-zinc-200 pl-9 pr-8 py-1.5 text-xs rounded-md border border-[#272a31] focus:outline-none focus:border-orange-500/80 transition-colors placeholder:text-zinc-500"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setSelectedIndex(0)
                searchInputRef.current?.focus()
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5 rounded"
              title={t.search.clearInput}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Search Mode Segmented Control (Titles vs Messages) */}
        <div className="flex items-center bg-[#16181e] p-0.5 rounded-md border border-[#272a31] shrink-0">
          <button
            type="button"
            onClick={() => handleSwitchMode('titles')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-all ${
              searchMode === 'titles'
                ? 'bg-[#252830] text-orange-400 font-medium shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1c1f26]'
            }`}
            title="搜索会话标题"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{t.search.modeTitles}</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('messages')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-all ${
              searchMode === 'messages'
                ? 'bg-[#252830] text-orange-400 font-medium shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1c1f26]'
            }`}
            title="搜索消息正文与代码片段"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t.search.modeMessages}</span>
          </button>
        </div>

        {/* Right: Project dropdown, Result count badge, Close button */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Project dropdown */}
          <div className="flex items-center gap-1.5 bg-[#16181e] px-2 py-1 rounded-md border border-[#272a31]">
            <FolderGit2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <select
              value={selectedProjectIdFilter}
              onChange={(e) => {
                setSelectedProjectIdFilter(e.target.value)
                setSelectedIndex(0)
              }}
              className="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer max-w-[160px] truncate"
              title={t.search.filterByProject}
            >
              <option value="ALL" className="bg-[#16181e] text-zinc-300">
                {t.search.allProjects}
              </option>
              {filterProjectOptions.map((opt) => (
                <option key={opt.id} value={opt.id} className="bg-[#16181e] text-zinc-300">
                  {opt.name}
                </option>
              ))}
            </select>
          </div>

          {/* Result count badge */}
          {searchMode === 'titles' ? (
            <div className="px-2.5 py-1 bg-[#16181e] text-[11px] font-mono text-zinc-400 rounded-md border border-[#272a31] shrink-0">
              <strong className="text-zinc-200">{filteredSessions.length}</strong> / {sessions.length}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#16181e] text-[11px] font-mono text-zinc-400 rounded-md border border-[#272a31] shrink-0">
              {isSearchingMessages && <Loader2 className="w-3 h-3 animate-spin text-orange-400 shrink-0" />}
              <strong className="text-zinc-200">{messageHits.length}</strong>
              <span className="text-zinc-500">条命中</span>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-[#1c1f26] rounded-md border border-[#272a31] transition-colors"
            title={t.search.close}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main List Body Canvas (Strictly NO bottom footer bar) */}
      <div
        ref={listContainerRef}
        className="flex-1 overflow-y-auto p-3 space-y-1.5 bg-[#0c0d0e]"
        onMouseDown={handleNonInteractiveMouseDown}
      >
        {searchMode === 'titles' ? (
          // Titles Mode rendering
          filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-500 space-y-2">
              <Search className="w-8 h-8 text-zinc-600 mb-1" />
              <div className="text-sm font-medium text-zinc-400">
                {query ? t.search.searchNoResults(query) : t.search.noSessionsFound}
              </div>
              <div className="text-xs text-zinc-600">
                {query ? t.search.searchTryOther : t.search.noSessionsHint}
              </div>
            </div>
          ) : (
            filteredSessions.map((session, index) => {
              const isActive = index === safeIndex
              const projMeta = sessionProjectMap.get(session.id) || FALLBACK_SEARCH_BADGE
              const projectPill = formatProjectPill(projMeta.name)
              const agentInitial = ((session.agent || 'A').charAt(0) || 'A').toUpperCase()
              const timeDisplay = formatSessionTime(session.time?.updated || session.time?.created, t)

              let displayDir = ''
              if (session.directory) {
                const parts = session.directory.replace(/\\/g, '/').split('/').filter(Boolean)
                displayDir = parts.slice(-2).join('/')
              }

              return (
                <div
                  key={session.id}
                  data-index={index}
                  onClick={() => handleSelectSessionAction(session.id)}
                  className={`session-search-item group px-3.5 py-2.5 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-all border ${
                    isActive
                      ? 'bg-[#181c24] border-orange-500/60 shadow-md text-[#f0f6fc]'
                      : 'bg-[#101216] border-[#1d2026] hover:bg-[#15181f] hover:border-zinc-700/60 text-[#8b949e]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="w-6 text-center font-mono text-[11px] text-zinc-500 shrink-0">
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <span
                      className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-amber-950/80 text-amber-400 border border-amber-700/50 shrink-0"
                      title={`Agent: ${session.agent || 'Default'}`}
                    >
                      {agentInitial}
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border shrink-0 ${projMeta.colorClass}`}
                      title={`工程: ${projMeta.name}`}
                    >
                      {projectPill}
                    </span>

                    {isSessionArchived(session.id, archivedIds) && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-950/70 text-amber-300 border border-amber-600/50 shrink-0 flex items-center gap-1"
                        title={isZh ? '此会话已归档' : 'Archived conversation'}
                      >
                        <Archive className="w-2.5 h-2.5" />
                        <span>{isZh ? '已归档' : 'Archived'}</span>
                      </span>
                    )}

                    {Boolean(unreadSessionIds?.includes(session.id)) && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-950/70 text-blue-300 border border-blue-600/50 shrink-0 flex items-center gap-1"
                        title={isZh ? '新消息未读' : 'Unread'}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        <span>{isZh ? '未读' : 'Unread'}</span>
                      </span>
                    )}

                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                      <div className="flex items-center gap-2">
                        <span
                          className={`truncate text-xs font-medium ${
                            isActive ? 'text-white' : 'text-[#d0d7de]'
                          }`}
                          title={session.title || 'Untitled Session'}
                        >
                          <HighlightedText
                            text={session.title || 'Untitled Session'}
                            query={query}
                            preset="orange"
                          />
                        </span>
                      </div>

                      {displayDir && (
                        <span className="truncate text-[11px] text-zinc-500 font-mono mt-0.5 flex items-center gap-1">
                          <Folder className="w-2.5 h-2.5 text-zinc-600 shrink-0" />
                          <span className="truncate">{displayDir}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {session.tokens?.input || session.tokens?.output ? (
                      <span className="hidden sm:inline-block text-[10px] font-mono text-zinc-500">
                        {(session.tokens.input + session.tokens.output).toLocaleString()} tok
                      </span>
                    ) : null}

                    <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-zinc-500 shrink-0" />
                      <span>{timeDisplay}</span>
                    </span>

                    {isActive && (
                      <span className="hidden md:flex items-center gap-1 text-[10px] font-mono text-orange-400 bg-orange-950/40 border border-orange-800/60 px-1.5 py-0.5 rounded shrink-0">
                        <span>Enter</span>
                        <ArrowRight className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )
        ) : (
          // Messages Mode rendering
          messageHits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-500 space-y-2">
              {isSearchingMessages ? (
                <>
                  <Loader2 className="w-8 h-8 text-orange-400 animate-spin mb-1" />
                  <div className="text-sm font-medium text-zinc-300">
                    {t.search.searchingMessages}
                  </div>
                  <div className="text-xs text-zinc-500">
                    正在扫描工作区会话消息内容并建立高速检索索引...
                  </div>
                </>
              ) : !query.trim() ? (
                <>
                  <Sparkles className="w-8 h-8 text-orange-400/80 mb-1" />
                  <div className="text-sm font-medium text-zinc-300">
                    跨会话消息全文字段搜索
                  </div>
                  <div className="text-xs text-zinc-500 max-w-md">
                    输入任意函数名、报错堆栈、关键词或讨论片段，直接定位具体会话并高亮跳转至对应对话回合。
                  </div>
                </>
              ) : (
                <>
                  <Search className="w-8 h-8 text-zinc-600 mb-1" />
                  <div className="text-sm font-medium text-zinc-400">
                    {t.search.noMessageHits(query)}
                  </div>
                  <div className="text-xs text-zinc-600">
                    {t.search.noMessageHitsHint}
                  </div>
                </>
              )}
            </div>
          ) : (
            messageHits.map((hit, index) => {
              const isActive = index === safeIndex
              const timeDisplay = formatSessionTime(hit.timestamp, t)

              return (
                <div
                  key={`${hit.sessionId}-${hit.messageId}-${hit.turnIndex}`}
                  data-index={index}
                  onClick={() => handleSelectSessionAction(hit.sessionId, hit.messageId)}
                  className={`session-search-item group px-3.5 py-2.5 rounded-lg flex flex-col gap-1.5 cursor-pointer transition-all border ${
                    isActive
                      ? 'bg-[#181c24] border-orange-500/60 shadow-md text-[#f0f6fc]'
                      : 'bg-[#101216] border-[#1d2026] hover:bg-[#15181f] hover:border-zinc-700/60 text-[#8b949e]'
                  }`}
                >
                  {/* Top line: Index + Role badge + Project pill + Session Title + Time */}
                  <div className="flex items-center justify-between gap-3 min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="w-6 text-center font-mono text-[11px] text-zinc-500 shrink-0">
                        {String(index + 1).padStart(2, '0')}
                      </span>

                      {/* Role Pill */}
                      {hit.role === 'user' ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-950/80 text-cyan-300 border border-cyan-700/50 flex items-center gap-1 shrink-0">
                          <User className="w-2.5 h-2.5" />
                          <span>{t.search.userRole} #{hit.turnIndex}</span>
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-950/80 text-purple-300 border border-purple-700/50 flex items-center gap-1 shrink-0">
                          <Bot className="w-2.5 h-2.5" />
                          <span>{t.search.assistantRole} #{hit.turnIndex}</span>
                        </span>
                      )}

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border shrink-0 ${
                          hit.projectColorClass || 'bg-zinc-800 text-zinc-300 border-zinc-700'
                        }`}
                      >
                        {formatProjectPill(hit.projectName || 'Project')}
                      </span>

                      {isSessionArchived(hit.sessionId, archivedIds) && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-950/70 text-amber-300 border border-amber-600/50 shrink-0 flex items-center gap-1"
                          title={isZh ? '此会话已归档' : 'Archived conversation'}
                        >
                          <Archive className="w-2.5 h-2.5" />
                          <span>{isZh ? '已归档' : 'Archived'}</span>
                        </span>
                      )}

                      {/* Session Title Header */}
                      <span
                        className={`truncate text-xs font-semibold ${
                          isActive ? 'text-white' : 'text-[#d0d7de]'
                        }`}
                        title={hit.sessionTitle}
                      >
                        {hit.sessionTitle}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-500 shrink-0" />
                        <span>{timeDisplay}</span>
                      </span>

                      {isActive && (
                        <span className="hidden md:flex items-center gap-1 text-[10px] font-mono text-orange-400 bg-orange-950/40 border border-orange-800/60 px-1.5 py-0.5 rounded shrink-0">
                          <span>Enter 直达</span>
                          <ArrowRight className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bottom Snippet Line with highlighted matching keywords */}
                  <div className="pl-8">
                    <div
                      className={`text-xs font-mono px-2.5 py-1.5 rounded border transition-colors leading-relaxed break-all ${
                        isActive
                          ? 'bg-[#111318] border-orange-950/80 text-zinc-200'
                          : 'bg-[#0d0e12] border-[#1d2026] text-zinc-400'
                      }`}
                    >
                      <HighlightedText text={hit.snippet} query={query} />
                    </div>
                  </div>
                </div>
              )
            })
          )
        )}
      </div>
    </>
  )
}
