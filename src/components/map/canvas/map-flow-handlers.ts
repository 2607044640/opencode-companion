import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
  MouseEvent as ReactMouseEvent,
} from "react"
import {
  applyNodeChanges,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type NodeChange,
} from "@xyflow/react"
import type { TalkMap } from "../schema/talk-map"
import type { TalkMapClient } from "../opencode/client"
import { applyDragStop } from "./map-graph"
import {
  applyLinkOnView,
  finishRubberBandGroup,
} from "./map-gestures"
import { removeFlowEdges, removeFlowNodes } from "./map-card-actions"
import { shouldStartRubberBand, type RubberBand } from "./rubber-band"
import { SESSION_CARD_TYPE, type TalkMapFlowNode } from "./flow-nodes"
import type { MapFlowHandlers } from "./MapFlow"
import { createFromPaneDoubleClick, type ViewState } from "./map-interactions"
import { findCardAtFlowPosition, resolveLazyConnect } from "./lazy-connect"
import type { BlueprintMenuState } from "./BlueprintActionMenu"

export function createMapFlowHandlers(input: {
  readonly view: ViewState
  readonly client: TalkMapClient
  readonly newCardId: () => string
  readonly newGroupId: () => string
  readonly persistMap: (map: TalkMap) => void
  readonly persistDirectMap?: (map: TalkMap) => void
  readonly saveMap: (map: TalkMap) => Promise<void>
  readonly mapRef: MutableRefObject<TalkMap | undefined>
  readonly selectedRef: MutableRefObject<readonly string[]>
  readonly isDraggingRef: MutableRefObject<boolean>
  readonly band: RubberBand | undefined
  readonly setBand: Dispatch<SetStateAction<RubberBand | undefined>>
  readonly setView: Dispatch<SetStateAction<ViewState>>
  readonly setToast: Dispatch<SetStateAction<string | undefined>>
  readonly setFlowNodes: Dispatch<SetStateAction<TalkMapFlowNode[]>>
  readonly screenToFlowPosition: (point: {
    readonly x: number
    readonly y: number
  }) => { readonly x: number; readonly y: number }
  readonly onAutoLayout: () => void
  readonly hoveredNodeRef?: MutableRefObject<{ readonly id: string; readonly type?: string } | null>
  readonly setBlueprintMenu?: Dispatch<SetStateAction<BlueprintMenuState | undefined>>
}): MapFlowHandlers {
  return {
    onNodeMouseEnter: (_event: ReactMouseEvent, node: TalkMapFlowNode) => {
      if (input.hoveredNodeRef) {
        input.hoveredNodeRef.current = { id: node.id, type: node.type }
      }
    },
    onNodeMouseLeave: () => {
      if (input.hoveredNodeRef) {
        input.hoveredNodeRef.current = null
      }
    },
    onNodesChange: (changes: NodeChange<TalkMapFlowNode>[]) => {
      input.setFlowNodes((current) => applyNodeChanges(changes, current))
    },
    onNodeDragStart: () => {
      input.isDraggingRef.current = true
    },
    onNodeDragStop: (_event, node) => {
      input.isDraggingRef.current = false
      if (input.view.kind !== "ready") {
        return
      }
      const currentMap = input.mapRef.current ?? input.view.map
      const nextMap = applyDragStop(currentMap, node)
      if (nextMap === undefined || nextMap === currentMap) {
        return
      }
      input.persistMap(nextMap)
      input.setView((curr) => (curr.kind === "ready" ? { ...curr, map: nextMap } : curr))
    },
    onNodesDelete: (deleted) => removeFlowNodes(input.setView, input.persistMap, deleted),
    onEdgesDelete: (deleted: Edge[]) => {
      removeFlowEdges(
        input.setView,
        input.persistMap,
        deleted.map((edge) => edge.id),
      )
    },
    onLaserCutEdges: (edgeIds: readonly string[], isFirstInStroke: boolean) => {
      removeFlowEdges(
        input.setView,
        isFirstInStroke ? input.persistMap : (input.persistDirectMap ?? input.persistMap),
        edgeIds,
      )
    },
    onEdgeClick: (event: ReactMouseEvent, edge: Edge) => {
      if (event.altKey && event.button === 0) {
        event.stopPropagation()
        event.preventDefault()
        if (edge.data?.kind === "native") {
          input.setToast("原生会话连线由后端维护，无法单独切断")
        } else {
          removeFlowEdges(input.setView, input.persistMap, [edge.id])
          input.setToast("已断开连线")
        }
      }
    },
    onConnect: (connection: Connection) => {
      applyLinkOnView(input.setView, input.persistMap, connection.source, connection.target)
    },
    onConnectEnd: (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || input.view.kind !== "ready" || input.view.directory === undefined) {
        return
      }

      const clientPoint =
        "clientX" in event && typeof event.clientX === "number"
          ? { x: event.clientX, y: event.clientY }
          : "changedTouches" in event && event.changedTouches?.[0]
            ? { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
            : undefined

      if (clientPoint === undefined) {
        return
      }

      const flowPos = input.screenToFlowPosition(clientPoint)

      // 1. Smart Drop / Lazy Connect
      let targetCardId: string | undefined = undefined

      if (typeof document !== "undefined") {
        const el = document.elementFromPoint(clientPoint.x, clientPoint.y)
        const isCommentGroup = Boolean(
          el?.closest(".talk-map__comment-group, .react-flow__node-commentGroup"),
        )
        const cardEl = el?.closest(".session-card")
        if (cardEl && !isCommentGroup) {
          const cardId =
            cardEl.getAttribute("data-card-id") ??
            cardEl.closest(".react-flow__node")?.getAttribute("data-id")
          if (cardId && input.view.map.cards[cardId]) {
            targetCardId = cardId
          }
        }
      }

      // Fallback geometry hit testing
      if (targetCardId === undefined) {
        targetCardId = findCardAtFlowPosition({
          flowPos,
          cards: input.view.map.cards,
          directory: input.view.directory,
        })
      }

      const fromNode = state.fromNode
      const fromHandleType: "source" | "target" =
        state.fromHandle?.type === "target" || state.fromPosition === "left"
          ? "target"
          : "source"

      if (targetCardId !== undefined && fromNode) {
        const { finalSource, finalTarget } = resolveLazyConnect({
          fromNodeId: fromNode.id,
          fromHandleType,
          targetCardId,
        })

        if (finalSource === finalTarget) {
          input.setToast("无法连接自身")
          return
        }

        const alreadyConnected = Object.values(input.view.map.edges).some(
          (edge) => edge.sourceCardId === finalSource && edge.targetCardId === finalTarget,
        )
        if (alreadyConnected) {
          input.setToast("连线已存在")
          return
        }

        applyLinkOnView(input.setView, input.persistMap, finalSource, finalTarget)
        input.setToast("已自动连接引脚 (Lazy Connect)")
        return
      }

      // 2. Dropped in empty space -> open Blueprint Action Menu
      input.setBlueprintMenu?.({
        clientPoint,
        flowPos,
        fromNode,
        fromHandleType,
      })
    },
    onSelectionChange: ({ nodes: selected }) => {
      input.selectedRef.current = selected
        .filter((node) => node.type === SESSION_CARD_TYPE)
        .map((node) => node.id)
    },
    onDoubleClick: (event: ReactMouseEvent) => {
      createFromPaneDoubleClick({
        event,
        view: input.view,
        client: input.client,
        newCardId: input.newCardId,
        screenToFlowPosition: input.screenToFlowPosition,
        saveMap: input.saveMap,
        mapRef: input.mapRef,
        setView: input.setView,
        setToast: input.setToast,
      })
    },
    onPointerDown: (event: ReactPointerEvent) => {
      const target = event.target
      const onNode = target instanceof Element && target.closest(".react-flow__node") !== null
      if (!shouldStartRubberBand({ ctrlKey: event.ctrlKey, button: event.button, onNode })) {
        return
      }
      const origin = input.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      input.setBand({ start: origin, end: origin })
    },
    onPointerMove: (event: ReactPointerEvent) => {
      if (input.band === undefined) {
        return
      }
      input.setBand({
        start: input.band.start,
        end: input.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      })
    },
    onPointerUp: () => {
      if (input.band === undefined) {
        return
      }
      const currentBand = input.band
      input.setBand(undefined)
      input.setView((current) => {
        if (current.kind !== "ready" || current.directory === undefined) {
          return current
        }
        const nextMap = finishRubberBandGroup({
          map: current.map,
          directory: current.directory,
          band: currentBand,
          now: Date.now(),
          newGroupId: input.newGroupId,
        })
        if (nextMap === null) {
          return current
        }
        input.persistMap(nextMap)
        return { ...current, map: nextMap }
      })
    },
    onAutoLayout: input.onAutoLayout,
  }
}
