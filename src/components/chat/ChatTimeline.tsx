import { useEffect, useRef, useState, useCallback } from 'react'
import { AlertTriangle, Play, Sparkles, MessageSquare } from 'lucide-react'
import type { Message, SessionStatusPayload, Session } from '../../types/opencode'
import { MessageBubble } from './MessageBubble'
import { RevertBanner } from './RevertBanner'
import { ConfirmUndoModal, type ConfirmUndoFileDiff } from './ConfirmUndoModal'
import { extractDraftFromMessage } from '../../utils/draft'
import { TimelineQuickJump } from './TimelineQuickJump'
import { SelectionCopyFeedback } from './SelectionCopyFeedback'
import { api } from '../../services/api'
import { findJumpTargetIndex, findNextJumpTargetIndex } from './quick-jump'
import { usePreferences } from '../../utils/preferences'
import { getShortcuts, createDoubleTapTracker, isEditableTarget, matchesShortcut, hasActiveOverlay } from '../../utils/shortcuts'
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
}

function computeClientSideDiffs(messages: Message[], targetMsgId: string): ConfirmUndoFileDiff[] {
  const targetIndex = messages.findIndex((m) => m.info.id === targetMsgId)
  if (targetIndex === -1) return []

  const filesMap = new Map<string, { status?: 'added' | 'deleted' | 'modified'; additions: number; deletions: number }>()

  for (let i = targetIndex; i < messages.length; i++) {
    const msg = messages[i]
    for (const part of msg.parts) {
      if (part.type === 'tool') {
        const toolPart = part as any
        const toolName = String(toolPart.tool || '').toLowerCase()
        const input = toolPart.state?.input || {}
        const filePath = input.path || input.filePath || input.file || toolPart.state?.title
        if (!filePath || typeof filePath !== 'string') continue

        const normPath = filePath.replace(/\\/g, '/').split('/').pop() || filePath

        if (!filesMap.has(normPath)) {
          filesMap.set(normPath, { additions: 0, deletions: 0 })
        }
        const entry = filesMap.get(normPath)!

        if (toolName === 'write' || toolName === 'write_to_file' || toolName === 'create') {
          entry.status = 'added'
        } else if (toolName === 'edit' || toolName === 'replace_file_content' || toolName === 'patch') {
          entry.status = 'modified'
          const adds = Number(input.additions || toolPart.state?.metadata?.additions || 0)
          const dels = Number(input.deletions || toolPart.state?.metadata?.deletions || 0)
          entry.additions += adds
          entry.deletions += dels
        }
      }
    }
  }

  return Array.from(filesMap.entries()).map(([file, data]) => ({
    file,
    status: data.status,
    additions: data.additions,
    deletions: data.deletions,
  }))
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
  onUnrevert,
  onDraftInject,
  isReverting,
  targetMessageId,
  onTargetMessageScrolled,
}: ChatTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isAutoScrollEnabled = useRef(true)
  const { prefs } = usePreferences()

  const [isConfirmUndoOpen, setIsConfirmUndoOpen] = useState(false)
  const [confirmTargetMessageId, setConfirmTargetMessageId] = useState<string | null>(null)
  const [confirmDiffFiles, setConfirmDiffFiles] = useState<ConfirmUndoFileDiff[]>([])
  const [loadingDiff, setLoadingDiff] = useState(false)

  const handleInitiateRevert = useCallback(
    async (messageId: string) => {
      setConfirmTargetMessageId(messageId)
      setIsConfirmUndoOpen(true)
      setLoadingDiff(true)
      setConfirmDiffFiles([])

      try {
        // 1. Try fetching official daemon diff
        if (activeSession?.id) {
          const diffs = await api.getSessionDiff(activeSession.id, messageId).catch(() => [])
          if (Array.isArray(diffs) && diffs.length > 0) {
            const formatted: ConfirmUndoFileDiff[] = diffs.map((d) => ({
              file: d.file.replace(/\\/g, '/').split('/').pop() || d.file,
              status: d.status,
              additions: d.additions || 0,
              deletions: d.deletions || 0,
            }))
            setConfirmDiffFiles(formatted)
            setLoadingDiff(false)
            return
          }
        }

        // 2. Fallback: inspect tool parts in timeline messages
        const clientDiffs = computeClientSideDiffs(messages, messageId)
        setConfirmDiffFiles(clientDiffs)
      } catch (err) {
        console.error('Failed to get diff for revert:', err)
        setConfirmDiffFiles(computeClientSideDiffs(messages, messageId))
      } finally {
        setLoadingDiff(false)
      }
    },
    [activeSession, messages]
  )

  const handleExecuteRevert = useCallback(
    async (mode: RevertMode) => {
      if (!confirmTargetMessageId || !onRevertToMessage) return

      // Pre-populate input with target message draft (for modes that revert conversation)
      const targetMsg = messages.find((m) => m.info.id === confirmTargetMessageId)
      if (targetMsg && onDraftInject && mode !== 'code_only') {
        const draft = extractDraftFromMessage(targetMsg)
        onDraftInject({
          text: draft.text,
          attachments: draft.attachments,
          timestamp: Date.now(),
        })
      }

      const res = await onRevertToMessage(confirmTargetMessageId, { mode })
      if (res?.ok !== false) {
        setIsConfirmUndoOpen(false)
        setConfirmTargetMessageId(null)
      }
    },
    [confirmTargetMessageId, onRevertToMessage, messages, onDraftInject]
  )


  const revertState = activeSession?.revert
  const revertMessageId = revertState?.messageID

  // Find index of the revert boundary message
  const revertIndex = revertMessageId
    ? messages.findIndex((m) => m.info.id === revertMessageId)
    : -1

  // Format revert time if available
  const revertTargetMessage = revertIndex !== -1 ? messages[revertIndex] : null
  const revertTime = revertTargetMessage?.info.time?.created
    ? new Date(revertTargetMessage.info.time.created).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : undefined

  // Track if user scrolled up manually
  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 80
    isAutoScrollEnabled.current = isAtBottom
  }

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
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })

      // Visual pulse indicator
      targetEl.classList.remove('highlight-pulse')
      void targetEl.offsetWidth
      targetEl.classList.add('highlight-pulse')
      setTimeout(() => {
        targetEl?.classList.remove('highlight-pulse')
      }, 1600)
    }
  }, [])

  const handleScrollToNextUserMessage = useCallback(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const userEls = Array.from(
      container.querySelectorAll<HTMLElement>('[data-message-role="user"]')
    )

    if (userEls.length === 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
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
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    const targetEl = userEls[targetIdx]
    if (targetEl) {
      isAutoScrollEnabled.current = false
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })

      // Visual pulse indicator
      targetEl.classList.remove('highlight-pulse')
      void targetEl.offsetWidth
      targetEl.classList.add('highlight-pulse')
      setTimeout(() => {
        targetEl?.classList.remove('highlight-pulse')
      }, 1600)
    }
  }, [])

  const handleScrollToTop = useCallback(() => {
    isAutoScrollEnabled.current = false
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleScrollToAbsoluteBottom = useCallback(() => {
    isAutoScrollEnabled.current = true
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'auto',
      })
    }
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [])

  const handleJumpToUserIndex = useCallback((userIndex: number) => {
    if (!containerRef.current) return
    const container = containerRef.current
    const userEls = Array.from(
      container.querySelectorAll<HTMLElement>('[data-message-role="user"]')
    )
    const targetEl = userEls[userIndex]
    if (targetEl) {
      isAutoScrollEnabled.current = false
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })

      // Visual pulse indicator
      targetEl.classList.remove('highlight-pulse')
      void targetEl.offsetWidth
      targetEl.classList.add('highlight-pulse')
      setTimeout(() => {
        targetEl?.classList.remove('highlight-pulse')
      }, 1600)
    }
  }, [])

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

  useEffect(() => {
    if (isAutoScrollEnabled.current && !targetMessageId) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, sessionStatus, targetMessageId])

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
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
  }, [targetMessageId, messages, onTargetMessageScrolled])

  const suggestions = [
    '列出当前工作区的所有文件结构',
    '检查并优化当前代码模块',
    '运行测试并给出审查意见',
  ]

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
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
        className={`flex-1 overflow-y-auto no-scrollbar transition-colors duration-300 ${
          isZenMode ? 'px-4 sm:px-8 py-8 bg-[#090a0c]' : 'px-2 py-4'
        }`}
      >
      {messages.length === 0 ? (
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
              : 'max-w-4xl'
          } ${isZenMode ? 'space-y-6 pb-36' : 'space-y-4'}`}
        >
          {/* Revert Banner if session is currently reverted */}
          {revertState && onUnrevert && (
            <RevertBanner
              revert={revertState}
              revertTime={revertTime}
              isReverting={isReverting}
              onUnrevert={onUnrevert}
            />
          )}

          {messages.map((msg, idx) => {
            const isRevertPoint = revertIndex !== -1 && idx === revertIndex
            const isReverted = revertIndex !== -1 && idx > revertIndex

            return (
              <MessageBubble
                key={msg.info.id}
                message={msg}
                isZenMode={isZenMode}
                onRevertToMessage={handleInitiateRevert}
                isRevertPoint={isRevertPoint}
                isReverted={isReverted}
                isBusy={sessionStatus.type === 'busy'}
                isReverting={isReverting}
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
      />

      {/* Text Selection Floating Copy & 1s Feedback Popover */}
      <SelectionCopyFeedback containerRef={containerRef} durationMs={1000} />
    </div>
  )
}
