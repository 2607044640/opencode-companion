import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { ReactFlowProvider, useReactFlow } from "@xyflow/react"
import { MapCanvas, type MatchedSessionCard } from "./canvas/MapApp"
import { Search, X, Maximize2, RefreshCw, Wand2, Home, Network } from "lucide-react"
import type { Project } from "../../types/opencode"
import { isBlueprintReservedKey } from "./canvas/blueprint-hotkeys"

export interface FloatingMapModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onSelectSession: (sessionId: string) => void
  readonly projects?: Project[]
  readonly activeDirectory?: string
  readonly targetSessionId?: string | null
}

export function FloatingMapModal(props: FloatingMapModalProps) {
  if (!props.isOpen) {
    return null
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-modal="floating-map"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none"
      style={{
        backdropFilter: "blur(8px)",
        background: "rgba(0, 0, 0, 0.6)",
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
          width: "85vw",
          height: "85vh",
          maxWidth: "98vw",
          maxHeight: "96vh",
          borderRadius: "12px",
          boxShadow: "0 20px 48px rgba(0, 0, 0, 0.45)",
        }}
      >
        <ReactFlowProvider>
          <FloatingMapContent
            onClose={props.onClose}
            onSelectSession={props.onSelectSession}
            initialProjects={props.projects}
            activeDirectory={props.activeDirectory}
            targetSessionId={props.targetSessionId}
          />
        </ReactFlowProvider>
      </div>
    </div>
  )
}

function FloatingMapContent({
  onClose,
  onSelectSession,
  initialProjects = [],
  activeDirectory,
  targetSessionId,
}: {
  readonly onClose: () => void
  readonly onSelectSession: (sessionId: string) => void
  readonly initialProjects?: Project[]
  readonly activeDirectory?: string
  readonly targetSessionId?: string | null
}) {
  const { fitView, setCenter } = useReactFlow()
  const [searchQuery, setSearchQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [matchedSessions, setMatchedSessions] = useState<readonly MatchedSessionCard[]>([])
  const [loadedProjects, setLoadedProjects] = useState<readonly { id: string; worktree: string; name?: string }[]>([])
  const [selectedDirectoryOverride, setSelectedDirectoryOverride] = useState<string | undefined>(undefined)

  const projects = useMemo<readonly { id: string; worktree: string; name?: string }[]>(() => {
    const source = loadedProjects.length > 0 ? loadedProjects : (initialProjects ?? [])
    return source.filter((p) => p.worktree && p.worktree !== "/")
  }, [loadedProjects, initialProjects])

  void activeDirectory
  const selectedDirectory = selectedDirectoryOverride ?? "all"
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true)
  const [layoutTrigger, setLayoutTrigger] = useState(0)

  const handleAutoLayout = useCallback(() => {
    setLayoutTrigger((prev) => prev + 1)
  }, [])

  const isComposingRef = useRef(false)
  const lastCompositionEndTimeRef = useRef(0)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Continuous input focus: auto-focus search input on modal open
  useEffect(() => {
    searchInputRef.current?.focus()
    const timer = setTimeout(() => {
      searchInputRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  const safeActiveIndex =
    matchedSessions.length > 0 && activeIndex < matchedSessions.length ? activeIndex : 0

  // Center view on active card without forcing zoom level jump
  const centerOnCard = useCallback(
    (card: MatchedSessionCard) => {
      setCenter(card.position.x + 130, card.position.y + 48, {
        duration: 300,
      })
    },
    [setCenter],
  )

  // Auto-locate target session when specified
  const targetLocatedRef = useRef<string | null>(null)
  useEffect(() => {
    if (targetSessionId && targetLocatedRef.current !== targetSessionId && matchedSessions.length > 0) {
      const idx = matchedSessions.findIndex((s) => s.sessionId === targetSessionId)
      if (idx >= 0) {
        targetLocatedRef.current = targetSessionId
        setActiveIndex(idx)
        centerOnCard(matchedSessions[idx])
      }
    }
  }, [targetSessionId, matchedSessions, centerOnCard])

  // Chinese IME Shield: composition listeners and state detection
  const handleCompositionStart = () => {
    isComposingRef.current = true
  }

  const handleCompositionEnd = () => {
    isComposingRef.current = false
    lastCompositionEndTimeRef.current = Date.now()
  }

  const isIMEActive = (e: React.KeyboardEvent | KeyboardEvent) => {
    const isComp = "nativeEvent" in e ? e.nativeEvent.isComposing : e.isComposing
    return (
      isComposingRef.current ||
      isComp ||
      e.keyCode === 229 ||
      e.key === "Process" ||
      Date.now() - lastCompositionEndTimeRef.current < 60
    )
  }

  // Keyboard navigation inside search input
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // When IME is composing or confirming candidates, completely allow all keyboard events (Space, Enter, digits, arrows)
    if (isIMEActive(e)) {
      return
    }

    if (e.key === "Escape") {
      e.preventDefault()
      onClose()
      return
    }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (matchedSessions.length === 0) return
      const nextIndex = (safeActiveIndex + 1) % matchedSessions.length
      setActiveIndex(nextIndex)
      const target = matchedSessions[nextIndex]
      if (target) {
        centerOnCard(target)
      }
      searchInputRef.current?.focus()
      return
    }

    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (matchedSessions.length === 0) return
      const prevIndex = (safeActiveIndex - 1 + matchedSessions.length) % matchedSessions.length
      setActiveIndex(prevIndex)
      const target = matchedSessions[prevIndex]
      if (target) {
        centerOnCard(target)
      }
      searchInputRef.current?.focus()
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      if (matchedSessions.length > 0 && matchedSessions[safeActiveIndex]) {
        const targetSessionId = matchedSessions[safeActiveIndex].sessionId
        onSelectSession(targetSessionId)
        onClose()
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

      if (e.key === "Escape") {
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
      if (e.key === "ArrowDown") {
        e.preventDefault()
        if (matchedSessions.length > 0) {
          const nextIndex = (safeActiveIndex + 1) % matchedSessions.length
          setActiveIndex(nextIndex)
          const target = matchedSessions[nextIndex]
          if (target) centerOnCard(target)
        }
        searchInputRef.current?.focus()
        return
      }

      if (e.key === "ArrowUp") {
        e.preventDefault()
        if (matchedSessions.length > 0) {
          const prevIndex = (safeActiveIndex - 1 + matchedSessions.length) % matchedSessions.length
          setActiveIndex(prevIndex)
          const target = matchedSessions[prevIndex]
          if (target) centerOnCard(target)
        }
        searchInputRef.current?.focus()
        return
      }

      if (e.key === "Enter") {
        e.preventDefault()
        if (matchedSessions.length > 0 && matchedSessions[safeActiveIndex]) {
          const targetSessionId = matchedSessions[safeActiveIndex].sessionId
          onSelectSession(targetSessionId)
          onClose()
        }
        return
      }

      const isSearchFocused = document.activeElement === searchInputRef.current
      if (isBlueprintReservedKey(e, isSearchFocused)) {
        // Allow canvas blueprint hotkeys (F, C, Home, Space, Ctrl+A, Delete) to pass through to the canvas
        return
      }

      if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      }

      // H or Home: Return view to conversation cards (Home view)
      if (
        !isSearchFocused &&
        (e.key.toLowerCase() === "h" || e.key === "Home") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault()
        fitView({ padding: 0.2, duration: 400 })
        return
      }

      // Lossless printable character redirection: typing anywhere on canvas focuses search input and inserts first character
      if (e.key.length === 1 && !isSearchFocused) {
        e.preventDefault()
        const input = searchInputRef.current
        if (input) {
          input.focus()
          const start = input.selectionStart ?? input.value.length
          const end = input.selectionEnd ?? input.value.length
          const nextVal = input.value.slice(0, start) + e.key + input.value.slice(end)
          setSearchQuery(nextVal)
          setActiveIndex(0)
          requestAnimationFrame(() => {
            input.setSelectionRange(start + 1, start + 1)
          })
        }
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [centerOnCard, fitView, matchedSessions, onClose, onSelectSession, safeActiveIndex])

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      onSelectSession(sessionId)
      onClose()
    },
    [onSelectSession, onClose],
  )

  const handleHome = useCallback(() => {
    fitView({ padding: 0.2, duration: 400 })
  }, [fitView])

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.15, duration: 350 })
  }, [fitView])

  const handleToggleAutoSync = () => {
    setAutoSyncEnabled((prev) => !prev)
  }

  const handleProjectsLoaded = useCallback(
    (loaded: readonly { id: string; worktree: string; name?: string }[]) => {
      if (loaded.length > 0) {
        setLoadedProjects(loaded)
      }
    },
    [],
  )

  return (
    <>
      {/* 2. Single-Row Top Bar */}
      <div className="h-12 border-b border-[#24272b] px-4 flex items-center gap-3 bg-[#12141a] shrink-0">
        {/* Left: Search / filter input taking remaining width */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleSearchKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder="搜索会话 (按 ↑↓ 选择, Enter 打开, Esc 退出)..."
            className="w-full bg-[#16181e] text-zinc-200 pl-9 pr-8 py-1.5 text-xs rounded-md border border-[#272a31] focus:outline-none focus:border-orange-500/80 transition-colors placeholder:text-zinc-500"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("")
                setActiveIndex(0)
                searchInputRef.current?.focus()
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5 rounded"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Right: Blueprint Selector, Auto-Layout, Home, Fit-View, Auto-Sync toggle, Close button */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Blueprint Selector (Unified / Custom Boards) */}
          <div className="flex items-center gap-1.5 bg-[#16181e] px-2 py-1 rounded-md border border-[#272a31]">
            <Network className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <select
              value={selectedDirectory ?? "all"}
              onChange={(e) => {
                const val = e.target.value
                if (val === "__create_new__") {
                  const name = window.prompt("请输入新蓝图名称：", "")
                  if (name && name.trim()) {
                    setSelectedDirectoryOverride(name.trim())
                  }
                  return
                }
                setSelectedDirectoryOverride(val)
                setActiveIndex(0)
              }}
              className="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer max-w-[160px] truncate"
              title="切换蓝图"
            >
              <option value="all" className="bg-[#16181e] text-zinc-300">
                主蓝图 (全部对话)
              </option>
              {projects.map((p) => {
                const label = p.name || p.worktree.split("/").filter(Boolean).pop() || p.worktree
                return (
                  <option key={p.id} value={p.worktree} className="bg-[#16181e] text-zinc-300">
                    项目: {label}
                  </option>
                )
              })}
              <option value="__create_new__" className="bg-[#16181e] text-sky-400 font-medium">
                + 新建独立蓝图...
              </option>
            </select>
          </div>

          {/* Auto-Layout button */}
          <button
            onClick={handleAutoLayout}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-[#272a31] bg-[#16181e] text-zinc-300 hover:text-zinc-100 hover:bg-[#1c1f26] transition-colors"
            title="自动整理蓝图 (Dagre Auto-Layout)"
          >
            <Wand2 className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">整理蓝图</span>
          </button>

          {/* Home button (H key) */}
          <button
            onClick={handleHome}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-[#272a31] bg-[#16181e] text-zinc-300 hover:text-zinc-100 hover:bg-[#1c1f26] transition-colors"
            title="回到全部对话 (H)"
          >
            <Home className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">回到对话 (H)</span>
          </button>

          {/* Fit-View button */}
          <button
            onClick={handleFitView}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#1c1f26] rounded-md border border-[#272a31] transition-colors"
            title="适应画布 (Fit View)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {/* Auto-Sync toggle */}
          <button
            onClick={handleToggleAutoSync}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors ${
              autoSyncEnabled
                ? "bg-orange-950/40 text-orange-400 border-orange-800/60"
                : "bg-[#16181e] text-zinc-400 border-[#272a31] hover:text-zinc-200"
            }`}
            title={autoSyncEnabled ? "自动同步：已开启" : "自动同步：已关闭"}
          >
            <RefreshCw className={`w-3 h-3 ${autoSyncEnabled ? "text-orange-400" : "text-zinc-500"}`} />
            <span className="hidden sm:inline">自动同步 {autoSyncEnabled ? "开" : "关"}</span>
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-[#1c1f26] rounded-md border border-[#272a31] transition-colors"
            title="关闭 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Canvas Area (Zero footer!) */}
      <div
        className="flex-1 relative overflow-hidden bg-[#0c0d0e]"
        onPointerDown={() => {
          if (document.activeElement === searchInputRef.current) {
            searchInputRef.current?.blur()
          }
        }}
      >
        <MapCanvas
          hideChrome={true}
          searchQuery={searchQuery}
          activeIndex={safeActiveIndex}
          onSelectSession={handleSelectSession}
          onMatchedSessionsChange={setMatchedSessions}
          selectedDirectory={selectedDirectory}
          onDirectoryChange={setSelectedDirectoryOverride}
          autoSyncEnabled={autoSyncEnabled}
          onProjectsLoaded={handleProjectsLoaded}
          layoutTrigger={layoutTrigger}
        />
      </div>
    </>
  )
}
