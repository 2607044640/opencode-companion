import { useState, useEffect, useCallback, useRef } from 'react'
import { getShortcuts, matchesShortcut, type ShortcutsMap } from '../utils/shortcuts'
import { getNextTabId, getPrevTabId, getTabIdByIndex } from '../utils/tab-navigation'

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
  isFindOpen: boolean
  setIsFindOpen: React.Dispatch<React.SetStateAction<boolean>>
  isModelRouterOpen: boolean
  setIsModelRouterOpen: React.Dispatch<React.SetStateAction<boolean>>
  handleNewSession: (directory?: string) => void
  toggleSidebar: (force?: boolean) => void
  toggleHeader: (force?: boolean) => void
  closeTab: (sessionId?: string) => void
  reopenClosedTab: () => void
  selectSession: (sessionId: string) => void
  handleAddSessionToMap: (sessionId: string) => void
  handleOpenMapAndLocate: (sessionId?: string | null) => void
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
  ])

  return {
    isZenMode,
    toggleZenMode,
    shortcuts,
  }
}
