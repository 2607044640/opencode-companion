import { useState, useEffect, useCallback, useRef } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { ChatTimeline } from './components/chat/ChatTimeline'
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
import { usePromptQueue } from './hooks/usePromptQueue'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { useScheduledTasksRunner } from './hooks/useScheduledTasksRunner'
import { useSideQuestion } from './hooks/useSideQuestion'
import { SideQuestionCard } from './components/chat/SideQuestionCard'
import { api, canonicalizeDirectory } from './services/api'
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
  const [isFindOpen, setIsFindOpen] = useState(false)
  const [isScheduledTasksOpen, setIsScheduledTasksOpen] = useState(false)
  const [isModelRouterOpen, setIsModelRouterOpen] = useState(false)
  const [modelRouterTab, setModelRouterTab] = useState<'workflow' | 'relay'>('workflow')
  const { t, lang } = useI18n()
  const isZh = lang === 'zh-CN'

  // Unread sessions state (blue indicator for human-initiated prompts upon AI completion)
  const [unreadSessionIds, setUnreadSessionIds] = useState<string[]>(() => getUnreadSessionIds())

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
    return () => {
      window.removeEventListener(UNREAD_UPDATE_EVENT, handleUnreadUpdate)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  // Listen for AI completion on any session via SSE (only marks unread if initiated by human)
  useEffect(() => {
    const onIdle = (data: { sessionID?: string }) => {
      if (data?.sessionID) {
        handleSessionCompletion(data.sessionID)
      }
    }
    const onStatus = (data: { sessionID?: string; status?: { type?: string } }) => {
      if (data?.sessionID && data?.status?.type === 'idle') {
        handleSessionCompletion(data.sessionID)
      }
    }
    const unsubIdle = sseManager.onSessionIdle(onIdle)
    const unsubStatus = sseManager.onSessionStatus(onStatus)
    return () => {
      unsubIdle()
      unsubStatus()
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
    turnEnd,
    isSending,
    sendPrompt,
    abort,
    retry,
    revertToMessage,
    unrevert,
    reverting,
  } = useChatStream(activeSessionId, updateSession, activeSession?.directory)

  const isBusy = isSending || (runKnown && (sessionStatus.type === 'busy' || sessionStatus.type === 'retry'))

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

  const showToast = useCallback((msg: string, durationMs = 2500) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), durationMs)
  }, [])

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
        const selectedProject = selectedProjectId
          ? projects.find(
              (p) =>
                p.id === selectedProjectId ||
                Boolean(p.associatedIds && p.associatedIds.includes(selectedProjectId))
            )
          : null
        const projectDirectory = selectedProject?.worktree
          ? canonicalizeDirectory(selectedProject.worktree)
          : '/home/developer/projects/APISpace'
        const sessionTitle =
          text.trim().slice(0, 40) ||
          (options?.attachments && options.attachments.length > 0
            ? options.attachments[0].name?.slice(0, 40) || 'Image'
            : '') ||
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

          markHumanInitiated(newSession.id)
          migrateDraftSideQuestions(newSession.id)
          migrateDraftQueue(newSession.id)
          await sendPrompt(text, options, newSession.id)
        } catch (err) {
          console.error('[App] Failed to create session or send prompt on first send:', err)
        }
        return
      }

      if (activeSessionId && isArchived(activeSessionId)) {
        unarchiveSession(activeSessionId)
      }

      markHumanInitiated(activeSessionId)
      await sendPrompt(text, options)
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

      const revertIndex = messages.findIndex((m) => m.info.id === activeSession?.revert?.messageID)
      const rolledBackUserMessages =
        revertIndex !== -1
          ? messages.slice(revertIndex).filter((m) => m.info.role === 'user')
          : []
      const isLatest =
        rolledBackUserMessages.length <= 1 ||
        rolledBackUserMessages[rolledBackUserMessages.length - 1].info.id === msg.info.id

      if (isLatest) {
        await unrevert()
      } else {
        const msgIndex = messages.findIndex((m) => m.info.id === msg.info.id)
        const nextMsg = msgIndex !== -1 && msgIndex + 1 < messages.length ? messages[msgIndex + 1] : null
        const targetBoundaryId =
          nextMsg && nextMsg.info.role === 'assistant' ? nextMsg.info.id : msg.info.id
        await revertToMessage(targetBoundaryId)
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

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const handleToast = (e: Event) => {
      const custom = e as CustomEvent<{ message?: string }>
      if (custom.detail?.message) {
        setToastMessage(custom.detail.message)
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => setToastMessage(null), 2500)
      }
    }
    window.addEventListener('opencode-toast', handleToast)
    return () => {
      window.removeEventListener('opencode-toast', handleToast)
      if (timer) clearTimeout(timer)
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
    isFindOpen,
    setIsFindOpen,
    isModelRouterOpen,
    setIsModelRouterOpen,
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
      <div className="flex h-full w-full bg-[#0c0d0e] text-[#e6edf3] font-sans antialiased overflow-hidden">
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

        {!isZenMode && (
          <Sidebar
            isOpen={isSidebarOpen}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            groupedSessions={groupedSessions}
            sessions={sessions}
            activeSessionId={activeSessionId}
            unreadSessionIds={unreadSessionIds}
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
            onOpenScheduledTasks={() => setIsScheduledTasksOpen(true)}
            onToggleSidebar={() => toggleSidebar()}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onHistoryBack={handleHistoryBack}
            onHistoryForward={handleHistoryForward}
            messages={messages}
            activeSession={activeSession}
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
            isZenMode ? 'bg-[#090a0c]' : 'bg-[#0c0d0e]'
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
            />
          )}

          {sessionsLoading ? (
            <div className="flex-1 flex items-center justify-center text-zinc-500 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
              <span className="text-xs">Connecting to OpenCode backend...</span>
            </div>
          ) : (
            <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
              {activeSessionId && isArchived(activeSessionId) && (
                <div className="bg-[#1c1a14] border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs text-amber-200/90 shrink-0 z-20 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      {isZh
                        ? '此会话已归档。它已被移出活跃列表，但历史消息与上下文完整保留。发送新消息将自动恢复此会话。'
                        : 'This conversation is archived. It is hidden from active project trees, but all history is preserved. Sending a message will automatically unarchive it.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => unarchiveSession(activeSessionId)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-100 border border-amber-500/40 text-xs font-medium transition-colors cursor-pointer shrink-0 ml-3"
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
          activeDirectory={
            (projects.find((p) => p.id === selectedProjectId)?.worktree &&
              projects.find((p) => p.id === selectedProjectId)?.worktree !== '/' &&
              projects.find((p) => p.id === selectedProjectId)?.worktree) ||
            activeSession?.directory ||
            projects.find((p) => p.worktree && p.worktree !== '/')?.worktree
          }
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
        />

        <ScheduledTasksModal
          isOpen={isScheduledTasksOpen}
          onClose={() => setIsScheduledTasksOpen(false)}
          projects={projects}
          onRunTaskNow={handleRunScheduledTaskNow}
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
              <MapPin className="w-3.5 h-3.5 text-orange-400" />
            )}
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </DiffDrawerProvider>
  )
}
