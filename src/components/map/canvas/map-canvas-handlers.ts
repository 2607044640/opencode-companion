import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import type { TalkMap } from "../schema/talk-map"
import type { TalkMapClient } from "../opencode/client"
import { digitFromKeyboardEvent, handleGroupHotkey, isEditableTarget } from "../groups/hotkeys"
import { createGroupFromSelectedCards, resizeGroup } from "../groups/group-commands"
import type { TalkMapFlowNode } from "./flow-nodes"
import type { SessionNodeHandlers } from "./map-graph"
import {
  assignGroup,
  breakPinConnections,
  colorTagCard,
  commitLiveTitle,
  deleteLiveSession,
  patchReadyMap,
  refreshSessionDigest,
  removeCard,
  removeGroup,
} from "./map-card-actions"
import type { HotkeyMenu } from "./MapOverlays"
import {
  defaultCopyText,
  defaultOpenWindow,
  openSessionFromCard,
  type ViewState,
} from "./map-interactions"

export { createMapFlowHandlers } from "./map-flow-handlers"

export function createSessionNodeHandlers(input: {
  readonly view: ViewState
  readonly client: TalkMapClient
  readonly persistMap: (map: TalkMap) => void
  readonly saveMap: (map: TalkMap) => Promise<void>
  readonly mapRef: MutableRefObject<TalkMap | undefined>
  readonly sseConnectedRef: MutableRefObject<boolean>
  readonly autoSyncEnabled: boolean
  readonly setView: Dispatch<SetStateAction<ViewState>>
  readonly setToast: Dispatch<SetStateAction<string | undefined>>
  readonly setHotkeyMenu: Dispatch<SetStateAction<HotkeyMenu | undefined>>
  readonly onSelectSession?: (sessionId: string) => void
  readonly openWindow?: (url: string) => Window | null
  readonly copyText?: (text: string) => Promise<void>
}): SessionNodeHandlers {
  const onRemoveCard = (cardId: string) => {
    removeCard(input.setView, input.persistMap, cardId)
  }
  return {
    onOpenSession: (sessionId) => {
      if (input.onSelectSession) {
        input.onSelectSession(sessionId)
        return
      }
      openSessionFromCard({
        sessionId,
        openWindow: input.openWindow ?? defaultOpenWindow,
        copyText: input.copyText ?? defaultCopyText,
        setToast: input.setToast,
      })
    },
    onCommitTitle: (call) => {
      commitLiveTitle({
        ...call,
        view: input.view,
        client: input.client,
        mapRef: input.mapRef,
        saveMap: input.saveMap,
        setView: input.setView,
        setToast: input.setToast,
      })
    },
    onColorTag: (call) => {
      colorTagCard(input.setView, input.persistMap, call.cardId, call.colorTag)
    },
    onAssignGroup: (call) => {
      assignGroup(input.setView, input.persistMap, call.cardId, call.groupId)
    },
    onRefreshDigest: (sessionId) => {
      refreshSessionDigest({
        view: input.view,
        client: input.client,
        sessionId,
        autoSyncEnabled: input.autoSyncEnabled,
        sseConnected: input.sseConnectedRef.current,
        persistMap: input.persistMap,
        setView: input.setView,
        setToast: input.setToast,
      })
    },
    onRemoveCard,
    onDeleteSession: (sessionId, cardId) => {
      void deleteLiveSession({
        client: input.client,
        view: input.view,
        sessionId,
        cardId,
        onRemoveCard,
        setToast: input.setToast,
      })
    },
    onBreakPinConnections: (call) => {
      breakPinConnections(input.setView, input.persistMap, input.setToast, call.cardId, call.type)
    },
    onBindHotkey: (call) => {
      input.setHotkeyMenu({ groupId: call.groupId, x: call.clientX, y: call.clientY })
    },
    onResizeGroup: (call) => {
      patchReadyMap(input.setView, input.persistMap, (map) =>
        resizeGroup(map, call.groupId, { x: call.x, y: call.y, w: call.w, h: call.h }),
      )
    },
    onDeleteGroup: (groupId) => {
      removeGroup(input.setView, input.persistMap, groupId)
    },
  }
}

export function bindGroupHotkeys(
  persistMap: (map: TalkMap) => void,
  setView: Dispatch<SetStateAction<ViewState>>,
  selectedRef: MutableRefObject<readonly string[]>,
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      return
    }
    const digit = digitFromKeyboardEvent(event)
    if (digit === undefined) {
      return
    }
    event.preventDefault()
    setView((current) => {
      if (current.kind !== "ready" || current.directory === undefined) {
        return current
      }
      const nextMap = handleGroupHotkey({
        map: current.map,
        directory: current.directory,
        digit,
        selectedCardIds: selectedRef.current,
      })
      if (nextMap === null) {
        return current
      }
      persistMap(nextMap)
      return { ...current, map: nextMap }
    })
  }
  window.addEventListener("keydown", onKeyDown)
  return () => window.removeEventListener("keydown", onKeyDown)
}

export function bindBlueprintHotkeys(input: {
  readonly persistMap: (map: TalkMap) => void
  readonly setView: Dispatch<SetStateAction<ViewState>>
  readonly selectedRef: MutableRefObject<readonly string[]>
  readonly setFlowNodes: Dispatch<SetStateAction<TalkMapFlowNode[]>>
  readonly fitView: (options?: { nodes?: { id: string }[]; padding?: number; duration?: number }) => void
  readonly newGroupId: () => string
  readonly hoveredNodeRef?: MutableRefObject<{ readonly id: string; readonly type?: string } | null>
  readonly onDeleteHoveredNode?: (node: { readonly id: string; readonly type?: string }) => void
  readonly onUndo?: () => void
  readonly onRedo?: () => void
  readonly onAutoLayout?: () => void
}): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      return
    }

    const key = event.key.toLowerCase()

    // Alt+R: Rearrange Blueprint Graph (Auto Layout Dagre)
    if (key === "r" && event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      input.onAutoLayout?.()
      return
    }

    // Delete / Backspace: Delete hovered node if no nodes are explicitly selected
    if ((key === "delete" || key === "backspace") && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (input.selectedRef.current.length === 0 && input.hoveredNodeRef?.current) {
        event.preventDefault()
        const target = input.hoveredNodeRef.current
        input.onDeleteHoveredNode?.(target)
        return
      }
    }

    // Ctrl+Z / Cmd+Z (Undo) & Ctrl+Shift+Z / Cmd+Shift+Z (Redo)
    if (key === "z" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      if (event.shiftKey) {
        input.onRedo?.()
      } else {
        input.onUndo?.()
      }
      return
    }

    // Ctrl+Y / Cmd+Y (Redo)
    if (key === "y" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      input.onRedo?.()
      return
    }

    // F: Frame / Focus selected nodes (or fit entire graph if none selected)
    if (key === "f" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      const selected = input.selectedRef.current
      if (selected.length > 0) {
        input.fitView({
          nodes: selected.map((id) => ({ id })),
          padding: 0.25,
          duration: 350,
        })
      } else {
        input.fitView({ padding: 0.15, duration: 350 })
      }
      return
    }

    // Home: Overview / Fit all nodes
    if (key === "home") {
      event.preventDefault()
      input.fitView({ padding: 0.15, duration: 350 })
      return
    }

    // C: Wrap selected nodes into a Comment Group (Unreal Engine Blueprint comment box)
    if (key === "c" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const selected = input.selectedRef.current
      if (selected.length > 0) {
        event.preventDefault()
        input.setView((current) => {
          if (current.kind !== "ready" || current.directory === undefined) {
            return current
          }
          const nextMap = createGroupFromSelectedCards({
            map: current.map,
            directory: current.directory,
            selectedCardIds: selected,
            newGroupId: input.newGroupId,
          })
          if (nextMap === null) {
            return current
          }
          input.persistMap(nextMap)
          return { ...current, map: nextMap }
        })
      }
      return
    }

    // Ctrl+A / Cmd+A: Select all nodes
    if (key === "a" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      input.setFlowNodes((prev) => {
        const allCardIds: string[] = []
        const updated = prev.map((node) => {
          allCardIds.push(node.id)
          return { ...node, selected: true }
        })
        input.selectedRef.current = allCardIds
        return updated
      })
      return
    }
  }

  window.addEventListener("keydown", onKeyDown)
  return () => window.removeEventListener("keydown", onKeyDown)
}
