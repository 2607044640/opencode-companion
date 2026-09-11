import { useState, useEffect, useCallback, useRef } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { ChatTimeline } from './components/chat/ChatTimeline'
import { TodoBanner } from './components/chat/TodoBanner'
import { PromptInput } from './components/chat/PromptInput'
import { SettingsModal } from './components/settings/SettingsModal'
import { FloatingMapModal } from './components/map/FloatingMapModal'
import { FloatingSearchModal } from './components/search/FloatingSearchModal'
import { RevertDialog } from './components/chat/RevertDialog'
import { useSessions } from './hooks/useSessions'
import { useChatStream } from './hooks/useChatStream'
import { getShortcuts, matchesShortcut, type ShortcutsMap } from './utils/shortcuts'
import { api, canonicalizeDirectory } from './services/api'
import { Loader2, Minimize2 } from 'lucide-react'

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isMapOpen, setIsMapOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isZenMode, setIsZenMode] = useState(false)
  const [isRevertOpen, setIsRevertOpen] = useState(false)
  const [shortcuts, setShortcuts] = useState<ShortcutsMap>(getShortcuts())

  const {
    projects,
    sessions,
    selectedProjectId,
    setSelectedProjectId,
    activeSessionId,
    activeSession,
    openTabIds,
    searchQuery,
    setSearchQuery,
    loading: sessionsLoading,
    groupedSessions,
    selectSession,
    closeTab,
    createNewSession,
    deleteSession,
  } = useSessions()

  const {
    messages,
    sessionStatus,
    todos,
    error,
    sendPrompt,
    abort,
    retry,
    revertLastExchange,
  } = useChatStream(activeSessionId)

  // Listen for shortcuts config updates from SettingsModal
  useEffect(() => {
    const handleShortcutsUpdate = (e: Event) => {
      const custom = e as CustomEvent<ShortcutsMap>
      if (custom.detail) {
        setShortcuts(custom.detail)
      } else {
        setShortcuts(getShortcuts())
      }
    }
    window.addEventListener('shortcuts-updated', handleShortcutsUpdate)
    return () => window.removeEventListener('shortcuts-updated', handleShortcutsUpdate)
  }, [])

  const handleNewSession = useCallback(async () => {
    try {
      const selectedProject = selectedProjectId
        ? projects.find(
            (p) =>
              p.id === selectedProjectId ||
              Boolean(p.associatedIds && p.associatedIds.includes(selectedProjectId))
          )
        : null
      const projectDirectory = canonicalizeDirectory(selectedProject?.worktree)

      await createNewSession({
        title: `New session - ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
        directory: projectDirectory,
      })
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }, [projects, selectedProjectId, createNewSession])

  const handleConfirmRevert = useCallback(
    async (opts: {
      includeUserMessage: boolean
      gitRevert: boolean
      gitRevertMode: 'revert' | 'reset'
    }) => {
      const activeDir = canonicalizeDirectory(
        activeSession?.directory ||
        projects.find(
          (p) =>
            p.id === selectedProjectId ||
            Boolean(p.associatedIds && p.associatedIds.includes(selectedProjectId || ''))
        )?.worktree
      )
      await revertLastExchange({
        includeUserMessage: opts.includeUserMessage,
        directory: activeDir,
        gitRevert: opts.gitRevert,
        gitRevertMode: opts.gitRevertMode,
      })
    },
    [activeSession?.directory, projects, revertLastExchange, selectedProjectId]
  )

  const isZenModeRef = useRef(isZenMode)
  useEffect(() => {
    isZenModeRef.current = isZenMode
  }, [isZenMode])

  const toggleZenMode = useCallback((targetState?: boolean) => {
    const next = typeof targetState === 'boolean' ? targetState : !isZenModeRef.current
    if (next) {
      if (!document.fullscreenElement && document.documentElement?.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {
          // Ignore fullscreen rejection gracefully (e.g. iframe sandbox)
        })
      }
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
      }
    }
    setIsZenMode(next)
  }, [])

  // Sync state if user exits browser fullscreen natively (e.g. browser Esc or UI controls)
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isZenModeRef.current) {
        setIsZenMode(false)
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Global configurable keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Zen mode toggle via configured shortcut or unmodified F11
      const isPlainF11 = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key === 'F11'
      if (matchesShortcut(e, shortcuts.zenMode) || isPlainF11) {
        e.preventDefault()
        toggleZenMode()
        return
      }

      // 2. Escape handling: modals close first on Escape regardless of Zen mode
      if (e.key === 'Escape' && !e.defaultPrevented) {
        if (isSettingsOpen) {
          e.preventDefault()
          setIsSettingsOpen(false)
          return
        }
        if (isMapOpen) {
          e.preventDefault()
          setIsMapOpen(false)
          return
        }
        if (isSearchOpen) {
          e.preventDefault()
          setIsSearchOpen(false)
          return
        }
        if (isRevertOpen) {
          e.preventDefault()
          setIsRevertOpen(false)
          return
        }
        // If in Zen mode and no modal is open, exit Zen mode
        if (isZenMode) {
          e.preventDefault()
          toggleZenMode(false)
          return
        }
      }

      // Sidebar toggle only when not in zen mode
      if (!isZenMode && matchesShortcut(e, shortcuts.toggleSidebar)) {
        e.preventDefault()
        setIsSidebarOpen((prev) => !prev)
        return
      }

      if (matchesShortcut(e, shortcuts.newSession)) {
        e.preventDefault()
        handleNewSession()
        return
      }

      if (matchesShortcut(e, shortcuts.focusSearch) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        setIsSearchOpen((prev) => !prev)
        return
      }

      if (matchesShortcut(e, shortcuts.toggleMap)) {
        e.preventDefault()
        setIsMapOpen((prev) => !prev)
        return
      }

      if (matchesShortcut(e, shortcuts.openSettings) || ((e.ctrlKey || e.metaKey) && e.key === ',')) {
        e.preventDefault()
        setIsSettingsOpen((prev) => !prev)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts, isSidebarOpen, isZenMode, isSettingsOpen, isMapOpen, isSearchOpen, isRevertOpen, handleNewSession, toggleZenMode])

  return (
    <div className="flex h-screen w-screen bg-[#0c0d0e] text-[#e6edf3] font-sans antialiased overflow-hidden">
      {/* 0. Top-Right Subtle Hover-Revealed Zen Mode Exit Capsule */}
      {isZenMode && (
        <div className="fixed top-3.5 right-5 z-50 group pointer-events-auto">
          <button
            onClick={() => toggleZenMode(false)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#14171d]/60 hover:bg-[#1c212a] border border-zinc-700/40 hover:border-zinc-500/80 text-zinc-400 hover:text-zinc-100 shadow-xl backdrop-blur-md transition-all duration-300 opacity-25 hover:opacity-100 group-hover:opacity-100 cursor-pointer"
            title={`退出沉浸阅读模式 (按 ${shortcuts.zenMode?.label || 'F11'} 或 Esc)`}
          >
            <Minimize2 className="w-3.5 h-3.5 text-zinc-400 group-hover:text-purple-400 transition-colors" />
            <span className="text-xs font-medium tracking-wide">退出沉浸阅读</span>
            <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60 shadow-inner">
              {shortcuts.zenMode?.label || 'F11'} / Esc
            </span>
          </button>
        </div>
      )}

      {/* 1. Left Project & Session Drawer (Collapsible) */}
      {!isZenMode && isSidebarOpen && (
        <Sidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
          groupedSessions={groupedSessions}
          activeSessionId={activeSessionId}
          onSelectSession={selectSession}
          onNewSession={handleNewSession}
          onDeleteSession={deleteSession}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
      )}

      {/* 2. Main Workspace Layout */}
      <div
        className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden transition-colors duration-300 ${
          isZenMode ? 'bg-[#090a0c]' : 'bg-[#0c0d0e]'
        }`}
      >
        {/* Top Header Bar */}
        {!isZenMode && (
          <Header
            sessions={sessions}
            openTabIds={openTabIds}
            activeSessionId={activeSessionId}
            activeSession={activeSession}
            sessionStatus={sessionStatus}
            onSelectTab={selectSession}
            onCloseTab={closeTab}
            onNewSession={handleNewSession}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            onToggleMap={() => setIsMapOpen((prev) => !prev)}
            onOpenSearch={() => setIsSearchOpen(true)}
            onToggleZenMode={() => toggleZenMode(true)}
            zenShortcutLabel={shortcuts.zenMode?.label || 'F11'}
            onGetSessionJson={
              activeSessionId
                ? () => api.getAllMessagesRaw(activeSessionId)
                : undefined
            }
            onRevert={() => setIsRevertOpen(true)}
            hasMessages={messages.length > 0}
          />
        )}

        {/* Center Chat Body & Streaming Timeline */}
        {sessionsLoading ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
            <span className="text-xs">Connecting to OpenCode backend...</span>
          </div>
        ) : (
          <main className="flex-1 flex flex-col min-h-0 relative">
            {/* Scrollable Timeline */}
            <ChatTimeline
              messages={messages}
              sessionStatus={sessionStatus}
              error={error}
              onRetry={retry}
              onPromptSuggestion={(text) => sendPrompt(text)}
              isZenMode={isZenMode}
            />

            {/* In Zen mode, stack TodoBanner and PromptInput in a floating dock to prevent collision */}
            {isZenMode ? (
              <div className="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-3xl w-[calc(100%-2rem)] z-40 flex flex-col gap-2 pointer-events-none">
                <div className="pointer-events-auto">
                  <TodoBanner todos={todos} isZenMode={isZenMode} />
                </div>
                <div className="pointer-events-auto">
                  <PromptInput
                    activeSession={activeSession}
                    onSend={sendPrompt}
                    onAbort={abort}
                    isBusy={sessionStatus.type === 'busy'}
                    isZenMode={isZenMode}
                  />
                </div>
              </div>
            ) : (
              <>
                {/* Floating Todo Banner (Image 1) */}
                <TodoBanner todos={todos} isZenMode={isZenMode} />

                {/* Bottom Prompt Controls (Image 1) */}
                <PromptInput
                  activeSession={activeSession}
                  onSend={sendPrompt}
                  onAbort={abort}
                  isBusy={sessionStatus.type === 'busy'}
                  isZenMode={isZenMode}
                />
              </>
            )}
          </main>
        )}
      </div>

      {/* 3. Settings Modal (Image 3) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* 4. A1 Floating Dialogue Map Modal */}
      <FloatingMapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        onSelectSession={(sessionId) => {
          selectSession(sessionId)
          const target = sessions.find((s) => s.id === sessionId)
          if (target?.projectID && target.projectID !== 'global') {
            setSelectedProjectId(target.projectID)
          } else if (target?.directory) {
            const matchedProj = projects.find(
              (p) => p.worktree && p.worktree !== '/' && (p.worktree === target.directory || target.directory.startsWith(p.worktree))
            )
            if (matchedProj) {
              setSelectedProjectId(matchedProj.id)
            }
          }
        }}
        projects={projects}
        activeDirectory={
          (projects.find((p) => p.id === selectedProjectId)?.worktree &&
            projects.find((p) => p.id === selectedProjectId)?.worktree !== '/' &&
            projects.find((p) => p.id === selectedProjectId)?.worktree) ||
          activeSession?.directory ||
          projects.find((p) => p.worktree && p.worktree !== '/')?.worktree
        }
      />

      {/* 5. A1 Floating Dialogue Search Modal */}
      <FloatingSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectSession={(sessionId) => {
          selectSession(sessionId)
          const target = sessions.find((s) => s.id === sessionId)
          if (target?.projectID && target.projectID !== 'global') {
            setSelectedProjectId(target.projectID)
          } else if (target?.directory) {
            const matchedProj = projects.find(
              (p) =>
                p.worktree &&
                p.worktree !== '/' &&
                (p.worktree === target.directory || target.directory.startsWith(p.worktree))
            )
            if (matchedProj) {
              setSelectedProjectId(matchedProj.id)
            }
          }
        }}
        sessions={sessions}
        projects={projects}
        initialSelectedProjectId={selectedProjectId}
      />

      {/* 6. Revert Confirmation Modal */}
      <RevertDialog
        isOpen={isRevertOpen}
        onClose={() => setIsRevertOpen(false)}
        onConfirm={handleConfirmRevert}
        hasDirectory={Boolean(
          activeSession?.directory ||
            projects.find(
              (p) =>
                p.id === selectedProjectId ||
                Boolean(p.associatedIds && p.associatedIds.includes(selectedProjectId || ''))
            )?.worktree
        )}
      />
    </div>
  )
}
