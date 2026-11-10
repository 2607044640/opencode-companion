import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { AlertTriangle, Sparkles, MessageSquare, Loader2, Cpu, RotateCcw, ArrowDown, Folder, FolderPlus, FolderX, Check } from 'lucide-react'
import type { Message, SessionStatusPayload, Session, Project } from '../../types/opencode'
import { MessageBubble, getAgentBadge } from './MessageBubble'
import { NewProjectModal } from './NewProjectModal'
import { ConfirmUndoModal, type ConfirmUndoFileDiff } from './ConfirmUndoModal'
import { extractDraftFromMessage } from '../../utils/draft'
import { TimelineQuickJump } from './TimelineQuickJump'
import { TimelineZoomWidget } from './TimelineZoomWidget'
import { SelectionCopyFeedback } from './SelectionCopyFeedback'
import { FindInPageBar } from './FindInPageBar'
import { api } from '../../services/api'
import { findJumpTargetIndex, findNextJumpTargetIndex } from './quick-jump'
import { usePreferences } from '../../utils/preferences'
import { useTimelineZoom } from '../../utils/timeline-zoom'
import { getShortcuts, createDoubleTapTracker, isEditableTarget, matchesShortcut, hasActiveOverlay } from '../../utils/shortcuts'
import { groupTimelineMessages } from '../../utils/timeline-grouping'
import { isPendingSession } from '../../utils/session-workspace'
import { computeClientSideDiffs, mergeRevertDiffs } from '../../utils/client-side-diffs'
import { isAbortError } from '../../services/api'
import { useI18n } from '../../utils/i18n'
import { findCenterDialogueElement } from '../../utils/center-dialogue-finder'
import type { RevertMode, PromptAttachment, AutoRecoveryState } from '../../hooks/useChatStream'

interface GeneratingBubbleProps {
  agent?: string
  modelID?: string
  isZenMode?: boolean
}

function GeneratingBubble({ agent, modelID, isZenMode }: GeneratingBubbleProps) {
  const { tr } = useI18n()
  const badge = getAgentBadge(agent)
  const modelName = modelID || ''

  return (
    <div
      data-message-role="assistant-generating"
      className="w-full max-w-3xl mr-auto my-4 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div
        className={`w-full rounded-2xl border border-zinc-800 bg-[#161722]/95 shadow-xl backdrop-blur-sm transition-all ${
          isZenMode ? 'p-5' : 'p-4'
        }`}
      >
        {/* Header: Agent badge, Model badge, Generating badge */}
        <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[#242436] text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <div
              className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${badge.bg}`}
              title={`Agent: ${badge.label}`}
            >
              {badge.initial}
            </div>
            {modelName && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 select-none">
                <Cpu className="w-2.5 h-2.5 text-zinc-500" />
                <span>{modelName}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-950/60 border border-sky-600/50 text-[11px] text-sky-200 font-medium animate-pulse shadow-sm shadow-sky-900/30">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
            <span>{tr('生成中…', 'Generating…', 'Generieren…')}</span>
          </div>
        </div>

        {/* Prominent Generating Body */}
        <div className="py-3 px-3.5 rounded-lg bg-[#13141c] border border-zinc-800/80 flex items-center gap-3.5 shadow-inner">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800/90 border border-zinc-700/60 shrink-0 text-sky-400 shadow-sm">
            <Sparkles className="w-4 h-4 text-sky-400 animate-pulse" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-100">
                {tr('正在思考与生成回复', 'Thinking & Generating Response', 'Denkt nach und generiert Antwort')}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 truncate">
              {tr(
                '模型正在解析对话上下文并准备输出方案…',
                'Analyzing dialogue context and preparing solution…',
                'Analysiert Dialogkontext und bereitet Lösung vor…'
              )}
            </p>
          </div>
        </div>

        {/* Breathing glowing gradient line */}
        <div className="w-full h-0.5 mt-3 rounded-full bg-gradient-to-r from-sky-500/10 via-sky-400/50 to-sky-500/10 animate-pulse" />
      </div>
    </div>
  )
}

interface ChatTimelineProps {
  messages: Message[]
  sessionStatus: SessionStatusPayload
  /** False until the daemon answers. Hide finished, retry, and error chrome. */
  runKnown?: boolean
  error?: string | null
  autoRecoveryState?: AutoRecoveryState | null
  isErrorTerminal?: boolean
  onRetry: () => void
  onPromptSuggestion?: (text: string) => void
  isZenMode?: boolean
  activeSession?: Session | null
  onRevertToMessage?: (messageId: string, options?: { mode?: RevertMode }) => Promise<any>
  onUnrevert?: () => Promise<any>
  onDraftInject?: (draft: { text: string; attachments?: PromptAttachment[]; timestamp: number }) => void
  onQuote?: (text: string) => void
  isReverting?: boolean
  targetMessageId?: string | null
  onTargetMessageScrolled?: () => void
  isFindOpen?: boolean
  onCloseFind?: () => void
  /** True while the active session transcript is still arriving. */
  messagesLoading?: boolean
  projects?: Project[]
  selectedProjectId?: string | null
  onSelectProject?: (projectId: string | null) => void
  onNewProject?: (name: string, path: string) => Promise<void> | void
}

export function ChatTimeline({
  messages,
  sessionStatus,
  runKnown = true,
  error,
  autoRecoveryState = null,
  isErrorTerminal = false,
  onRetry,
  onPromptSuggestion,
  isZenMode,
  activeSession,
  onRevertToMessage,
  onUnrevert: _onUnrevert,
  onDraftInject,
  onQuote,
  isReverting,
  targetMessageId,
  onTargetMessageScrolled,
  isFindOpen,
  onCloseFind,
  messagesLoading = false,
  projects = [],
  selectedProjectId = null,
  onSelectProject,
  onNewProject,
}: ChatTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isAutoScrollEnabled = useRef(true)
  const lastTargetIndexRef = useRef<number | null>(null)
  const lastTargetTimeRef = useRef<number>(0)
  const { prefs } = usePreferences()
  const { isZh } = useI18n()
  const { zoomLevel, zoomIn, zoomOut, resetZoom } = useTimelineZoom()
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false)

  const orderedProjects = useMemo(() => {
    const canonicalOrder = ['APISpace', 'ObsidianNote', 'ObsidianDev', 'AISpace']
    const canonicalList: Project[] = []
    const others: Project[] = []

    for (const name of canonicalOrder) {
      const found = projects.find(
        (p) =>
          p.name?.toLowerCase() === name.toLowerCase() ||
          p.worktree?.toLowerCase().endsWith(name.toLowerCase())
      )
      if (found) {
        canonicalList.push(found)
      } else {
        canonicalList.push({
          id: name.toLowerCase(),
          name,
          worktree: name === 'AISpace' ? 'C:\\Godot\\AISpace' : `C:\\${name}`,
        } as Project)
      }
    }

    for (const p of projects) {
      if (p.id === 'global' || p.worktree === '/') continue
      const pName = (p.name || '').toLowerCase()
      const pWorktree = (p.worktree || '').toLowerCase()
      if (pName === 'aicore' || pWorktree.endsWith('/aicore') || pWorktree === 'c:/aicore') continue
      if (!canonicalList.some((cp) => cp.id === p.id || cp.name?.toLowerCase() === pName)) {
        others.push(p)
      }
    }
    return [...canonicalList, ...others]
  }, [projects])

  // Ctrl + Wheel: smoothly scale conversation font zoom level (only when timeline zoom widget is enabled)
  useEffect(() => {
    if (!prefs.showTimelineZoomWidget) return
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      if (e.deltaY < 0) {
        zoomIn()
      } else if (e.deltaY > 0) {
        zoomOut()
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [zoomIn, zoomOut, prefs.showTimelineZoomWidget])

  // Mouse upper side button & shortcut: toggle dialogue block at screen center
  useEffect(() => {
    let lastTriggerTime = 0

    const triggerToggleCenter = () => {
      const now = Date.now()
      if (now - lastTriggerTime < 150) return
      lastTriggerTime = now

      if (hasActiveOverlay()) return
      if (!containerRef.current) return

      const match = findCenterDialogueElement(containerRef.current)
      if (!match) return

      if (match.isCollapsible) {
        window.dispatchEvent(
          new CustomEvent('opencode-toggle-dialogue', {
            detail: { messageId: match.messageId },
          })
        )

        // Visual pulse indicator on the toggled dialogue block
        match.element.classList.remove('highlight-pulse')
        void match.element.offsetWidth
        match.element.classList.add('highlight-pulse')
        setTimeout(() => {
          match.element?.classList.remove('highlight-pulse')
        }, 1200)
      }
    }

    const handleShortcutToggle = () => {
      triggerToggleCenter()
    }

    window.addEventListener('opencode-toggle-center-dialogue', handleShortcutToggle)

    return () => {
      window.removeEventListener('opencode-toggle-center-dialogue', handleShortcutToggle)
    }
  }, [isZh])

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

  const isLastItemUser =
    visibleItems.length > 0 &&
    (visibleItems[visibleItems.length - 1].type === 'user' ||
      visibleItems[visibleItems.length - 1].type === 'system')

  const running = runKnown && (sessionStatus.type === 'busy' || sessionStatus.type === 'retry')
  const showGeneratingCard =
    running && sessionStatus.type === 'busy' && isLastItemUser

  const lastUserMsg = messages.length > 0 ? messages[messages.length - 1] : null
  const latestUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].info.role === 'user') return messages[i]
    }
    return null
  }, [messages])
  const targetAgent = lastUserMsg?.info?.agent || activeSession?.agent || 'build'
  const targetModelId = lastUserMsg?.info?.modelID || activeSession?.model?.id || ''
  const [showScrollBottom, setShowScrollBottom] = useState(false)

  // Track if user scrolled up manually
  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 80
    isAutoScrollEnabled.current = isAtBottom
    setShowScrollBottom(!isAtBottom && scrollHeight > clientHeight + 100)
  }

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    setShowScrollBottom(false)
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
      isAutoScrollEnabled.current = false
      if (container.scrollTop > 0) {
        container.scrollTo({ top: 0, behavior: 'smooth' })
      }
      return
    }

    const now = Date.now()
    const containerRect = container.getBoundingClientRect()
    const rects = userEls.map((el, index) => {
      const r = el.getBoundingClientRect()
      return { index, top: r.top, bottom: r.bottom }
    })

    let targetIdx = findJumpTargetIndex(containerRect.top, rects)

    // Monotonically step back if rapid clicks occurred during smooth-scroll animation
    if (
      lastTargetIndexRef.current !== null &&
      now - lastTargetTimeRef.current < 750 &&
      lastTargetIndexRef.current > 0
    ) {
      targetIdx = lastTargetIndexRef.current - 1
    }

    if (targetIdx === null) {
      isAutoScrollEnabled.current = false
      if (container.scrollTop > 30) {
        container.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        container.scrollBy({ top: -Math.min(250, container.clientHeight * 0.4), behavior: 'smooth' })
      }
      lastTargetIndexRef.current = null
      return
    }

    lastTargetIndexRef.current = targetIdx
    lastTargetTimeRef.current = now

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

    const now = Date.now()
    const containerRect = container.getBoundingClientRect()
    const rects = userEls.map((el, index) => {
      const r = el.getBoundingClientRect()
      return { index, top: r.top, bottom: r.bottom }
    })

    let targetIdx = findNextJumpTargetIndex(containerRect.top, rects)

    // Monotonically step forward if rapid clicks occurred during smooth-scroll animation
    if (
      lastTargetIndexRef.current !== null &&
      now - lastTargetTimeRef.current < 750 &&
      lastTargetIndexRef.current < userEls.length - 1
    ) {
      targetIdx = lastTargetIndexRef.current + 1
    }

    if (targetIdx === null) {
      // Reached past the last user message: scroll through remaining response content or snap to bottom
      const remainingScroll = container.scrollHeight - container.scrollTop - container.clientHeight
      if (remainingScroll > 40) {
        container.scrollBy({ top: Math.min(300, remainingScroll), behavior: 'smooth' })
      } else {
        isAutoScrollEnabled.current = true
        scrollToBottom('smooth')
      }
      lastTargetIndexRef.current = null
      return
    }

    lastTargetIndexRef.current = targetIdx
    lastTargetTimeRef.current = now

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
    lastTargetIndexRef.current = 0
    lastTargetTimeRef.current = Date.now()
    isAutoScrollEnabled.current = false
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleScrollToAbsoluteBottom = useCallback(() => {
    lastTargetIndexRef.current = null
    lastTargetTimeRef.current = Date.now()
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
      lastTargetIndexRef.current = userIndex
      lastTargetTimeRef.current = Date.now()
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

  // Re-anchor to bottom when revert boundaries change or visible count adjusts
  const prevRevertMessageIdRef = useRef<string | null>(revertMessageId || null)
  useEffect(() => {
    if (revertMessageId !== prevRevertMessageIdRef.current) {
      prevRevertMessageIdRef.current = revertMessageId || null
      if (containerRef.current) {
        isAutoScrollEnabled.current = true
        scrollToBottom('smooth')
      }
    }
  }, [revertMessageId, scrollToBottom])

  // Adapt scroll position when SessionRevertDock expands or collapses
  useEffect(() => {
    const handleDockResize = () => {
      if (!containerRef.current) return
      requestAnimationFrame(() => {
        if (!containerRef.current) return
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 250 || isAutoScrollEnabled.current
        if (isNearBottom) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight
        }
      })
    }
    window.addEventListener('session-dock-resized', handleDockResize)
    return () => window.removeEventListener('session-dock-resized', handleDockResize)
  }, [])

  // Container resize observer: seamlessly adapt scroll when container height changes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      if (isAutoScrollEnabled.current) {
        container.scrollTop = container.scrollHeight
      }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

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

      {/* Floating Timeline Font Zoom Controller Widget */}
      {!isConfirmUndoOpen && Boolean(prefs.showTimelineZoomWidget) && (
        <div className={`absolute z-30 pointer-events-none ${isZenMode ? 'bottom-5 right-8' : 'bottom-3 right-8'}`}>
          <TimelineZoomWidget
            zoomLevel={zoomLevel}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onResetZoom={resetZoom}
            isZenMode={isZenMode}
          />
        </div>
      )}

      <div
        ref={containerRef}
        data-chat-timeline-container="true"
        onScroll={handleScroll}
        className={`relative flex-1 overflow-y-auto no-scrollbar transition-colors duration-300 px-4 sm:px-6 lg:px-8 py-4 ${
          isZenMode ? 'bg-[#090a0c] sm:py-8' : ''
        }`}
      >
      {visibleItems.length === 0 &&
      !error &&
      (messagesLoading || isPendingSession(activeSession)) ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 select-none">
          {/* Centered Icon with Spinning Ring Animation (转圈动画) */}
          <div className="relative w-16 h-16 flex items-center justify-center mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-zinc-700/60 border-t-sky-400 animate-spin" />
            <div
              className="absolute inset-1.5 rounded-full border border-zinc-700/40 border-b-sky-300/70 animate-spin"
              style={{ animationDirection: 'reverse', animationDuration: '1.6s' }}
            />
            <div className="w-11 h-11 rounded-2xl bg-zinc-800/90 border border-zinc-700/70 flex items-center justify-center text-zinc-200 shadow-inner">
              <MessageSquare className="w-5 h-5 animate-pulse" />
            </div>
          </div>

          <h2 className="text-lg font-semibold text-zinc-200 mb-1">OpenCode Companion</h2>
          <p className="text-xs text-zinc-400 max-w-sm mb-4">
            {activeSession?.title
              ? `正在加载「${activeSession.title}」的对话记录…`
              : '正在加载会话对话记录…'}
          </p>

          {/* Three Floating / Bouncing Dots Animation (三个点上下浮动等待) */}
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#14161a] border border-[#24272c] shadow-sm">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
            <span className="text-xs text-zinc-300 font-medium">正在加载对话</span>
            <span className="inline-flex items-center gap-1 ml-0.5">
              <span
                className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce"
                style={{ animationDelay: '0ms', animationDuration: '0.9s' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce"
                style={{ animationDelay: '160ms', animationDuration: '0.9s' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce"
                style={{ animationDelay: '320ms', animationDuration: '0.9s' }}
              />
            </span>
          </div>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-200">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-base font-semibold text-zinc-100 tracking-wide">
              {isZh ? '选择本次会话工作区' : 'Select Workspace'}
            </h2>
            <p className="text-xs text-zinc-500 mt-1 max-w-md">
              {isZh
                ? '点击卡片切换目标项目，发送首条消息时正式在此工作区创建会话'
                : 'Choose a workspace below. Your session will be created once you send the first prompt.'}
            </p>
          </div>

          {/* Canonical Workspace Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mb-4">
            {orderedProjects.map((proj) => {
              const pName = proj.name || proj.id
              const isSelected = selectedProjectId
                ? proj.id === selectedProjectId ||
                  proj.name?.toLowerCase() === selectedProjectId.toLowerCase() ||
                  Boolean(proj.associatedIds?.includes(selectedProjectId))
                : pName.toLowerCase() === 'apispace' || pName.toLowerCase() === 'aispace'

              return (
                <button
                  type="button"
                  key={proj.id}
                  onClick={() => onSelectProject?.(proj.id)}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-sky-500/10 border-sky-500/60 shadow-lg shadow-sky-950/20 ring-1 ring-sky-500/30'
                      : 'bg-[#151722]/90 border-[#242636] hover:bg-[#1c1f2e] hover:border-zinc-700'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-sky-500/20 text-sky-400'
                        : 'bg-zinc-800/80 text-zinc-400 group-hover:text-zinc-200'
                    }`}
                  >
                    <Folder className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold truncate ${isSelected ? 'text-sky-300' : 'text-zinc-200'}`}>
                        {pName}
                      </span>
                      {isSelected && (
                        <span className="flex items-center gap-1 text-[11px] text-sky-400 font-mono font-medium">
                          <Check className="w-3.5 h-3.5" />
                          <span>{isZh ? '当前' : 'Active'}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 truncate mt-0.5 font-mono">
                      {proj.worktree || `C:\\${pName}`}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Action Row: New Project, Quick Start, No Project */}
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg w-full pt-1">
            <button
              type="button"
              onClick={() => setIsNewProjectOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181824] hover:bg-[#202030] border border-[#262638] hover:border-zinc-700 text-xs text-zinc-300 hover:text-white transition-all cursor-pointer shadow-xs"
            >
              <FolderPlus className="w-3.5 h-3.5 text-sky-400" />
              <span>{isZh ? '新建项目' : 'New Project'}</span>
            </button>
            <button
              type="button"
              onClick={() => onPromptSuggestion?.('快速分析当前代码库与架构')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181824] hover:bg-[#202030] border border-[#262638] hover:border-zinc-700 text-xs text-zinc-300 hover:text-white transition-all cursor-pointer shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{isZh ? '快速开始' : 'Quick Start'}</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectProject?.(null)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all cursor-pointer shadow-xs ${
                !selectedProjectId
                  ? 'bg-zinc-800 text-zinc-200 border-zinc-600'
                  : 'bg-[#181824] hover:bg-[#202030] border-[#262638] hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FolderX className="w-3.5 h-3.5 text-zinc-400" />
              <span>{isZh ? '无特定项目' : 'No Project'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            zoom: prefs.showTimelineZoomWidget && zoomLevel !== 100 ? `${zoomLevel}%` : undefined,
          }}
          className={`mx-auto w-full min-h-full flex flex-col transition-all duration-300 ${
            prefs.conversationWidth === 'narrow'
              ? 'max-w-2xl'
              : prefs.conversationWidth === 'wide'
              ? 'max-w-6xl'
              : 'max-w-4xl xl:max-w-5xl'
          } ${isZenMode ? 'space-y-6 pb-36' : 'space-y-4'}`}
        >
          {/* Top adaptive spacer: absorbs free vertical space when messages are fewer than viewport height */}
          <div className="flex-1 min-h-0" />

          {visibleItems.map((item, idx) => {
            const isLastVisibleItem = idx === visibleItems.length - 1
            if (item.type === 'user' || item.type === 'system') {
              return (
                <MessageBubble
                  key={item.message.info.id}
                  message={item.message}
                  isZenMode={isZenMode}
                  sessionDirectory={activeSession?.directory}
                  onRevertToMessage={handleInitiateRevert}
                  isBusy={running}
                  runKnown={runKnown}
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
                sessionDirectory={activeSession?.directory}
                onRevertToMessage={handleInitiateRevert}
                isBusy={running}
                runKnown={runKnown}
                isReverting={isReverting}
                onRetry={onRetry}
                showTerminalError={isLastVisibleItem && Boolean(isErrorTerminal)}
              />
            )
          })}

          {/* Prominent Model Dialogue Generating Card: Placed directly underneath the user prompt on the left side */}
          {showGeneratingCard && (
            <GeneratingBubble
              agent={targetAgent}
              modelID={targetModelId}
              isZenMode={isZenMode}
            />
          )}

          {/* Non-Destructive Automatic Recovery Status Indicator (Attempt <= 5) */}
          {runKnown &&
            !isErrorTerminal &&
            (Boolean(autoRecoveryState) || sessionStatus.type === 'retry') && (
              <div className="max-w-4xl mx-auto my-3 px-4">
                <div className="rounded-lg bg-[#14171d] border border-sky-800/40 p-3 flex items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />
                    <span className="text-xs text-zinc-300 font-medium">
                      {autoRecoveryState?.mode === 'retry' ||
                      (!autoRecoveryState && sessionStatus.type === 'retry')
                        ? `正在自动重试当前轮次 (第 ${autoRecoveryState?.attempt || sessionStatus.attempt || 1}/${autoRecoveryState?.max || 5} 次)…`
                        : `连接波动，正在自动发送 go on 继续生成 (第 ${autoRecoveryState?.attempt || 1}/${autoRecoveryState?.max || 5} 次)…`}
                    </span>
                  </div>
                </div>
              </div>
            )}

          {/* Terminal Error Banner (Only shown after 5 automatic recovery attempts fail or on fatal non-retryable error; never exposes a destructive retry button) */}
          {runKnown && isErrorTerminal && Boolean(error) && !isAbortError(error) && (
            <div className="max-w-4xl mx-auto my-4 px-4">
              <div className="relative overflow-hidden rounded-lg bg-[#1a1315] border border-rose-900/40 p-3.5 flex items-center justify-between gap-4 shadow-md">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-600" />

                <div className="flex items-center gap-3 pl-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <div className="text-xs text-rose-200">
                    <span className="font-medium">{error}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {latestUserMessage && onRevertToMessage && (
                    <button
                      onClick={() => handleInitiateRevert(latestUserMessage.info.id)}
                      disabled={isReverting}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5 shadow-sm border border-zinc-700 disabled:opacity-50"
                      title="撤回此轮提示词与更改"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>撤回此轮</span>
                    </button>
                  )}
                </div>
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

      {/* Floating Scroll to Bottom Button (Antigravity Style: Centered circular button with down arrow) */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => {
            isAutoScrollEnabled.current = true
            scrollToBottom('smooth')
          }}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 w-8 h-8 rounded-full bg-[#181824]/90 hover:bg-[#242438] border border-[#2e2e46] text-zinc-300 hover:text-white flex items-center justify-center shadow-2xl cursor-pointer transition-all active:scale-90 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
          title="滚动到底部"
          aria-label="滚动到底部"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Text Selection Floating Copy & 1s Feedback Popover */}
      <SelectionCopyFeedback
        containerRef={containerRef}
        durationMs={1000}
        sessionId={activeSession?.id}
        onQuote={onQuote}
      />

      {/* New Project Modal on Timeline */}
      <NewProjectModal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        onConfirm={async (name, path) => {
          if (onNewProject) {
            await onNewProject(name, path)
          }
          setIsNewProjectOpen(false)
        }}
      />
    </div>
  )
}
