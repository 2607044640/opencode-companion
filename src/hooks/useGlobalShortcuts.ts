import { useState, useEffect, useCallback, useRef } from 'react'
import { getShortcuts, matchesShortcut, type ShortcutsMap } from '../utils/shortcuts'
import { getNextTabId, getPrevTabId, getTabIdByIndex } from '../utils/tab-navigation'
import { togglePinSessionId } from '../utils/pinning'
import { zoomIn, zoomOut, resetZoom } from '../utils/timeline-zoom'
import { getPreferences } from '../utils/preferences'
import { isValidTextSelection } from '../components/chat/selection-copy'
import { toggleAllDialogues } from '../utils/dialogue-collapse-cache'

export interface UseGlobalShortcutsParams {
  activeSessionId: string | null
  openTabIds: string[]
  isSettingsOpen: boolean
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>
  isMapOpen: boolean
  setIsMapOpen: React.Dispatch<React.SetStateAction<boolean>>
  setMapTargetSessionId: React.Dispatch<React.SetStateAction<string | null>>
  isSearchOpen: boolean
  setIsSearchOpen: React.Dispatch<React.SetStateAction<boolean>>
  isSessionBoardOpen: boolean
  setIsSessionBoardOpen: React.Dispatch<React.SetStateAction<boolean>>
  isFindOpen: boolean
  setIsFindOpen: React.Dispatch<React.SetStateAction<boolean>>
  isModelRouterOpen: boolean
  setIsModelRouterOpen: React.Dispatch<React.SetStateAction<boolean>>
  isBackgroundTasksOpen?: boolean
  setIsBackgroundTasksOpen?: React.Dispatch<React.SetStateAction<boolean>>
  setIsSubagentTopologyOpen?: React.Dispatch<React.SetStateAction<boolean>>
  handleNewSession: (directory?: string) => void
  toggleSidebar: (force?: boolean) => void
  toggleHeader: (force?: boolean) => void
  closeTab: (sessionId?: string) => void
  reopenClosedTab: () => void
  selectSession: (sessionId: string) => void
  handleAddSessionToMap: (sessionId: string) => void
  handleOpenMapAndLocate: (sessionId?: string | null) => void
  onHistoryBack?: () => void
  onHistoryForward?: () => void
}

export function useGlobalShortcuts({
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
  onHistoryBack,
  onHistoryForward,
}: UseGlobalShortcutsParams) {
  const [isZenMode, setIsZenMode] = useState(false)
  const [shortcuts, setShortcuts] = useState<ShortcutsMap>(() => getShortcuts())

  const openTabIdsRef = useRef(openTabIds)
  useEffect(() => {
    openTabIdsRef.current = openTabIds
  }, [openTabIds])

  const activeSessionIdRef = useRef(activeSessionId)
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  const isZenModeRef = useRef(isZenMode)
  useEffect(() => {
    isZenModeRef.current = isZenMode
  }, [isZenMode])

  const onHistoryBackRef = useRef(onHistoryBack)
  useEffect(() => {
    onHistoryBackRef.current = onHistoryBack
  }, [onHistoryBack])

  const onHistoryForwardRef = useRef(onHistoryForward)
  useEffect(() => {
    onHistoryForwardRef.current = onHistoryForward
  }, [onHistoryForward])

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

  const toggleZenMode = useCallback((targetState?: boolean) => {
    const next = typeof targetState === 'boolean' ? targetState : !isZenModeRef.current
    if (next) {
      if (!document.fullscreenElement && document.documentElement?.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {})
      }
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
      }
    }
    setIsZenMode(next)
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isZenModeRef.current) {
        setIsZenMode(false)
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return
      if (matchesShortcut(e, shortcuts.toggleSessionBoard)) {
        e.preventDefault()
        e.stopPropagation()
        setIsSessionBoardOpen(prev => !prev)
        return
      }
      // The board owns its keyboard, including Escape, editing and focus trapping.
      if (isSessionBoardOpen) return

      // Quote shortcut (Ctrl+L): quotes selected text into input composer, or focuses composer if nothing selected
      if (matchesShortcut(e, shortcuts.quoteSelection)) {
        e.preventDefault()
        e.stopPropagation()
        const sel = window.getSelection()
        const selText = sel?.toString().trim()
        if (selText && isValidTextSelection(selText, document.activeElement)) {
          window.dispatchEvent(
            new CustomEvent('companion:quote-selection', {
              detail: { text: selText },
            })
          )
        } else {
          const textarea = document.querySelector('textarea') as HTMLTextAreaElement | null
          if (textarea) {
            textarea.focus()
          }
        }
        return
      }

      const isPlainF11 = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key === 'F11'
      if (matchesShortcut(e, shortcuts.zenMode) || isPlainF11) {
        e.preventDefault()
        toggleZenMode()
        return
      }

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
        if (isModelRouterOpen) {
          e.preventDefault()
          setIsModelRouterOpen(false)
          return
        }
        if (isZenMode) {
          e.preventDefault()
          toggleZenMode(false)
          return
        }
      }

      const isCtrlShiftB =
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        e.shiftKey &&
        ((e.key && e.key.toLowerCase() === 'b') || e.code === 'KeyB' || e.keyCode === 66)

      if (!isZenMode && isCtrlShiftB) {
        e.preventDefault()
        e.stopPropagation()
        toggleHeader()
        return
      }

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

      const isTabKey = e.key === 'Tab' || e.code === 'Tab' || e.keyCode === 9
      const isCtrlTab = (e.ctrlKey || e.metaKey) && !e.altKey && isTabKey
      const isCtrlPageDown = (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'PageDown' || e.code === 'PageDown')
      const isCtrlPageUp = (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'PageUp' || e.code === 'PageUp')

      // Conversation Navigation History: Alt + Left/Right Arrow
      const isAltLeft =
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        (e.key === 'ArrowLeft' || e.code === 'ArrowLeft')

      if (isAltLeft || (shortcuts.historyBack && matchesShortcut(e, shortcuts.historyBack))) {
        e.preventDefault()
        e.stopPropagation()
        if (onHistoryBackRef.current) {
          onHistoryBackRef.current()
        } else {
          window.dispatchEvent(new CustomEvent('opencode-history-back'))
        }
        return
      }

      const isAltRight =
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        (e.key === 'ArrowRight' || e.code === 'ArrowRight')

      if (isAltRight || (shortcuts.historyForward && matchesShortcut(e, shortcuts.historyForward))) {
        e.preventDefault()
        e.stopPropagation()
        if (onHistoryForwardRef.current) {
          onHistoryForwardRef.current()
        } else {
          window.dispatchEvent(new CustomEvent('opencode-history-forward'))
        }
        return
      }

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

      const isCtrlShift3 =
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        !e.altKey &&
        (e.key === '3' || e.code === 'Digit3' || e.keyCode === 51)

      if (isCtrlShift3 || matchesShortcut(e, shortcuts.openModelRouter)) {
        e.preventDefault()
        e.stopPropagation()
        setIsModelRouterOpen((prev) => !prev)
        return
      }

      const isCtrlShiftO =
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        !e.altKey &&
        ((e.key && e.key.toLowerCase() === 'o') || e.code === 'KeyO' || e.keyCode === 79)

      if (isCtrlShiftO || (shortcuts.expandAllConversations && matchesShortcut(e, shortcuts.expandAllConversations))) {
        e.preventDefault()
        e.stopPropagation()
        window.dispatchEvent(new CustomEvent('opencode-expand-all-dialogues'))
        return
      }

      const isCtrlShiftC =
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        !e.altKey &&
        ((e.key && e.key.toLowerCase() === 'c') || e.code === 'KeyC' || e.keyCode === 67)

      if (isCtrlShiftC || (shortcuts.collapseAllConversations && matchesShortcut(e, shortcuts.collapseAllConversations))) {
        e.preventDefault()
        e.stopPropagation()
        toggleAllDialogues()
        return
      }

      const isCtrlShiftD =
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        !e.altKey &&
        ((e.key && e.key.toLowerCase() === 'd') || e.code === 'KeyD' || e.keyCode === 68)

      if (isCtrlShiftD || (shortcuts.toggleCenterDialogue && matchesShortcut(e, shortcuts.toggleCenterDialogue))) {
        e.preventDefault()
        e.stopPropagation()
        window.dispatchEvent(new CustomEvent('opencode-toggle-center-dialogue'))
        return
      }

      // Block browser native Print dialog (Ctrl+P / Ctrl+Shift+P) & Toggle Pin for Ctrl+Shift+P
      const isCtrlP =
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        ((e.key && e.key.toLowerCase() === 'p') || e.code === 'KeyP' || e.keyCode === 80)

      if (isCtrlP) {
        e.preventDefault()
        e.stopPropagation()

        if (e.shiftKey || (shortcuts.togglePinSession && matchesShortcut(e, shortcuts.togglePinSession))) {
          const currentId = activeSessionIdRef.current
          if (currentId) {
            const res = togglePinSessionId(currentId)
            const isZh = typeof localStorage === 'undefined' || !localStorage.getItem('opencode_language')?.startsWith('en')
            const msg = res.pinned
              ? (isZh ? '已置顶当前对话 (Ctrl+Shift+P)' : 'Pinned conversation (Ctrl+Shift+P)')
              : (isZh ? '已取消置顶当前对话 (Ctrl+Shift+P)' : 'Unpinned conversation (Ctrl+Shift+P)')
            window.dispatchEvent(
              new CustomEvent('opencode:toast', {
                detail: { message: msg, duration: 2000 },
              })
            )
          }
        }
        return
      }

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

      if ((shortcuts.findInPage && matchesShortcut(e, shortcuts.findInPage)) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) {
        e.preventDefault()
        e.stopPropagation()
        setIsFindOpen(true)
        return
      }

      // Background Tasks & Terminal Monitor (Ctrl+` or Ctrl+Shift+J)
      const isCtrlBackquote = (e.ctrlKey || e.metaKey) && (e.key === '`' || e.code === 'Backquote')
      const isCtrlShiftJ = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key.toLowerCase() === 'j' || e.code === 'KeyJ')
      if (isCtrlBackquote || isCtrlShiftJ) {
        if (setIsBackgroundTasksOpen) {
          e.preventDefault()
          e.stopPropagation()
          setIsBackgroundTasksOpen((prev) => !prev)
          return
        }
      }

      // Subagent Topology moved from A to Q for the session board.
      if (matchesShortcut(e, shortcuts.toggleSubagentTopology)) {
        if (setIsSubagentTopologyOpen) {
          e.preventDefault()
          e.stopPropagation()
          setIsSubagentTopologyOpen((prev) => !prev)
          return
        }
      }

      if (
        matchesShortcut(e, shortcuts.addSessionToMap) ||
        (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key.toLowerCase() === 'm' || e.code === 'KeyM'))
      ) {
        e.preventDefault()
        e.stopPropagation()
        if (activeSessionId) {
          handleAddSessionToMap(activeSessionId)
        }
        return
      }

      if (
        matchesShortcut(e, shortcuts.toggleMap) ||
        ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'm')
      ) {
        e.preventDefault()
        e.stopPropagation()
        if (!isMapOpen) {
          handleOpenMapAndLocate(activeSessionId)
        } else {
          setIsMapOpen(false)
          setMapTargetSessionId(null)
        }
        return
      }

      // Timeline Font Scaling & Zoom Shortcuts (Ctrl + +, Ctrl + -, Ctrl + 0) - only if timeline zoom feature is enabled
      const isCtrlKey = (e.ctrlKey || e.metaKey) && !e.altKey
      const prefs = getPreferences()
      if (isCtrlKey && prefs.showTimelineZoomWidget) {
        if (
          e.key === '=' ||
          e.key === '+' ||
          e.code === 'Equal' ||
          e.code === 'NumpadAdd' ||
          matchesShortcut(e, shortcuts.zoomIn)
        ) {
          e.preventDefault()
          e.stopPropagation()
          zoomIn()
          return
        }
        if (
          e.key === '-' ||
          e.key === '_' ||
          e.code === 'Minus' ||
          e.code === 'NumpadSubtract' ||
          matchesShortcut(e, shortcuts.zoomOut)
        ) {
          e.preventDefault()
          e.stopPropagation()
          zoomOut()
          return
        }
        if (
          e.key === '0' ||
          e.code === 'Digit0' ||
          e.code === 'Numpad0' ||
          matchesShortcut(e, shortcuts.zoomReset)
        ) {
          e.preventDefault()
          e.stopPropagation()
          resetZoom()
          return
        }
      }

      if (matchesShortcut(e, shortcuts.openSettings) || ((e.ctrlKey || e.metaKey) && e.key === ',')) {
        e.preventDefault()
        setIsSettingsOpen((prev) => !prev)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [
    activeSessionId,
    shortcuts,
    isZenMode,
    isSettingsOpen,
    isMapOpen,
    isSearchOpen,
    isSessionBoardOpen,
    setIsSessionBoardOpen,
    isFindOpen,
    isModelRouterOpen,
    handleNewSession,
    toggleZenMode,
    toggleSidebar,
    toggleHeader,
    closeTab,
    reopenClosedTab,
    selectSession,
    handleAddSessionToMap,
    handleOpenMapAndLocate,
    setIsSettingsOpen,
    setIsMapOpen,
    setMapTargetSessionId,
    setIsSearchOpen,
    setIsFindOpen,
    setIsModelRouterOpen,
    setIsBackgroundTasksOpen,
    setIsSubagentTopologyOpen,
  ])

  // Mouse Side Buttons (Back/Forward) & Alt + Left/Right Click session navigation
  useEffect(() => {
    let lastNavTime = 0

    const triggerHistoryNav = (direction: 'back' | 'forward') => {
      const now = Date.now()
      if (now - lastNavTime < 100) return
      lastNavTime = now

      if (direction === 'back') {
        if (onHistoryBackRef.current) {
          onHistoryBackRef.current()
        } else {
          window.dispatchEvent(new CustomEvent('opencode-history-back'))
        }
      } else {
        if (onHistoryForwardRef.current) {
          onHistoryForwardRef.current()
        } else {
          window.dispatchEvent(new CustomEvent('opencode-history-forward'))
        }
      }
    }

    const handlePointerDown = (e: PointerEvent) => {
      // Intercept mouse side buttons early to prevent browser navigation away from PWA
      if (e.button === 3 || e.button === 4) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const handleMouseDown = (e: MouseEvent) => {
      const prefs = getPreferences()

      // 1. Mouse side button 3 (Back / XButton1)
      if (e.button === 3) {
        e.preventDefault()
        e.stopPropagation()
        if (prefs.mouseSideButtonNavigation ?? true) {
          triggerHistoryNav('back')
        }
        return
      }

      // 2. Mouse side button 4 (Forward / XButton2)
      if (e.button === 4) {
        e.preventDefault()
        e.stopPropagation()
        if (prefs.mouseSideButtonToggleDialogue && !prefs.mouseSideButtonNavigation) {
          window.dispatchEvent(new CustomEvent('opencode-toggle-center-dialogue'))
        } else if (prefs.mouseSideButtonNavigation ?? true) {
          triggerHistoryNav('forward')
        }
        return
      }

      // 3. Alt + Left Click (Back)
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
        e.preventDefault()
        e.stopPropagation()
        triggerHistoryNav('back')
        return
      }

      // 4. Alt + Right Click (Forward)
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 2) {
        e.preventDefault()
        e.stopPropagation()
        triggerHistoryNav('forward')
        return
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4 || (e.altKey && (e.button === 0 || e.button === 2))) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const handleClick = (e: MouseEvent) => {
      if (e.altKey && (e.button === 0 || e.button === 2)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const handleContextMenu = (e: MouseEvent) => {
      // Suppress native context menu when Alt + Right Click is used for navigation
      if (e.altKey) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    window.addEventListener('mousedown', handleMouseDown, { capture: true })
    window.addEventListener('mouseup', handleMouseUp, { capture: true })
    window.addEventListener('auxclick', handleAuxClick, { capture: true })
    window.addEventListener('click', handleClick, { capture: true })
    window.addEventListener('contextmenu', handleContextMenu, { capture: true })

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      window.removeEventListener('mousedown', handleMouseDown, { capture: true })
      window.removeEventListener('mouseup', handleMouseUp, { capture: true })
      window.removeEventListener('auxclick', handleAuxClick, { capture: true })
      window.removeEventListener('click', handleClick, { capture: true })
      window.removeEventListener('contextmenu', handleContextMenu, { capture: true })
    }
  }, [])

  return {
    isZenMode,
    toggleZenMode,
    shortcuts,
  }
}
