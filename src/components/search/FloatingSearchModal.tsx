import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Search, X, FolderGit2, Clock, ArrowRight, Folder } from 'lucide-react'
import type { Session, Project } from '../../types/opencode'
import { matchCanonicalWorkspace } from '../../services/api'
import { useI18n, type TranslationDictionary } from '../../utils/i18n'

export interface FloatingSearchModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onSelectSession: (sessionId: string) => void
  readonly sessions: readonly Session[]
  readonly projects: readonly Project[]
  readonly initialSelectedProjectId?: string | null
}

const PROJECT_COLOR_MAP: Record<string, string> = {
  cyan: 'bg-cyan-950/60 text-cyan-300 border-cyan-700/50',
  blue: 'bg-blue-950/60 text-blue-300 border-blue-700/50',
  green: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50',
  purple: 'bg-purple-950/60 text-purple-300 border-purple-700/50',
  magenta: 'bg-pink-950/60 text-pink-300 border-pink-700/50',
  pink: 'bg-pink-950/60 text-pink-300 border-pink-700/50',
  amber: 'bg-amber-950/60 text-amber-300 border-amber-700/50',
  orange: 'bg-orange-950/60 text-orange-300 border-orange-700/50',
  mint: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50',
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim()
  if (!trimmed) {
    return <>{text}</>
  }

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return <>{text}</>
  }

  let tokens: { isMatch: boolean; text: string }[] = []
  try {
    const pattern = words.map(escapeRegExp).join('|')
    const regex = new RegExp(`(${pattern})`, 'gi')
    const rawParts = text.split(regex)
    const wordSet = new Set(words.map((w) => w.toLowerCase()))
    tokens = rawParts.map((part) => ({
      isMatch: wordSet.has(part.toLowerCase()),
      text: part,
    }))
  } catch {
    tokens = [{ isMatch: false, text }]
  }

  return (
    <>
      {tokens.map((token, i) =>
        token.isMatch ? (
          <mark
            key={i}
            className="bg-orange-500/30 text-orange-300 font-semibold rounded-xs px-0.5"
          >
            {token.text}
          </mark>
        ) : (
          <span key={i}>{token.text}</span>
        )
      )}
    </>
  )
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

  const parentSegments = parent.split('/').filter(Boolean)
  const parentBase = parentSegments.pop()
  if (!parentBase) return false

  const targetSegments = target.split('/').filter(Boolean)
  return targetSegments.includes(parentBase)
}

function resolveSessionProject(
  session: Session,
  projects: readonly Project[]
): { id: string; name: string; colorClass: string } {
  const matchedById = projects.find(
    (p) =>
      p.id !== 'global' &&
      (p.id === session.projectID || Boolean(p.associatedIds && p.associatedIds.includes(session.projectID)))
  )
  if (matchedById) {
    const canonical = matchCanonicalWorkspace(matchedById.worktree, matchedById.name)
    const colorKey = matchedById.icon?.color || canonical?.defaultColor || 'blue'
    return {
      id: matchedById.id,
      name: canonical?.name || matchedById.name || matchedById.worktree.split('/').filter(Boolean).pop() || 'Project',
      colorClass: PROJECT_COLOR_MAP[colorKey] || 'bg-zinc-800 text-zinc-300 border-zinc-700',
    }
  }

  if (session.directory) {
    const matchedByDir = projects.find(
      (p) => p.worktree && p.worktree !== '/' && isSameOrSubdirectory(p.worktree, session.directory)
    )
    if (matchedByDir) {
      const canonical = matchCanonicalWorkspace(matchedByDir.worktree, matchedByDir.name)
      const colorKey = matchedByDir.icon?.color || canonical?.defaultColor || 'blue'
      return {
        id: matchedByDir.id,
        name: canonical?.name || matchedByDir.name || matchedByDir.worktree.split('/').filter(Boolean).pop() || 'Project',
        colorClass: PROJECT_COLOR_MAP[colorKey] || 'bg-zinc-800 text-zinc-300 border-zinc-700',
      }
    }

    const canonicalDirect = matchCanonicalWorkspace(session.directory)
    if (canonicalDirect) {
      return {
        id: canonicalDirect.fallbackId,
        name: canonicalDirect.name,
        colorClass: PROJECT_COLOR_MAP[canonicalDirect.defaultColor] || 'bg-zinc-800 text-zinc-300 border-zinc-700',
      }
    }

    const dirParts = session.directory.replace(/\\/g, '/').split('/').filter(Boolean)
    const dirBase = dirParts.pop() || 'Workspace'
    return {
      id: 'dir-' + dirBase,
      name: dirBase,
      colorClass: 'bg-zinc-800/80 text-zinc-300 border-zinc-700',
    }
  }

  return {
    id: 'global',
    name: 'Global',
    colorClass: 'bg-zinc-800/80 text-zinc-400 border-zinc-700',
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
}: FloatingSearchModalProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedProjectIdFilter, setSelectedProjectIdFilter] = useState<string>(() => {
    if (initialSelectedProjectId && initialSelectedProjectId !== 'global') {
      const match = projects.find(
        (p) =>
          p.id === initialSelectedProjectId ||
          Boolean(p.associatedIds && p.associatedIds.includes(initialSelectedProjectId))
      )
      if (match) return match.id
    }
    return 'ALL'
  })

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

  // Pre-resolve project mapping for all sessions for high performance
  const sessionProjectMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; colorClass: string }>()
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

  // Filtered & Ranked sessions
  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase()

    const projectFiltered = sessions.filter((session) => {
      if (selectedProjectIdFilter === 'ALL') return true
      const proj = sessionProjectMap.get(session.id)
      if (!proj) return false

      const targetProj = projects.find((p) => p.id === selectedProjectIdFilter)
      if (!targetProj) return proj.id === selectedProjectIdFilter

      if (targetProj.associatedIds && targetProj.associatedIds.includes(session.projectID)) {
        return true
      }
      if (targetProj.id === session.projectID) return true
      if (targetProj.worktree && session.directory && isSameOrSubdirectory(targetProj.worktree, session.directory)) {
        return true
      }
      return proj.id === selectedProjectIdFilter || proj.name.toLowerCase() === (targetProj.name || '').toLowerCase()
    })

    if (!q) {
      // Sort by recent updated time descending
      return [...projectFiltered].sort((a, b) => {
        const timeA = a.time?.updated || a.time?.created || 0
        const timeB = b.time?.updated || b.time?.created || 0
        return timeB - timeA
      })
    }

    const words = q.split(/\s+/).filter(Boolean)

    // Relevance scoring
    const scored: { session: Session; score: number }[] = []

    for (const s of projectFiltered) {
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
  }, [sessions, query, selectedProjectIdFilter, sessionProjectMap, projects])

  const safeIndex =
    filteredSessions.length > 0
      ? Math.min(Math.max(0, selectedIndex), filteredSessions.length - 1)
      : 0

  // Scroll active item into view smoothly without stealing DOM focus
  useEffect(() => {
    if (!listContainerRef.current) return
    const activeEl = listContainerRef.current.querySelector<HTMLElement>(`[data-index="${safeIndex}"]`)
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [safeIndex])

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      onSelectSession(sessionId)
      onClose()
    },
    [onSelectSession, onClose]
  )

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
      if (filteredSessions.length === 0) return
      setSelectedIndex((prev) => {
        const cur = Math.min(Math.max(0, prev), filteredSessions.length - 1)
        return (cur + 1) % filteredSessions.length
      })
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (filteredSessions.length === 0) return
      setSelectedIndex((prev) => {
        const cur = Math.min(Math.max(0, prev), filteredSessions.length - 1)
        return (cur - 1 + filteredSessions.length) % filteredSessions.length
      })
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredSessions.length > 0 && filteredSessions[safeIndex]) {
        handleSelectSession(filteredSessions[safeIndex].id)
      }
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
        if (filteredSessions.length > 0) {
          setSelectedIndex((prev) => {
            const cur = Math.min(Math.max(0, prev), filteredSessions.length - 1)
            return (cur + 1) % filteredSessions.length
          })
        }
        searchInputRef.current?.focus()
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (filteredSessions.length > 0) {
          setSelectedIndex((prev) => {
            const cur = Math.min(Math.max(0, prev), filteredSessions.length - 1)
            return (cur - 1 + filteredSessions.length) % filteredSessions.length
          })
        }
        searchInputRef.current?.focus()
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredSessions.length > 0 && filteredSessions[safeIndex]) {
          handleSelectSession(filteredSessions[safeIndex].id)
        }
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
  }, [filteredSessions, handleSelectSession, onClose, safeIndex])

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
            placeholder={t.search.placeholder}
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
          <div className="px-2.5 py-1 bg-[#16181e] text-[11px] font-mono text-zinc-400 rounded-md border border-[#272a31] shrink-0">
            <strong className="text-zinc-200">{filteredSessions.length}</strong> / {sessions.length}
          </div>

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
        {filteredSessions.length === 0 ? (
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
            const projMeta = sessionProjectMap.get(session.id) || {
              id: 'unknown',
              name: 'Project',
              colorClass: 'bg-zinc-800 text-zinc-300 border-zinc-700',
            }
            const agentInitial = ((session.agent || 'A').charAt(0) || 'A').toUpperCase()
            const timeDisplay = formatSessionTime(session.time?.updated || session.time?.created, t)

            // Short directory or subpath hint
            let displayDir = ''
            if (session.directory) {
              const parts = session.directory.replace(/\\/g, '/').split('/').filter(Boolean)
              displayDir = parts.slice(-2).join('/')
            }

            return (
              <div
                key={session.id}
                data-index={index}
                onClick={() => handleSelectSession(session.id)}
                className={`session-search-item group px-3.5 py-2.5 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-all border ${
                  isActive
                    ? 'bg-[#181c24] border-orange-500/60 shadow-md text-[#f0f6fc]'
                    : 'bg-[#101216] border-[#1d2026] hover:bg-[#15181f] hover:border-zinc-700/60 text-[#8b949e]'
                }`}
              >
                {/* Left Section: Numeric index + Agent pill + Project pill + Title + Path */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {/* Pure numeric sequence badge */}
                  <span className="w-6 text-center font-mono text-[11px] text-zinc-500 shrink-0">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  {/* Agent pill badge */}
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-amber-950/80 text-amber-400 border border-amber-700/50 shrink-0"
                    title={`Agent: ${session.agent || 'Default'}`}
                  >
                    {agentInitial}
                  </span>

                  {/* Project colored pill badge */}
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-medium border shrink-0 ${projMeta.colorClass}`}
                    title={`工程: ${projMeta.name}`}
                  >
                    {projMeta.name}
                  </span>

                  {/* Title & optional directory preview */}
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

                {/* Right Section: Token stats + Time badge + Enter indicator */}
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
        )}
      </div>
    </>
  )
}
