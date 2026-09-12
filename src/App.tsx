import { useState, useEffect, useCallback, useRef } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { ChatTimeline } from './components/chat/ChatTimeline'
import { TodoBanner } from './components/chat/TodoBanner'
import { PromptInput, type DraftInjection } from './components/chat/PromptInput'
import { SessionRevertDock } from './components/chat/SessionRevertDock'
import { extractDraftFromMessage } from './utils/draft'
import { SettingsModal, type SettingsTab } from './components/settings/SettingsModal'
import { FloatingMapModal } from './components/map/FloatingMapModal'
import { FloatingSearchModal } from './components/search/FloatingSearchModal'
import { DiffDrawerProvider } from './components/diff/DiffDrawerContext'
import { DiffSidebarDrawer } from './components/diff/DiffSidebarDrawer'
import { useSessions, DRAFT_SESSION_ID } from './hooks/useSessions'
import { useChatStream } from './hooks/useChatStream'
import { getShortcuts, matchesShortcut, type ShortcutsMap } from './utils/shortcuts'
import { getNextTabId, getPrevTabId, getTabIdByIndex } from './utils/tab-navigation'
import { api, canonicalizeDirectory } from './services/api'
import { Loader2, Minimize2, MapPin } from 'lucide-react'
import { addSessionToTalkMap } from './components/map/opencode/persist'
import { useI18n } from './utils/i18n'
import type { Message } from './types/opencode'
import { ScheduledTasksModal } from './components/tasks/ScheduledTasksModal'
import { SessionHistoryStack } from './utils/session-history'
import {
  getScheduledTasks,
  shouldRunTask,
  advanceTaskAfterRun,
  updateScheduledTask,
  type ScheduledTask,
} from './utils/scheduler'

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('opencode_sidebar_open')
      if (saved !== null) return saved === 'true'
    } catch {}
    return true
  })
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined)

  const handleOpenSettings = useCallback((tab?: SettingsTab) => {
    setSettingsInitialTab(tab)
    setIsSettingsOpen(true)
  }, [])
  const [isMapOpen, setIsMapOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isScheduledTasksOpen, setIsScheduledTasksOpen] = useState(false)
  const [isZenMode, setIsZenMode] = useState(false)
  const [shortcuts, setShortcuts] = useState<ShortcutsMap>(getShortcuts())
  const { t } = useI18n()

  const toggleSidebar = useCallback((force?: boolean) => {
    setIsSidebarOpen((prev) => {
      const next = typeof force === 'boolean' ? force : !prev
      try {
        localStorage.setItem('opencode_sidebar_open', String(next))
      } catch {}
      return next
    })
  }, [])

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
  } = useSessions()

  const {
    messages,
    sessionStatus,
    todos,
    error,
    sendPrompt,
    abort,
    retry,
    revertToMessage,
    unrevert,
    reverting,
  } = useChatStream(activeSessionId, updateSession)

  // Programmatic draft injection into PromptInput on message revert / restore
  const [draftInjection, setDraftInjection] = useState<DraftInjection | null>(null)

  // Target message jump state (e.g. from Cross-Message Search hit)
  const [targetMessageId, setTargetMessageId] = useState<string | null>(null)

  const handleRestoreMessage = useCallback(
    async (msg: Message) => {
      if (!activeSessionId) return
      // 1. Inject draft text & attachments into PromptInput immediately
      const draft = extractDraftFromMessage(msg)
      setDraftInjection({
        text: draft.text,
        attachments: draft.attachments,
        timestamp: Date.now(),
      })

      // 2. Check if restoring the latest rolled-back message
      const revertIndex = messages.findIndex((m) => m.info.id === activeSession?.revert?.messageID)
      const rolledBackUserMessages =
        revertIndex !== -1
          ? messages.slice(revertIndex + 1).filter((m) => m.info.role === 'user')
          : []
      const isLatest =
        rolledBackUserMessages.length <= 1 ||
        rolledBackUserMessages[rolledBackUserMessages.length - 1].info.id === msg.info.id

      if (isLatest) {
        await unrevert()
      } else {
        await revertToMessage(msg.info.id)
      }
    },
    [activeSessionId, activeSession?.revert?.messageID, messages, unrevert, revertToMessage]
  )

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

  // Prevent browser default behavior of navigating away when dropping files outside drop targets
  useEffect(() => {
    const handleWindowDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault()
      }
    }
    const handleWindowDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault()
      }
    }
    window.addEventListener('dragover', handleWindowDragOver)
    window.addEventListener('drop', handleWindowDrop)
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver)
      window.removeEventListener('drop', handleWindowDrop)
    }
  }, [])

  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const handleDaemonRestored = useCallback(() => {
    setToastMessage('已恢复与 WSL 后端守护进程的连接')
    setTimeout(() => setToastMessage(null), 3500)
    refresh()
  }, [refresh])

  const handleDaemonLost = useCallback(() => {
    setToastMessage('WSL 后端连接中断，正在尝试指数退避重连...')
    setTimeout(() => setToastMessage(null), 4000)
  }, [])

  const handleAddSessionToMap = useCallback(
    async (sessionId: string) => {
      try {
        const target = sessions.find((s) => s.id === sessionId)
        const res = await addSessionToTalkMap(sessionId, target?.directory, target?.title)
        window.dispatchEvent(
          new CustomEvent('opencode:map-card-added', {
            detail: { cardId: res.cardId, sessionId },
          })
        )
        setToastMessage(res.alreadyExisted ? '会话已在蓝图地图中' : '已放入蓝图地图')
        setTimeout(() => setToastMessage(null), 2200)
      } catch (err) {
        console.error('Failed to add session to map:', err)
        setToastMessage('放入地图失败，请重试')
        setTimeout(() => setToastMessage(null), 2200)
      }
    },
    [sessions]
  )

  const openTabIdsRef = useRef(openTabIds)
  useEffect(() => {
    openTabIdsRef.current = openTabIds
  }, [openTabIds])

  const activeSessionIdRef = useRef(activeSessionId)
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  // Auto-focus window & document on mount, and lock KeyW & Tab if supported
  useEffect(() => {
    try {
      window.focus()
      if (!document.activeElement || document.activeElement === document.body) {
        document.body.focus?.()
      }
      // Attempt keyboard lock for KeyW and Tab so host container doesn't intercept
      const nav = navigator as unknown as { keyboard?: { lock?: (keys: string[]) => Promise<void> } }
      if (nav.keyboard?.lock) {
        nav.keyboard.lock(['KeyW', 'Tab']).catch(() => {})
      }
    } catch {}
  }, [])

  // Listen for direct session switch requests (e.g. from internal links) and popstate
  useEffect(() => {
    const handleSwitchSession = (e: Event) => {
      const custom = e as CustomEvent<{ sessionID: string }>
      if (custom.detail?.sessionID) {
        selectSession(custom.detail.sessionID)
      }
    }
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search)
      const sessId = urlParams.get('session')
      if (sessId && sessId !== activeSessionId) {
        selectSession(sessId)
      }
    }

    window.addEventListener('switch-session', handleSwitchSession)
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('switch-session', handleSwitchSession)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [selectSession, activeSessionId])

  // Navigation History Stack (Back / Forward)
  const historyStack = useRef(new SessionHistoryStack(50, activeSessionId))
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const isNavigatingHistory = useRef(false)

  const updateHistoryState = useCallback(() => {
    setCanGoBack(historyStack.current.canGoBack)
    setCanGoForward(historyStack.current.canGoForward)
  }, [])

  const handleSelectSessionWithHistory = useCallback(
    (id: string) => {
      if (!isNavigatingHistory.current) {
        historyStack.current.push(id)
        updateHistoryState()
      }
      selectSession(id)
    },
    [selectSession, updateHistoryState]
  )

  const handleHistoryBack = useCallback(() => {
    if (!historyStack.current.canGoBack) return
    isNavigatingHistory.current = true
    const prevId = historyStack.current.back()
    if (prevId) {
      selectSession(prevId)
    }
    updateHistoryState()
    isNavigatingHistory.current = false
  }, [selectSession, updateHistoryState])

  const handleHistoryForward = useCallback(() => {
    if (!historyStack.current.canGoForward) return
    isNavigatingHistory.current = true
    const nextId = historyStack.current.forward()
    if (nextId) {
      selectSession(nextId)
    }
    updateHistoryState()
    isNavigatingHistory.current = false
  }, [selectSession, updateHistoryState])

  // Sync initial session into history stack once loaded
  useEffect(() => {
    if (activeSessionId && historyStack.current.current() !== activeSessionId) {
      if (!isNavigatingHistory.current) {
        historyStack.current.push(activeSessionId)
        updateHistoryState()
      }
    }
  }, [activeSessionId, updateHistoryState])

  const handleNewSession = useCallback(
    (directory?: string) => {
      if (directory) {
        const matched = projects.find((p) => p.worktree === directory)
        if (matched) {
          setSelectedProjectId(matched.id)
        }
      }
      startDraftSession()
    },
    [projects, setSelectedProjectId, startDraftSession]
  )

  // Scheduled Tasks runner (checks every 15s)
  useEffect(() => {
    const runner = async () => {
      const tasks = getScheduledTasks()
      const now = Date.now()
      for (const task of tasks) {
        if (shouldRunTask(task, now)) {
          try {
            console.log(`[ScheduledTask] Running task "${task.title}"...`)
            const newSession = await createNewSession({
              title: task.title,
              directory: task.directory,
              agent: task.agent,
              model: task.model,
            })
            await api.sendPrompt(newSession.id, task.prompt)
            const advanced = advanceTaskAfterRun(task, now)
            updateScheduledTask(task.id, {
              enabled: advanced.enabled,
              lastRun: advanced.lastRun,
              nextRun: advanced.nextRun,
              lastStatus: 'success',
              lastSessionId: newSession.id,
            })
            setToastMessage(`计划任务 "${task.title}" 已自动触发执行`)
            setTimeout(() => setToastMessage(null), 3000)
          } catch (err: any) {
            console.error(`[ScheduledTask] Failed to execute task "${task.title}":`, err)
            updateScheduledTask(task.id, {
              lastStatus: 'error',
              lastError: err?.message || 'Execution error',
            })
          }
        }
      }
    }

    const timer = setInterval(runner, 15000)
    return () => clearInterval(timer)
  }, [createNewSession])

  const handleRunScheduledTaskNow = useCallback(
    async (task: ScheduledTask) => {
      const newSession = await createNewSession({
        title: task.title,
        directory: task.directory,
        agent: task.agent,
        model: task.model,
      })
      await api.sendPrompt(newSession.id, task.prompt)
      const advanced = advanceTaskAfterRun(task, Date.now())
      updateScheduledTask(task.id, {
        enabled: advanced.enabled,
        lastRun: advanced.lastRun,
        nextRun: advanced.nextRun,
        lastStatus: 'success',
        lastSessionId: newSession.id,
      })
      setToastMessage(`已手动触发计划任务 "${task.title}"`)
      setTimeout(() => setToastMessage(null), 3000)
    },
    [createNewSession]
  )

  const handleSendPrompt = useCallback(
    async (
      text: string,
      options?: {
        agent?: string
        model?: { providerID: string; modelID: string }
        attachments?: any[]
      }
    ) => {
      // If currently in a draft session (or no active session), lazily create the session on first send!
      if (!activeSessionId || activeSessionId === DRAFT_SESSION_ID) {
        const selectedProject = selectedProjectId
          ? projects.find(
              (p) =>
                p.id === selectedProjectId ||
                Boolean(p.associatedIds && p.associatedIds.includes(selectedProjectId))
            )
          : null
        const projectDirectory = canonicalizeDirectory(selectedProject?.worktree)
        const sessionTitle =
          text.trim().slice(0, 40) ||
          `New session - ${new Date().toLocaleString('zh-CN', { hour12: false })}`

        try {
          const newSession = await createNewSession({
            title: sessionTitle,
            directory: projectDirectory,
            agent: options?.agent,
            model: options?.model
              ? { id: options.model.modelID, providerID: options.model.providerID }
              : undefined,
          })

          // Dispatch prompt into the newly created session
          await api.sendPrompt(newSession.id, text, options)
        } catch (err) {
          console.error('Failed to create session on first send:', err)
        }
        return
      }

      // Existing real session: send directly via useChatStream
      await sendPrompt(text, options)
    },
    [activeSessionId, projects, selectedProjectId, createNewSession, sendPrompt]
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
        // If in Zen mode and no modal is open, exit Zen mode
        if (isZenMode) {
          e.preventDefault()
          toggleZenMode(false)
          return
        }
      }

      // 0. Fast-path: Instant Sidebar Toggle (Ctrl+B) with high priority and capture
      const isCtrlB =
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        ((e.key && e.key.toLowerCase() === 'b') || e.code === 'KeyB' || e.keyCode === 66)

      if (!isZenMode && (isCtrlB || matchesShortcut(e, shortcuts.toggleSidebar))) {
        e.preventDefault()
        e.stopPropagation()
        toggleSidebar()
        return
      }

      // Fast-path: Close active tab with Ctrl+W / Cmd+W (Never closes the whole software, only the tab!)
      const isCtrlW =
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        ((e.key && e.key.toLowerCase() === 'w') || e.code === 'KeyW' || e.keyCode === 87)

      if (isCtrlW || matchesShortcut(e, shortcuts.closeActiveTab)) {
        e.preventDefault()
        e.stopPropagation()
        const currentId = activeSessionIdRef.current
        if (currentId) {
          closeTab(currentId)
        }
        return
      }

      // Fast-path: Tab Switching with Ctrl+Tab (Next) and Ctrl+Shift+Tab (Prev)
      const isTabKey = e.key === 'Tab' || e.code === 'Tab' || e.keyCode === 9
      const isCtrlTab = (e.ctrlKey || e.metaKey) && !e.altKey && isTabKey
      const isCtrlPageDown = (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'PageDown' || e.code === 'PageDown')
      const isCtrlPageUp = (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'PageUp' || e.code === 'PageUp')

      if (
        isCtrlTab ||
        isCtrlPageDown ||
        isCtrlPageUp ||
        matchesShortcut(e, shortcuts.prevTab) ||
        matchesShortcut(e, shortcuts.nextTab)
      ) {
        e.preventDefault()
        e.stopPropagation()
        const isPrev =
          isCtrlPageUp ||
          (isCtrlTab && e.shiftKey) ||
          matchesShortcut(e, shortcuts.prevTab)

        const targetId = isPrev
          ? getPrevTabId(openTabIdsRef.current, activeSessionIdRef.current)
          : getNextTabId(openTabIdsRef.current, activeSessionIdRef.current)

        if (targetId) {
          selectSession(targetId)
        }
        return
      }

      // Fast-path: Reopen closed session tab with Ctrl+Shift+T / Cmd+Shift+T
      const isCtrlShiftT =
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        !e.altKey &&
        ((e.key && e.key.toLowerCase() === 't') || e.code === 'KeyT' || e.keyCode === 84)

      if (isCtrlShiftT || matchesShortcut(e, shortcuts.reopenClosedTab)) {
        e.preventDefault()
        e.stopPropagation()
        reopenClosedTab()
        return
      }

      // Fast-path: Direct tab jump with Ctrl+1 ~ Ctrl+9 (Ctrl+9 jumps to last tab)
      const isDigit = e.key >= '1' && e.key <= '9'
      const isCtrlDigit = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && isDigit

      if (isCtrlDigit) {
        e.preventDefault()
        e.stopPropagation()
        const digit = parseInt(e.key, 10)
        const targetId = getTabIdByIndex(openTabIdsRef.current, digit)
        if (targetId) {
          selectSession(targetId)
        }
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

    // Use capture phase (true) so Ctrl+B, Ctrl+W, Ctrl+Tab, and Ctrl+Shift+T intercept before browser/OS accelerators
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [
    shortcuts,
    isZenMode,
    isSettingsOpen,
    isMapOpen,
    isSearchOpen,
    handleNewSession,
    toggleZenMode,
    toggleSidebar,
    closeTab,
    reopenClosedTab,
    selectSession,
  ])

  return (
    <DiffDrawerProvider activeSessionId={activeSessionId}>
      <div className="flex h-screen w-screen bg-[#0c0d0e] text-[#e6edf3] font-sans antialiased overflow-hidden">
        {/* 0. Top-Right Subtle Hover-Revealed Zen Mode Exit Capsule */}
      {isZenMode && (
        <div className="fixed top-3.5 right-5 z-50 group pointer-events-auto">
          <button
            onClick={() => toggleZenMode(false)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#14171d]/60 hover:bg-[#1c212a] border border-zinc-700/40 hover:border-zinc-500/80 text-zinc-400 hover:text-zinc-100 shadow-xl backdrop-blur-md transition-all duration-300 opacity-25 hover:opacity-100 group-hover:opacity-100 cursor-pointer"
            title={t.zen.exitZenTitle(shortcuts.zenMode?.label || 'F11')}
          >
            <Minimize2 className="w-3.5 h-3.5 text-zinc-400 group-hover:text-purple-400 transition-colors" />
            <span className="text-xs font-medium tracking-wide">{t.zen.exitZenLabel}</span>
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
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSessionWithHistory}
          onNewSession={handleNewSession}
          onDeleteSession={(id) => {
            historyStack.current.remove(id)
            updateHistoryState()
            deleteSession(id)
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenSettings={() => handleOpenSettings()}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenScheduledTasks={() => setIsScheduledTasksOpen(true)}
          onToggleSidebar={() => toggleSidebar()}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onHistoryBack={handleHistoryBack}
          onHistoryForward={handleHistoryForward}
          onUpdateSessionTitle={(sessionId, newTitle) => updateSession(sessionId, { title: newTitle })}
          onShowInMap={handleAddSessionToMap}
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
            onCloseOtherTabs={closeOtherTabs}
            onCloseTabsToRight={closeTabsToRight}
            onReopenClosedTab={reopenClosedTab}
            canReopenClosedTab={recentlyClosedTabIds.length > 0}
            onNewSession={handleNewSession}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => toggleSidebar()}
            onToggleMap={() => setIsMapOpen((prev) => !prev)}
            onOpenSearch={() => setIsSearchOpen(true)}
            onToggleZenMode={() => toggleZenMode(true)}
            zenShortcutLabel={shortcuts.zenMode?.label || 'F11'}
            onGetSessionJson={
              activeSessionId
                ? () => api.getAllMessagesRaw(activeSessionId)
                : undefined
            }
            onUpdateSessionTitle={(sessionId, newTitle) => updateSession(sessionId, { title: newTitle })}
            onShowInMap={handleAddSessionToMap}
            onOpenSettings={handleOpenSettings}
            onDaemonRestored={handleDaemonRestored}
            onDaemonLost={handleDaemonLost}
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
            {/* Scrollable Timeline with Native Message Revert */}
            <ChatTimeline
              messages={messages}
              sessionStatus={sessionStatus}
              error={error}
              onRetry={retry}
              onPromptSuggestion={(text) => sendPrompt(text)}
              isZenMode={isZenMode}
              activeSession={activeSession}
              onRevertToMessage={revertToMessage}
              onUnrevert={unrevert}
              onDraftInject={(draft) => setDraftInjection(draft)}
              isReverting={reverting}
              targetMessageId={targetMessageId}
              onTargetMessageScrolled={() => setTargetMessageId(null)}
            />

            {/* In Zen mode, stack SessionRevertDock, TodoBanner and PromptInput in a floating dock to prevent collision */}
            {isZenMode ? (
              <div className="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-3xl w-[calc(100%-2rem)] z-40 flex flex-col gap-2 pointer-events-none">
                <div className="pointer-events-auto">
                  <SessionRevertDock
                    activeSession={activeSession}
                    messages={messages}
                    onRestoreMessage={handleRestoreMessage}
                    isRestoring={reverting}
                  />
                </div>
                <div className="pointer-events-auto">
                  <TodoBanner todos={todos} isZenMode={isZenMode} />
                </div>
                <div className="pointer-events-auto">
                  <PromptInput
                    activeSession={activeSession}
                    onSend={handleSendPrompt}
                    onAbort={abort}
                    isBusy={sessionStatus.type === 'busy'}
                    isZenMode={isZenMode}
                    draftInjection={draftInjection}
                    projects={projects}
                    selectedProjectId={selectedProjectId}
                    onSelectProject={setSelectedProjectId}
                    onNewProject={async () => { await refresh() }}
                    sessions={sessions}
                  />
                </div>
              </div>
            ) : (
              <>
                {/* Native OpenCode Rolled Back Messages Dock */}
                <SessionRevertDock
                  activeSession={activeSession}
                  messages={messages}
                  onRestoreMessage={handleRestoreMessage}
                  isRestoring={reverting}
                />

                {/* Floating Todo Banner (Image 1) */}
                <TodoBanner todos={todos} isZenMode={isZenMode} />

                {/* Bottom Prompt Controls (Image 1 & Image 2) */}
                <PromptInput
                  activeSession={activeSession}
                  onSend={handleSendPrompt}
                  onAbort={abort}
                  isBusy={sessionStatus.type === 'busy'}
                  isZenMode={isZenMode}
                  draftInjection={draftInjection}
                  projects={projects}
                  selectedProjectId={selectedProjectId}
                  onSelectProject={setSelectedProjectId}
                  onNewProject={async () => { await refresh() }}
                  sessions={sessions}
                />
              </>
            )}
          </main>
        )}
      </div>

      {/* 3. Settings Modal (Image 3) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false)
          setSettingsInitialTab(undefined)
        }}
        initialTab={settingsInitialTab}
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
        onSelectSession={(sessionId, messageId) => {
          if (messageId) {
            setTargetMessageId(messageId)
          }
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

      {/* 5.5 Scheduled Tasks Modal */}
      <ScheduledTasksModal
        isOpen={isScheduledTasksOpen}
        onClose={() => setIsScheduledTasksOpen(false)}
        projects={projects}
        onRunTaskNow={handleRunScheduledTaskNow}
      />

      {/* 6. Right-Side File Diff Drawer (Zero Layout Shift Overlay) */}
      <DiffSidebarDrawer />

      {/* Floating Action Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-3 py-2 bg-[#16181f]/95 border border-[#2d323e] text-zinc-100 text-xs rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <MapPin className="w-3.5 h-3.5 text-orange-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  </DiffDrawerProvider>
  )
}
