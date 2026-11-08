import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { ChatTimeline } from './components/chat/ChatTimeline'
import { PromptInput, type DraftInjection } from './components/chat/PromptInput'
import { SessionRevertDock } from './components/chat/SessionRevertDock'
import { extractDraftFromMessage } from './utils/draft'
import { SettingsModal, type SettingsTab } from './components/settings/SettingsModal'
import { FloatingMapModal } from './components/map/FloatingMapModal'
import { FloatingSearchModal } from './components/search/FloatingSearchModal'
import { FloatingSessionBoardModal } from './components/search/FloatingSessionBoardModal'
import { DiffDrawerProvider } from './components/diff/DiffDrawerContext'
import { DiffSidebarDrawer } from './components/diff/DiffSidebarDrawer'
import { useSessions, DRAFT_SESSION_ID } from './hooks/useSessions'
import { useChatStream } from './hooks/useChatStream'
import { usePromptQueue } from './hooks/usePromptQueue'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { useScheduledTasksRunner } from './hooks/useScheduledTasksRunner'
import { useSideQuestion } from './hooks/useSideQuestion'
import { SideQuestionCard } from './components/chat/SideQuestionCard'
import { api } from './services/api'
import {
  resolveActiveMapDirectory,
  resolveDraftSessionLaunch,
  resolveRestoreMessageAction,
} from './utils/app-helpers'
import { Loader2, Minimize2, MapPin, Archive, ArchiveRestore, Check } from 'lucide-react'
import { addSessionToTalkMap } from './components/map/opencode/persist'
import { useI18n } from './utils/i18n'
import type { Message, PromptAttachment } from './types/opencode'
import { sseManager } from './services/sse'
import {
  getUnreadSessionIds,
  markHumanInitiated,
  markSessionRead,
  handleSessionCompletion,
  UNREAD_UPDATE_EVENT,
} from './utils/session-unread'
import { ScheduledTasksModal } from './components/tasks/ScheduledTasksModal'
import { BackgroundTasksModal } from './components/tasks/BackgroundTasksModal'
import { SubagentTopologyInspector } from './components/chat/SubagentTopologyInspector'
import { FloatingModelRouter } from './components/router/FloatingModelRouter'
import { SessionHistoryStack } from './utils/session-history'
import { getPreferences } from './utils/preferences'

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    try {
      const prefs = getPreferences()
      if (prefs.collapseSidebarOnStartup) {
        return false
      }
      const saved = localStorage.getItem('opencode_sidebar_open')
      if (saved !== null) return saved === 'true'
    } catch {}
    return true
  })
  const [isHeaderVisible, setIsHeaderVisible] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('opencode_header_visible')
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
  const [isSessionBoardOpen, setIsSessionBoardOpen] = useState(false)
  const [isFindOpen, setIsFindOpen] = useState(false)
  const [isScheduledTasksOpen, setIsScheduledTasksOpen] = useState(false)
  const [isBackgroundTasksOpen, setIsBackgroundTasksOpen] = useState(false)
  const [isSubagentTopologyOpen, setIsSubagentTopologyOpen] = useState(false)
  const [isModelRouterOpen, setIsModelRouterOpen] = useState(false)
  const [modelRouterTab, setModelRouterTab] = useState<'workflow' | 'relay'>('workflow')
  useEffect(() => {
    if (!isSessionBoardOpen) return
    setIsSearchOpen(false)
    setIsMapOpen(false)
    setIsSettingsOpen(false)
    setIsSubagentTopologyOpen(false)
    setIsModelRouterOpen(false)
    setIsScheduledTasksOpen(false)
    setIsBackgroundTasksOpen(false)
    setIsFindOpen(false)
  }, [isSessionBoardOpen])
  const { t, lang } = useI18n()
  const isZh = lang === 'zh-CN'

  // Unread sessions state (blue indicator for human-initiated prompts upon AI completion)
  const [unreadSessionIds, setUnreadSessionIds] = useState<string[]>(() => getUnreadSessionIds())
  // Active busy sessions tracking across the workspace
  const [busySessionIds, setBusySessionIds] = useState<string[]>([])

  useEffect(() => {
    const handleUnreadUpdate = () => {
      setUnreadSessionIds(getUnreadSessionIds())
    }
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'opencode_unread_sessions') {
        setUnreadSessionIds(getUnreadSessionIds())
      }
    }
    window.addEventListener(UNREAD_UPDATE_EVENT, handleUnreadUpdate)
    window.addEventListener('storage', handleStorage)

    const handleOpenTopology = () => setIsSubagentTopologyOpen(true)
    window.addEventListener('opencode-open-subagent-topology', handleOpenTopology)

    return () => {
      window.removeEventListener(UNREAD_UPDATE_EVENT, handleUnreadUpdate)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('opencode-open-subagent-topology', handleOpenTopology)
    }
  }, [])

  // Listen for AI completion on any session via SSE (only marks unread if initiated by human)
  useEffect(() => {
    const onIdle = (data: { sessionID?: string }) => {
      if (data?.sessionID) {
        handleSessionCompletion(data.sessionID)
        setBusySessionIds((prev) => prev.filter((id) => id !== data.sessionID))
      }
    }
    const onStatus = (data: { sessionID?: string; status?: { type?: string } }) => {
      if (!data?.sessionID) return
      const id = data.sessionID
      if (data.status?.type === 'busy' || data.status?.type === 'retry') {
        setBusySessionIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
      } else if (data.status?.type === 'idle') {
        handleSessionCompletion(id)
        setBusySessionIds((prev) => prev.filter((x) => x !== id))
      }
    }
    const unsubIdle = sseManager.onSessionIdle(onIdle)
    const unsubStatus = sseManager.onSessionStatus(onStatus)
    return () => {
      unsubIdle()
      unsubStatus()
    }
  }, [])

  // Poll daemon session statuses to discover active busy sessions on load and reconnect
  useEffect(() => {
    let mounted = true
    const checkStatuses = async () => {
      try {
        const statusMap = await api.getAllSessionStatuses()
        if (!mounted || !statusMap) return
        const daemonBusyIds = Object.entries(statusMap)
          .filter(([_, s]) => s && (s.type === 'busy' || s.type === 'retry'))
          .map(([id]) => id)
        setBusySessionIds((prev) => {
          const merged = new Set([...prev, ...daemonBusyIds])
          return Array.from(merged)
        })
      } catch {}
    }
    checkStatuses()
    const timer = setInterval(checkStatuses, 4000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  const toggleHeader = useCallback((force?: boolean) => {
    setIsHeaderVisible((prev) => {
      const next = typeof force === 'boolean' ? force : !prev
      try {
        localStorage.setItem('opencode_header_visible', String(next))
      } catch {}
      window.dispatchEvent(
        new CustomEvent('opencode-toast', {
          detail: {
            message: next
              ? (isZh ? '已显示上方栏 (Ctrl+Shift+B)' : 'Top bar visible (Ctrl+Shift+B)')
              : (isZh ? '已隐藏上方栏 (Ctrl+Shift+B)' : 'Top bar hidden (Ctrl+Shift+B)'),
          },
        })
      )
      return next
    })
  }, [isZh])

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
    unarchiveSession,
    isArchived,
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
    reorderTabs,
    createNewSession,
    deleteSession,
    updateSession,
    refresh,
  } = useSessions()

  const {
    messages,
    sessionStatus,
    runKnown,
    todos,
    loading: messagesLoading,
    error,
    autoRecoveryState,
    isErrorTerminal,
    turnEnd,
    isSending,
    isReconcilingIdle,
    sendPrompt,
    abort,
    retry,
    revertToMessage,
    unrevert,
    reverting,
  } = useChatStream(activeSessionId, updateSession, activeSession?.directory)

  const isBusy =
    isSending ||
    isReconcilingIdle ||
    Boolean(autoRecoveryState) ||
    (runKnown && (sessionStatus.type === 'busy' || sessionStatus.type === 'retry'))

  const effectiveBusySessionIds = useMemo(() => {
    const set = new Set(busySessionIds)
    if (activeSessionId && isBusy) {
      set.add(activeSessionId)
    }
    return Array.from(set)
  }, [busySessionIds, activeSessionId, isBusy])

  const {
    currentSideQuestion,
    currentIndex,
    totalCount,
    isCardOpen,
    askSideQuestion,
    closeCard,
    toggleCard,
    goToPrev,
    goToNext,
    deleteSideQuestion,
    clearSessionSideQuestions,
    migrateDraftSideQuestions,
    sideQuestionModel,
    setSideQuestionModel,
    providers,
  } = useSideQuestion(activeSessionId)

  const handleSideQuestion = useCallback(
    (question: string) => {
      void askSideQuestion(question, messages, activeSession?.directory, sideQuestionModel)
    },
    [askSideQuestion, messages, activeSession?.directory, sideQuestionModel]
  )

  const [draftInjection, setDraftInjection] = useState<DraftInjection | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((msg: string, durationMs = 2500) => {
    setToastMessage(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMessage(null), durationMs)
  }, [])

  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const custom = e as CustomEvent<{ message?: string; duration?: number }>
      if (custom.detail?.message) {
        showToast(custom.detail.message, custom.detail.duration || 2500)
      }
    }
    window.addEventListener('opencode:toast', handleToastEvent)
    window.addEventListener('opencode-toast', handleToastEvent)
    return () => {
      window.removeEventListener('opencode:toast', handleToastEvent)
      window.removeEventListener('opencode-toast', handleToastEvent)
    }
  }, [showToast])

  const { handleRunScheduledTaskNow } = useScheduledTasksRunner({
    createNewSession,
    onToast: showToast,
  })

  const handleSendPrompt = useCallback(
    async (
      text: string,
      options?: {
        agent?: string
        model?: { providerID: string; modelID: string }
        attachments?: PromptAttachment[]
      }
    ) => {
      if (!activeSessionId || activeSessionId === DRAFT_SESSION_ID) {
        const { projectDirectory, sessionTitle } = resolveDraftSessionLaunch(
          text,
          options,
          selectedProjectId,
          projects
        )

        try {
          const newSession = await createNewSession({
            title: sessionTitle,
            directory: projectDirectory,
            agent: options?.agent,
            model: options?.model
              ? { id: options.model.modelID, providerID: options.model.providerID }
              : undefined,
          })

          markHumanInitiated(newSession.id)
          migrateDraftSideQuestions(newSession.id)
          migrateDraftQueue(newSession.id)
          return await sendPrompt(text, options, newSession.id)
        } catch (err) {
          console.error('[App] Failed to create session or send prompt on first send:', err)
          return false
        }
      }

      if (activeSessionId && isArchived(activeSessionId)) {
        unarchiveSession(activeSessionId)
      }

      markHumanInitiated(activeSessionId)
      return await sendPrompt(text, options)
    },
    [activeSessionId, projects, selectedProjectId, createNewSession, sendPrompt, isArchived, unarchiveSession]
  )

  const {
    queuedMessages,
    isQueuePaused,
    isDispatchingQueue,
    queueEditRequest,
    enqueue: handleEnqueue,
    removeQueued: handleDeleteQueued,
    editQueued: handleEditQueued,
    sendQueuedNow,
    migrateDraftQueue,
  } = usePromptQueue({
    activeSessionId,
    isBusy,
    runKnown,
    sessionStatusType: sessionStatus.type,
    turnEnd,
    onSendPrompt: handleSendPrompt,
    onAbort: abort,
  })

  const [targetMessageId, setTargetMessageId] = useState<string | null>(null)

  const handleRestoreMessage = useCallback(
    async (msg: Message) => {
      if (!activeSessionId) return
      const draft = extractDraftFromMessage(msg)
      setDraftInjection({
        text: draft.text,
        attachments: draft.attachments,
        timestamp: Date.now(),
        focus: true,
      })

      const decision = resolveRestoreMessageAction(
        messages,
        activeSession?.revert?.messageID,
        msg.info.id
      )
      if (decision.action === 'unrevert') {
        await unrevert()
      } else {
        await revertToMessage(decision.targetBoundaryId)
      }
    },
    [activeSessionId, activeSession?.revert?.messageID, messages, unrevert, revertToMessage]
  )

  const lastAutoInjectedSessionRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeSessionId || !activeSession?.revert?.messageID) return
    const key = `${activeSessionId}:${activeSession.revert.messageID}`
    if (lastAutoInjectedSessionRef.current === key) return

    const revertIndex = messages.findIndex((m) => m.info.id === activeSession.revert?.messageID)
    if (revertIndex !== -1) {
      const rolledBackUserMessages = messages
        .slice(revertIndex)
        .filter((m) => m.info.role === 'user')
      if (rolledBackUserMessages.length > 0) {
        lastAutoInjectedSessionRef.current = key
        const latestMsg = rolledBackUserMessages[rolledBackUserMessages.length - 1]
        const draft = extractDraftFromMessage(latestMsg)
        setDraftInjection({
          text: draft.text,
          attachments: draft.attachments,
          timestamp: Date.now(),
          focus: false,
        })
      }
    }
  }, [activeSessionId, activeSession?.revert?.messageID, messages])

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

  const [mapTargetSessionId, setMapTargetSessionId] = useState<string | null>(null)

  const handleOpenMapAndLocate = useCallback(
    async (sessionId?: string | null) => {
      const sid = sessionId || activeSessionId
      if (sid) {
        const target = sessions.find((s) => s.id === sid)
        try {
          await addSessionToTalkMap(sid, target?.directory, target?.title)
          window.dispatchEvent(
            new CustomEvent('opencode:map-card-added', {
              detail: { sessionId: sid },
            })
          )
        } catch (err) {
          console.error('Failed to ensure session in map:', err)
        }
        setMapTargetSessionId(sid)
      } else {
        setMapTargetSessionId(null)
      }
      setIsMapOpen(true)
    },
    [activeSessionId, sessions]
  )

  useEffect(() => {
    try {
      window.focus()
      if (!document.activeElement || document.activeElement === document.body) {
        document.body.focus?.()
      }
      const nav = navigator as unknown as { keyboard?: { lock?: (keys: string[]) => Promise<void> } }
      if (nav.keyboard?.lock) {
        nav.keyboard.lock(['KeyW', 'Tab']).catch(() => {})
      }
    } catch {}
  }, [])

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
      markSessionRead(id)
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

  useEffect(() => {
    if (activeSessionId && historyStack.current.current() !== activeSessionId) {
      if (!isNavigatingHistory.current) {
        historyStack.current.push(activeSessionId)
        updateHistoryState()
      }
    }
  }, [activeSessionId, updateHistoryState])

  useEffect(() => {
    if (activeSessionId) {
      markSessionRead(activeSessionId)
    }
  }, [activeSessionId])

  useEffect(() => {
    const baseTitle = activeSession?.title || 'OpenCode Companion'
    if (unreadSessionIds.length > 0) {
      document.title = `(● ${unreadSessionIds.length}) ${baseTitle}`
    } else {
      document.title = baseTitle
    }
  }, [unreadSessionIds.length, activeSession?.title])

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

  const { isZenMode, toggleZenMode, shortcuts } = useGlobalShortcuts({
    activeSessionId,
    openTabIds,
    isSettingsOpen,
    setIsSettingsOpen,
    isMapOpen,
    setIsMapOpen,
    setMapTargetSessionId,
    isSearchOpen,
    setIsSearchOpen,
    isSessionBoardOpen,
    setIsSessionBoardOpen,
    isFindOpen,
    setIsFindOpen,
    isModelRouterOpen,
    setIsModelRouterOpen,
    isBackgroundTasksOpen,
    setIsBackgroundTasksOpen,
    setIsSubagentTopologyOpen,
    handleNewSession,
    toggleSidebar,
    toggleHeader,
    closeTab,
    reopenClosedTab,
    selectSession,
    handleAddSessionToMap,
    handleOpenMapAndLocate,
  })

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <DiffDrawerProvider activeSessionId={activeSessionId}>
      <div className="flex h-full w-full bg-[#13131a] text-[#f1f5f9] font-sans antialiased overflow-hidden">
        {isZenMode && (
          <div className="fixed top-3.5 right-5 z-50 group pointer-events-auto">
            <button
              onClick={() => toggleZenMode(false)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#14171d]/60 hover:bg-[#1c212a] border border-zinc-700/40 hover:border-zinc-500/80 text-zinc-400 hover:text-zinc-100 shadow-xl backdrop-blur-md transition-all duration-300 opacity-25 hover:opacity-100 group-hover:opacity-100 cursor-pointer"
              title={t.zen.exitZenTitle(shortcuts.zenMode?.label || 'F11')}
            >
              <Minimize2 className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
              <span className="text-xs font-medium tracking-wide">{t.zen.exitZenLabel}</span>
              <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60 shadow-inner">
                {shortcuts.zenMode?.label || 'F11'} / Esc
              </span>
            </button>
          </div>
        )}

        {!isZenMode && (
          <Sidebar
            isOpen={isSidebarOpen}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            groupedSessions={groupedSessions}
            sessions={sessions}
            activeSessionId={activeSessionId}
            activeSession={activeSession}
            messages={messages}
            todos={todos}
            unreadSessionIds={unreadSessionIds}
            busySessionIds={effectiveBusySessionIds}
            onSelectSession={handleSelectSessionWithHistory}
            onNewSession={handleNewSession}
            onDeleteSession={(id) => {
              historyStack.current.remove(id)
              updateHistoryState()
              deleteSession(id)
              clearSessionSideQuestions(id)
            }}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onOpenSettings={() => handleOpenSettings()}
            onOpenSearch={() => setIsSearchOpen(true)}
            onOpenSessionBoard={() => setIsSessionBoardOpen(true)}
            onOpenScheduledTasks={() => setIsScheduledTasksOpen(true)}
            onOpenBackgroundTasks={() => setIsBackgroundTasksOpen(true)}
            onOpenSubagentTopology={() => setIsSubagentTopologyOpen(true)}
            onToggleSidebar={() => toggleSidebar()}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onHistoryBack={handleHistoryBack}
            onHistoryForward={handleHistoryForward}
            sessionStatus={sessionStatus}
            runKnown={runKnown}
            onOpenMapAndLocate={handleOpenMapAndLocate}
            onAddSessionToMap={handleAddSessionToMap}
            onOpenModelRouter={() => {
              setModelRouterTab('workflow')
              setIsModelRouterOpen(true)
            }}
            onOpenRelayHub={() => {
              setModelRouterTab('relay')
              setIsModelRouterOpen(true)
            }}
            onGetSessionJson={
              activeSessionId
                ? () => api.getAllMessagesRaw(activeSessionId)
                : undefined
            }
            onToggleZenMode={() => toggleZenMode(true)}
            onOpenFind={() => setIsFindOpen(true)}
            isHeaderVisible={isHeaderVisible}
            onToggleHeader={toggleHeader}
            onDaemonRestored={handleDaemonRestored}
            onDaemonLost={handleDaemonLost}
            onUpdateSessionTitle={(sessionId, newTitle) => updateSession(sessionId, { title: newTitle })}
            onShowInMap={handleAddSessionToMap}
          />
        )}

        <div
          className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden transition-colors duration-300 ${
            isZenMode ? 'bg-[#101016]' : 'bg-[#13131a]'
          }`}
          onClick={() => {
            if (activeSessionId) {
              markSessionRead(activeSessionId)
            }
          }}
        >
          {!isZenMode && isHeaderVisible && (
            <Header
              projects={projects}
              sessions={sessions}
              openTabIds={openTabIds}
              activeSessionId={activeSessionId}
              unreadSessionIds={unreadSessionIds}
              busySessionIds={effectiveBusySessionIds}
              onSelectTab={(sessionId) => {
                markSessionRead(sessionId)
                selectSession(sessionId)
              }}
              onCloseTab={closeTab}
              onCloseOtherTabs={closeOtherTabs}
              onCloseTabsToRight={closeTabsToRight}
              onReopenClosedTab={reopenClosedTab}
              canReopenClosedTab={recentlyClosedTabIds.length > 0}
              onNewSession={handleNewSession}
              onToggleMap={() => setIsMapOpen((prev) => !prev)}
              onUpdateSessionTitle={(sessionId, newTitle) => updateSession(sessionId, { title: newTitle })}
              onShowInMap={handleAddSessionToMap}
              onReorderTabs={reorderTabs}
            />
          )}

          {sessionsLoading ? (
            <div className="flex-1 flex items-center justify-center text-zinc-500 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
              <span className="text-xs">Connecting to OpenCode backend...</span>
            </div>
          ) : (
            <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
              {activeSessionId && isArchived(activeSessionId) && (
                <div className="bg-[#14161d] border-b border-sky-800/40 px-4 py-2 flex items-center justify-between text-xs text-sky-200/90 shrink-0 z-20 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>
                      {isZh
                        ? '此会话已归档。它已被移出活跃列表，但历史消息与上下文完整保留。发送新消息将自动恢复此会话。'
                        : 'This conversation is archived. It is hidden from active project trees, but all history is preserved. Sending a message will automatically unarchive it.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => unarchiveSession(activeSessionId)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-950/60 hover:bg-sky-900/60 text-sky-300 hover:text-sky-100 border border-sky-700/50 text-xs font-medium transition-colors cursor-pointer shrink-0 ml-3"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    <span>{isZh ? '恢复会话' : 'Unarchive'}</span>
                  </button>
                </div>
              )}

              <ChatTimeline
                messages={messages}
                sessionStatus={sessionStatus}
                runKnown={runKnown}
                error={error}
                autoRecoveryState={autoRecoveryState}
                isErrorTerminal={isErrorTerminal}
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
                isFindOpen={isFindOpen}
                onCloseFind={() => setIsFindOpen(false)}
                messagesLoading={messagesLoading || sessionsLoading}
                projects={projects}
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                onNewProject={async () => { await refresh() }}
              />

              <div
                className={
                  isZenMode
                    ? 'fixed bottom-4 left-1/2 -translate-x-1/2 max-w-3xl w-[calc(100%-2rem)] z-40 flex flex-col gap-2 pointer-events-none'
                    : 'flex flex-col shrink-0'
                }
              >
                {isCardOpen && currentSideQuestion && (
                  <div
                    className={
                      isZenMode
                        ? 'pointer-events-auto'
                        : 'mx-auto w-full px-4 sm:px-6 lg:px-8 pb-2 max-w-4xl xl:max-w-5xl'
                    }
                  >
                    <SideQuestionCard
                      data={currentSideQuestion}
                      currentIndex={currentIndex}
                      totalCount={totalCount}
                      onPrev={goToPrev}
                      onNext={goToNext}
                      onClose={closeCard}
                      onDelete={() => deleteSideQuestion()}
                      isZenMode={isZenMode}
                      selectedModel={sideQuestionModel}
                      onSelectModel={setSideQuestionModel}
                      providers={providers}
                    />
                  </div>
                )}

                <div className={isZenMode ? 'pointer-events-auto' : ''}>
                  <SessionRevertDock
                    activeSession={activeSession}
                    messages={messages}
                    onRestoreMessage={handleRestoreMessage}
                    isRestoring={reverting}
                  />
                </div>

                <div className={isZenMode ? 'pointer-events-auto' : ''}>
                  <PromptInput
                    activeSessionId={activeSessionId}
                    activeSession={activeSession}
                    onSend={handleSendPrompt}
                    onSideQuestion={handleSideQuestion}
                    sideQuestionCount={totalCount}
                    onToggleSideQuestion={toggleCard}
                    onAbort={abort}
                    isBusy={isBusy || isDispatchingQueue}
                    runKnown={runKnown}
                    queuedMessages={queuedMessages}
                    isQueuePaused={isQueuePaused}
                    onEnqueue={handleEnqueue}
                    onSendQueuedNow={sendQueuedNow}
                    onEditQueued={handleEditQueued}
                    onDeleteQueued={handleDeleteQueued}
                    queueEditRequest={queueEditRequest}
                    isZenMode={isZenMode}
                    draftInjection={draftInjection}
                    projects={projects}
                    selectedProjectId={selectedProjectId}
                    onSelectProject={setSelectedProjectId}
                    onNewProject={async () => { await refresh() }}
                    sessions={sessions}
                    todos={todos}
                    onSelectModel={(model) => {
                      if (activeSessionId && activeSessionId !== DRAFT_SESSION_ID) {
                        updateSession(activeSessionId, {
                          model: { id: model.modelID, providerID: model.providerID },
                        })
                      }
                    }}
                    onSelectAgent={(agentName) => {
                      if (activeSessionId && activeSessionId !== DRAFT_SESSION_ID) {
                        updateSession(activeSessionId, { agent: agentName })
                      }
                    }}
                  />
                </div>
              </div>
            </main>
          )}
        </div>

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => {
            setIsSettingsOpen(false)
            setSettingsInitialTab(undefined)
          }}
          initialTab={settingsInitialTab}
        />

        <FloatingMapModal
          isOpen={isMapOpen}
          onClose={() => {
            setIsMapOpen(false)
            setMapTargetSessionId(null)
          }}
          targetSessionId={mapTargetSessionId}
          onSelectSession={(sessionId) => {
            selectSession(sessionId)
          }}
          projects={projects}
          activeDirectory={resolveActiveMapDirectory(
            projects,
            selectedProjectId,
            activeSession?.directory
          )}
        />

        <FloatingSearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelectSession={(sessionId, messageId) => {
            markSessionRead(sessionId)
            if (messageId) {
              setTargetMessageId(messageId)
            }
            selectSession(sessionId)
          }}
          sessions={sessions}
          projects={projects}
          initialSelectedProjectId={selectedProjectId}
          unreadSessionIds={unreadSessionIds}
          busySessionIds={effectiveBusySessionIds}
        />

        {isSessionBoardOpen && <FloatingSessionBoardModal
          onClose={() => setIsSessionBoardOpen(false)}
          sessions={sessions}
          projects={projects}
          initialSelectedProjectId={selectedProjectId}
          activeSessionId={activeSessionId}
          unreadSessionIds={unreadSessionIds}
          busySessionIds={effectiveBusySessionIds}
          onSelectSession={(id) => { markSessionRead(id); handleSelectSessionWithHistory(id) }}
          onNewSession={handleNewSession}
          onUpdateSessionTitle={(sessionId, newTitle) => updateSession(sessionId, { title: newTitle })}
        />}

        <ScheduledTasksModal
          isOpen={isScheduledTasksOpen}
          onClose={() => setIsScheduledTasksOpen(false)}
          projects={projects}
          onRunTaskNow={handleRunScheduledTaskNow}
        />

        <BackgroundTasksModal
          isOpen={isBackgroundTasksOpen}
          onClose={() => setIsBackgroundTasksOpen(false)}
          activeSessionId={activeSessionId}
          activeSessionTitle={activeSession?.title}
          messages={messages}
          onAbortSession={async () => {
            await abort()
          }}
          onSendInput={async (input) => {
            await handleSendPrompt(input, {})
          }}
        />

        <SubagentTopologyInspector
          isOpen={isSubagentTopologyOpen}
          onClose={() => setIsSubagentTopologyOpen(false)}
          messages={messages}
          activeSession={activeSession}
          childSessions={sessions.filter((s) => s.parentID === activeSessionId)}
        />

        <FloatingModelRouter
          isOpen={isModelRouterOpen}
          initialTab={modelRouterTab}
          onClose={() => setIsModelRouterOpen(false)}
        />

        <DiffSidebarDrawer />

        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-3 py-2 bg-[#16181f]/95 border border-[#2d323e] text-zinc-100 text-xs rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
            {toastMessage.includes('成功') ? (
              <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
            ) : (
              <MapPin className="w-3.5 h-3.5 text-sky-400" />
            )}
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </DiffDrawerProvider>
  )
}
