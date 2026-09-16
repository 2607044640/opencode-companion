import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { AlertTriangle, Play, Sparkles, MessageSquare } from 'lucide-react'
import type { Message, SessionStatusPayload, Session } from '../../types/opencode'
import { MessageBubble } from './MessageBubble'
import { ConfirmUndoModal, type ConfirmUndoFileDiff } from './ConfirmUndoModal'
import { extractDraftFromMessage } from '../../utils/draft'
import { TimelineQuickJump } from './TimelineQuickJump'
import { SelectionCopyFeedback } from './SelectionCopyFeedback'
import { FindInPageBar } from './FindInPageBar'
import { api } from '../../services/api'
import { findJumpTargetIndex, findNextJumpTargetIndex } from './quick-jump'
import { usePreferences } from '../../utils/preferences'
import { getShortcuts, createDoubleTapTracker, isEditableTarget, matchesShortcut, hasActiveOverlay } from '../../utils/shortcuts'
import { groupTimelineMessages } from '../../utils/timeline-grouping'
import { computeClientSideDiffs, mergeRevertDiffs } from '../../utils/client-side-diffs'
import type { RevertMode, PromptAttachment } from '../../hooks/useChatStream'

interface ChatTimelineProps {
  messages: Message[]
  sessionStatus: SessionStatusPayload
  error?: string | null
  onRetry: () => void
  onPromptSuggestion?: (text: string) => void
  isZenMode?: boolean
  activeSession?: Session | null
  onRevertToMessage?: (messageId: string, options?: { mode?: RevertMode }) => Promise<any>
  onUnrevert?: () => Promise<any>
  onDraftInject?: (draft: { text: string; attachments?: PromptAttachment[]; timestamp: number }) => void
  isReverting?: boolean
  targetMessageId?: string | null
  onTargetMessageScrolled?: () => void
  isFindOpen?: boolean
  onCloseFind?: () => void
}

export function ChatTimeline({
  messages,
  sessionStatus,
  error,
  onRetry,
  onPromptSuggestion,
  isZenMode,
  activeSession,
  onRevertToMessage,
  onUnrevert: _onUnrevert,
  onDraftInject,
  isReverting,
  targetMessageId,
  onTargetMessageScrolled,
  isFindOpen,
  onCloseFind,
}: ChatTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isAutoScrollEnabled = useRef(true)
  const { prefs } = usePreferences()

  const [isConfirmUndoOpen, setIsConfirmUndoOpen] = useState(false)
  const [confirmTargetMessageId, setConfirmTargetMessageId] = useState<string | null>(null)
  const [confirmDiffFiles, setConfirmDiffFiles] = useState<ConfirmUndoFileDiff[]>([])
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [revertError, setRevertError] = useState<string | null>(null)

  const handleInitiateRevert = useCallback(
    async (messageId: string) => {
      console.log(`[Revert:UI] User initiated revert on message: ${messageId}`)
      setConfirmTargetMessageId(messageId)
      setIsConfirmUndoOpen(true)
      setLoadingDiff(true)
      setConfirmDiffFiles([])
      setRevertError(null)

      try {
        const clientDiffs = computeClientSideDiffs(messages, messageId)
        console.log(`[Revert:UI] Computed client-side diffs:`, clientDiffs)
        let daemonDiffs: ConfirmUndoFileDiff[] = []
        if (activeSession?.id) {
          const diffs = await api.getSessionDiff(activeSession.id, messageId).catch((e) => {
            console.warn('[Revert:UI] daemon getSessionDiff failed (will rely on client diffs):', e)
            return []
          })
          if (Array.isArray(diffs) && diffs.length > 0) {
            daemonDiffs = diffs.map((d) => ({
              file: d.file.replace(/\\/g, '/').split('/').pop() || d.file,
              status: d.status,
              additions: d.additions || 0,
              deletions: d.deletions || 0,
            }))
            console.log(`[Revert:UI] Daemon diffs received:`, daemonDiffs)
          }
        }
        const merged = mergeRevertDiffs(daemonDiffs, clientDiffs)
        console.log(`[Revert:UI] Final merged diffs for modal:`, merged)
        setConfirmDiffFiles(merged)
      } catch (err) {
        console.error('[Revert:UI] Failed to get diff for revert:', err)
        setConfirmDiffFiles(computeClientSideDiffs(messages, messageId))
      } finally {
        setLoadingDiff(false)
      }
    },
    [activeSession, messages]
  )

  const handleExecuteRevert = useCallback(
    async (mode: RevertMode) => {
      if (!confirmTargetMessageId || !onRevertToMessage) {
        console.warn('[Revert:UI] handleExecuteRevert aborted: missing confirmTargetMessageId or onRevertToMessage')
        return
      }

      console.log(`[Revert:UI] Executing revert: targetMsg=${confirmTargetMessageId}, mode=${mode}`)

      // Pre-populate input with target message draft (for modes that revert conversation)
      const targetMsg = messages.find((m) => m.info.id === confirmTargetMessageId)
      if (targetMsg && onDraftInject && mode !== 'code_only') {
        const draft = extractDraftFromMessage(targetMsg)
        console.log(`[Revert:UI] Injected draft text into PromptInput:`, draft.text)
        onDraftInject({
          text: draft.text,
          attachments: draft.attachments,
          timestamp: Date.now(),
        })
      }

      const res = await onRevertToMessage(confirmTargetMessageId, { mode })
      console.log('[Revert:UI] onRevertToMessage completed with result:', res)

      if (res?.ok !== false) {
        console.log(`[Revert:UI] Revert succeeded for message: ${confirmTargetMessageId}`)
        setIsConfirmUndoOpen(false)
        setConfirmTargetMessageId(null)
        setRevertError(null)
      } else {
        const err = res?.error || 'Revert failed'
        console.error(`[Revert:UI] Revert execution failed: ${err}`)
        setRevertError(err)
      }
    },
    [confirmTargetMessageId, onRevertToMessage, messages, onDraftInject]
  )


  const revertState = activeSession?.revert
  const revertMessageId = revertState?.messageID

  const groupedItems = useMemo(
    () => groupTimelineMessages(messages, revertMessageId),
    [messages, revertMessageId]
  )

  // Find index of the revert boundary message
  const revertIndex = revertMessageId
    ? messages.findIndex((m) => m.info.id === revertMessageId)
    : -1

  // Filter out any turns from the revert boundary onwards
  const visibleItems = useMemo(() => {
    if (revertIndex === -1) return groupedItems
    return groupedItems.filter((item) => {
      if (item.type === 'user' || item.type === 'system') {
        return item.index < revertIndex
      }
      return item.messages.every((m) => messages.indexOf(m) < revertIndex)
    })
  }, [groupedItems, revertIndex, messages])


  // Track if user scrolled up manually
  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 80
    isAutoScrollEnabled.current = isAtBottom
  }

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (!containerRef.current) return
    const container = containerRef.current
    if (behavior === 'smooth') {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      })
    } else {
      container.scrollTop = container.scrollHeight
    }
  }, [])

  const scrollElementIntoContainer = useCallback(
    (el: HTMLElement, block: 'start' | 'center' = 'start', behavior: ScrollBehavior = 'smooth') => {
      if (!containerRef.current || !el) return
      const container = containerRef.current
      const containerRect = container.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()

      let targetTop = elRect.top - containerRect.top + container.scrollTop
      if (block === 'center') {
        targetTop -= container.clientHeight / 2 - elRect.height / 2
      } else {
        targetTop -= 16
      }

      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior,
      })
    },
    []
  )

  const handleScrollToRecentUserMessage = useCallback(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const userEls = Array.from(
      container.querySelectorAll<HTMLElement>('[data-message-role="user"]')
    )

    if (userEls.length === 0) {
      container.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    const containerRect = container.getBoundingClientRect()
    const rects = userEls.map((el, index) => {
      const r = el.getBoundingClientRect()
      return { index, top: r.top, bottom: r.bottom }
    })

    const targetIdx = findJumpTargetIndex(containerRect.top, rects)
    if (targetIdx === null) {
      isAutoScrollEnabled.current = false
      container.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    const targetEl = userEls[targetIdx]
    if (targetEl) {
      isAutoScrollEnabled.current = false
      scrollElementIntoContainer(targetEl, 'start', 'smooth')

      // Visual pulse indicator
      targetEl.classList.remove('highlight-pulse')
      void targetEl.offsetWidth
      targetEl.classList.add('highlight-pulse')
      setTimeout(() => {
        targetEl?.classList.remove('highlight-pulse')
      }, 1600)
    }
  }, [scrollElementIntoContainer])

  const handleScrollToNextUserMessage = useCallback(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const userEls = Array.from(
      container.querySelectorAll<HTMLElement>('[data-message-role="user"]')
    )

    if (userEls.length === 0) {
      scrollToBottom('smooth')
      return
    }

    const containerRect = container.getBoundingClientRect()
    const rects = userEls.map((el, index) => {
      const r = el.getBoundingClientRect()
      return { index, top: r.top, bottom: r.bottom }
    })

    const targetIdx = findNextJumpTargetIndex(containerRect.top, rects)
    if (targetIdx === null) {
      // Reached past the last user message, scroll to bottom of chat
      isAutoScrollEnabled.current = true
      scrollToBottom('smooth')
      return
    }

    const targetEl = userEls[targetIdx]
    if (targetEl) {
      isAutoScrollEnabled.current = false
      scrollElementIntoContainer(targetEl, 'start', 'smooth')

      // Visual pulse indicator
      targetEl.classList.remove('highlight-pulse')
      void targetEl.offsetWidth
      targetEl.classList.add('highlight-pulse')
      setTimeout(() => {
        targetEl?.classList.remove('highlight-pulse')
      }, 1600)
    }
  }, [scrollElementIntoContainer, scrollToBottom])

  const handleScrollToTop = useCallback(() => {
    isAutoScrollEnabled.current = false
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleScrollToAbsoluteBottom = useCallback(() => {
    isAutoScrollEnabled.current = true
    scrollToBottom('smooth')
  }, [scrollToBottom])

  const handleJumpToUserIndex = useCallback((userIndex: number) => {
    if (!containerRef.current) return
    const container = containerRef.current
    const userEls = Array.from(
      container.querySelectorAll<HTMLElement>('[data-message-role="user"]')
    )
    const targetEl = userEls[userIndex]
    if (targetEl) {
      isAutoScrollEnabled.current = false
      scrollElementIntoContainer(targetEl, 'start', 'smooth')

      // Visual pulse indicator
      targetEl.classList.remove('highlight-pulse')
      void targetEl.offsetWidth
      targetEl.classList.add('highlight-pulse')
      setTimeout(() => {
        targetEl?.classList.remove('highlight-pulse')
      }, 1600)
    }
  }, [scrollElementIntoContainer])

  // Up/Down keyboard shortcuts listener with double-tap support and Edge Caret Browsing defense
  useEffect(() => {
    const tracker = createDoubleTapTracker()

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Never intercept when user is typing inside an editable field (prompt textarea, input, contenteditable)
      if (isEditableTarget(e.target)) return

      // 2. Never intercept if ConfirmUndoModal is open
      if (isConfirmUndoOpen) return

      // 3. Never intercept if ANY modal, overlay, dialog, drawer, or dropdown is open in the UI
      if (hasActiveOverlay()) return

      // 4. Never intercept if the event target itself is inside any modal or overlay container
      if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"], [aria-modal="true"], .fixed.inset-0, [data-modal]')) {
        return
      }

      const shortcuts = getShortcuts()

      const isUp =
        (e.key === 'ArrowUp' || matchesShortcut(e, shortcuts.jumpToTop) || matchesShortcut(e, shortcuts.prevDialogue)) &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey

      const isDown =
        (e.key === 'ArrowDown' || matchesShortcut(e, shortcuts.jumpToBottom) || matchesShortcut(e, shortcuts.nextDialogue)) &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey

      if (isUp || isDown) {
        // ALWAYS prevent default and stop propagation in capture phase to completely block Edge from Caret Browsing ("浏览文本")
        e.preventDefault()
        e.stopPropagation()

        // Ignore key repeats to avoid rapid fire when holding key
        if (e.repeat) return

        if (isUp) {
          if (tracker.check(e, shortcuts.jumpToTop)) {
            handleScrollToTop()
          } else {
            handleScrollToRecentUserMessage()
          }
        } else if (isDown) {
          if (tracker.check(e, shortcuts.jumpToBottom)) {
            handleScrollToAbsoluteBottom()
          } else {
            handleScrollToNextUserMessage()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      tracker.reset()
    }
  }, [
    isConfirmUndoOpen,
    handleScrollToRecentUserMessage,
    handleScrollToNextUserMessage,
    handleScrollToTop,
    handleScrollToAbsoluteBottom,
  ])

  const currentSessionId = activeSession?.id || null
  const prevSessionIdRef = useRef<string | null>(null)
  const isInitialSessionLoadRef = useRef<boolean>(true)

  useEffect(() => {
    // If switching to a different session
    if (currentSessionId !== prevSessionIdRef.current) {
      prevSessionIdRef.current = currentSessionId
      isInitialSessionLoadRef.current = true
      isAutoScrollEnabled.current = true
    }

    if (!targetMessageId && containerRef.current) {
      if (isInitialSessionLoadRef.current) {
        // Immediate snap to bottom on initial session open — NO disorienting scroll animation!
        if (messages.length > 0) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight
          isInitialSessionLoadRef.current = false
        }
      } else if (isAutoScrollEnabled.current) {
        // Active streaming / ongoing message additions: smooth scroll container
        scrollToBottom('smooth')
      }
    }
  }, [messages, sessionStatus, targetMessageId, currentSessionId, scrollToBottom])

  // Jump to specific message target (e.g. from Cross-Message Full-Text Search hit)
  useEffect(() => {
    if (!targetMessageId || !containerRef.current) return

    const timer = setTimeout(() => {
      if (!containerRef.current) return
      const targetEl =
        containerRef.current.querySelector<HTMLElement>(`[data-message-id="${targetMessageId}"]`) ||
        document.getElementById(`msg_${targetMessageId}`)

      if (targetEl) {
        isAutoScrollEnabled.current = false
        scrollElementIntoContainer(targetEl, 'center', 'smooth')
        targetEl.classList.remove('highlight-pulse')
        void targetEl.offsetWidth
        targetEl.classList.add('highlight-pulse')
        setTimeout(() => {
          targetEl?.classList.remove('highlight-pulse')
        }, 2000)
        onTargetMessageScrolled?.()
      }
    }, 150)

    return () => clearTimeout(timer)
  }, [targetMessageId, messages, onTargetMessageScrolled, scrollElementIntoContainer])

  const suggestions = [
    '列出当前工作区的所有文件结构',
    '检查并优化当前代码模块',
    '运行测试并给出审查意见',
  ]

  return (
    <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* In-Page Find Bar (Ctrl+F) */}
      <FindInPageBar
        isOpen={Boolean(isFindOpen)}
        onClose={onCloseFind || (() => {})}
        messages={messages}
        containerRef={containerRef}
      />

      {/* Floating Right Dialogue Track Navigator Rail (Only icon buttons, long-press enabled, toggleable in settings) */}
      {messages.length > 0 && (prefs.showTimelineQuickJump ?? true) && !isConfirmUndoOpen && (
        <TimelineQuickJump
          containerRef={containerRef}
          messagesCount={messages.length}
          onJumpToRecentUser={handleScrollToRecentUserMessage}
          onJumpToTop={handleScrollToTop}
          onJumpToNextUser={handleScrollToNextUserMessage}
          onJumpToAbsoluteBottom={handleScrollToAbsoluteBottom}
          onJumpToUserIndex={handleJumpToUserIndex}
          isZenMode={isZenMode}
        />
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto no-scrollbar transition-colors duration-300 px-4 sm:px-6 lg:px-8 py-4 ${
          isZenMode ? 'bg-[#090a0c] sm:py-8' : ''
        }`}
      >
      {visibleItems.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 select-none">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-600/20 to-purple-600/20 border border-zinc-800 flex items-center justify-center mb-4 text-orange-400 shadow-inner">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-200 mb-1">OpenCode Companion</h2>
          <p className="text-xs text-zinc-400 max-w-sm mb-6">
            {isZenMode
              ? '当前处于沉浸全屏阅读模式。在此模式下可心无旁骛地与 AI 进行深度阅读与交互。'
              : '独立运行在 Windows 宿主的 OpenCode 伴侣工作台，实时串联 WSL2 守护进程。'}
          </p>

          <div className="flex flex-col sm:flex-row gap-2 max-w-md w-full">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => onPromptSuggestion?.(s)}
                className="flex-1 p-2.5 rounded-lg bg-[#14161a] hover:bg-[#1a1d22] border border-[#24272c] text-left text-xs text-zinc-300 hover:text-white transition-all flex items-center gap-2 group"
              >
                <Sparkles className="w-3.5 h-3.5 text-orange-400 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="truncate">{s}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          className={`mx-auto w-full transition-all duration-300 ${
            prefs.conversationWidth === 'narrow'
              ? 'max-w-2xl'
              : prefs.conversationWidth === 'wide'
              ? 'max-w-6xl'
              : 'max-w-4xl xl:max-w-5xl'
          } ${isZenMode ? 'space-y-6 pb-36' : 'space-y-4'}`}
        >
          {visibleItems.map((item) => {
            if (item.type === 'user' || item.type === 'system') {
              return (
                <MessageBubble
                  key={item.message.info.id}
                  message={item.message}
                  isZenMode={isZenMode}
                  onRevertToMessage={handleInitiateRevert}
                  isBusy={sessionStatus.type === 'busy'}
                  isReverting={isReverting}
                />
              )
            }

            // Assistant Turn (consolidated single bubble and single Worked for card!)
            const bubbleKey =
              item.allMessageIds && item.allMessageIds.length > 0
                ? item.allMessageIds[0]
                : item.primaryMessage.info.id

            return (
              <MessageBubble
                key={bubbleKey}
                message={item.compositeMessage}
                allMessageIds={item.allMessageIds}
                isZenMode={isZenMode}
                onRevertToMessage={handleInitiateRevert}
                isBusy={sessionStatus.type === 'busy'}
                isReverting={isReverting}
                onRetry={onRetry}
              />
            )
          })}

          {/* Error / Retry Banner (Exact Replicate of Image 1) */}
          {(sessionStatus.type === 'retry' || Boolean(error)) && (
            <div className="max-w-4xl mx-auto my-4 px-4">
              <div className="relative overflow-hidden rounded-lg bg-[#1a1315] border border-rose-900/40 p-3.5 flex items-center justify-between gap-4 shadow-md">
                {/* Red Left Accent Indicator (from Image 1) */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-600" />

                <div className="flex items-center gap-3 pl-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <div className="text-xs text-rose-200">
                    <span className="font-medium">
                      {error || sessionStatus.message || "An error occurred during generation. Please try again."}
                    </span>
                    {sessionStatus.attempt ? (
                      <span className="text-rose-400/80 ml-2 font-mono text-[11px]">
                        (Attempt {sessionStatus.attempt})
                      </span>
                    ) : null}
                  </div>
                </div>

                <button
                  onClick={onRetry}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  <Play className="w-3 h-3" />
                  <span>重试 / 继续</span>
                </button>
              </div>
            </div>
          )}

          <div ref={bottomRef} className={isZenMode ? 'h-6' : 'h-2'} />
        </div>
      )}
      </div>

      {/* Official OpenCode Confirm Undo Modal */}
      <ConfirmUndoModal
        isOpen={isConfirmUndoOpen}
        onClose={() => {
          if (!isReverting) {
            setIsConfirmUndoOpen(false)
            setConfirmTargetMessageId(null)
            setRevertError(null)
          }
        }}
        onConfirm={handleExecuteRevert}
        targetMessageId={confirmTargetMessageId || undefined}
        targetMessageTime={
          confirmTargetMessageId
            ? messages.find((m) => m.info.id === confirmTargetMessageId)?.info.time?.created
              ? new Date(
                  messages.find((m) => m.info.id === confirmTargetMessageId)!.info.time!.created!
                ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : undefined
            : undefined
        }
        files={confirmDiffFiles}
        loading={loadingDiff}
        isReverting={isReverting}
        error={revertError}
      />

      {/* Text Selection Floating Copy & 1s Feedback Popover */}
      <SelectionCopyFeedback
        containerRef={containerRef}
        durationMs={1000}
        sessionId={activeSession?.id}
      />
    </div>
  )
}
