import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type NodeChange,
} from "@xyflow/react"
import { Wand2 } from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react"
import { TalkMapEdge } from "../edges/EdgeComment"
import { CommentGroup } from "../groups/CommentGroup"
import type { TalkMap } from "../schema/talk-map"
import type { TalkMapClient } from "../opencode/client"
import { COMMENT_GROUP_TYPE, SESSION_CARD_TYPE, SKELETON_CARD_TYPE, type TalkMapFlowNode } from "./flow-nodes"
import { MapOverlays, type HotkeyMenu } from "./MapOverlays"
import type { ViewState } from "./map-interactions"
import { miniMapNodeColor } from "./map-graph"
import type { RubberBand } from "./rubber-band"
import { SessionCard, SkeletonCard } from "./SessionCard"
import { createNodeHandleResolver, findIntersectedEdges, type Point } from "./cutting-wire"
import type { BlueprintMenuState } from "./BlueprintActionMenu"
import { isQuickRightClick } from "./map-gestures"
import "@xyflow/react/dist/style.css"
import "./map-app.css"

const NODE_TYPES = {
  [SESSION_CARD_TYPE]: SessionCard,
  [SKELETON_CARD_TYPE]: SkeletonCard,
  [COMMENT_GROUP_TYPE]: CommentGroup,
}

const EDGE_TYPES = {
  talk: TalkMapEdge,
}

export type MapFlowHandlers = {
  readonly onNodesChange: (changes: NodeChange<TalkMapFlowNode>[]) => void
  readonly onNodeDragStart: () => void
  readonly onNodeDragStop: (event: MouseEvent | TouchEvent, node: TalkMapFlowNode) => void
  readonly onNodesDelete: (nodes: TalkMapFlowNode[]) => void
  readonly onEdgesDelete: (edges: Edge[]) => void
  readonly onLaserCutEdges?: (edgeIds: readonly string[], isFirstInStroke: boolean) => void
  readonly onEdgeClick?: (event: ReactMouseEvent, edge: Edge) => void
  readonly onConnect: (connection: Connection) => void
  readonly onConnectEnd: (event: MouseEvent | TouchEvent, state: FinalConnectionState) => void
  readonly onSelectionChange: (input: { readonly nodes: readonly TalkMapFlowNode[] }) => void
  readonly onDoubleClick: (event: ReactMouseEvent) => void
  readonly onPointerDown: (event: ReactPointerEvent) => void
  readonly onPointerMove: (event: ReactPointerEvent) => void
  readonly onPointerUp: () => void
  readonly onAutoLayout: () => void
  readonly onNodeMouseEnter?: (event: ReactMouseEvent, node: TalkMapFlowNode) => void
  readonly onNodeMouseLeave?: (event: ReactMouseEvent, node: TalkMapFlowNode) => void
}

export type MapFlowChrome = {
  readonly hideChrome: boolean | undefined
  readonly view: ViewState
  readonly toast: string | undefined
  readonly band: RubberBand | undefined
  readonly hotkeyMenu: HotkeyMenu | undefined
  readonly blueprintMenu?: BlueprintMenuState
  readonly client?: TalkMapClient
  readonly newCardId?: () => string
  readonly onRetry: () => void
  readonly onDirectory: (directory: string) => void
  readonly persistMap: (map: TalkMap) => void
  readonly setView: Dispatch<SetStateAction<ViewState>>
  readonly setToast?: Dispatch<SetStateAction<string | undefined>>
  readonly setHotkeyMenu: Dispatch<SetStateAction<HotkeyMenu | undefined>>
  readonly setBlueprintMenu?: Dispatch<SetStateAction<BlueprintMenuState | undefined>>
  readonly onSelectSession?: (sessionId: string) => void
}

export function MapFlow(props: {
  readonly nodes: TalkMapFlowNode[]
  readonly edges: Edge[]
  readonly isLayoutAnimating: boolean
  readonly handlers: MapFlowHandlers
  readonly chrome: MapFlowChrome
  readonly screenToFlowPosition: (point: { readonly x: number; readonly y: number }) => {
    readonly x: number
    readonly y: number
  }
}) {
  const { handlers, chrome } = props
  const [isAltPressed, setIsAltPressed] = useState(false)
  const isAltPressedRef = useRef(false)
  isAltPressedRef.current = isAltPressed
  const lastFlowPosRef = useRef<Point | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setIsAltPressed(true)
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setIsAltPressed(false)
        lastFlowPosRef.current = null
      }
    }
    const handleBlur = () => {
      setIsAltPressed(false)
      lastFlowPosRef.current = null
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true })
    window.addEventListener("keyup", handleKeyUp, { capture: true })
    window.addEventListener("blur", handleBlur)

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true })
      window.removeEventListener("keyup", handleKeyUp, { capture: true })
      window.removeEventListener("blur", handleBlur)
    }
  }, [])

  const cutEdge = useCallback(
    (edge: Edge) => {
      if (edge.data?.kind === "native") {
        chrome.setToast?.("原生会话连线由后端维护，无法单独切断")
        return
      }
      handlers.onEdgesDelete([edge])
      chrome.setToast?.("已切断连线")
    },
    [chrome, handlers],
  )

  const handleEdgeHoverCut = useCallback(
    (event: ReactMouseEvent, edge: Edge) => {
      if (isAltPressedRef.current || event.altKey) {
        cutEdge(edge)
      }
    },
    [cutEdge],
  )

  const handlePointerMove = (event: ReactPointerEvent) => {
    const currentFlowPos = props.screenToFlowPosition({ x: event.clientX, y: event.clientY })

    if (isAltPressedRef.current || event.altKey) {
      if (!isAltPressed) {
        setIsAltPressed(true)
      }
      if (lastFlowPosRef.current !== null) {
        const cutter = { start: lastFlowPosRef.current, end: currentFlowPos }
        const resolveHandlePoint = createNodeHandleResolver(props.nodes)
        const cutEdgeIds = findIntersectedEdges({
          cutter,
          edges: props.edges,
          resolveHandlePoint,
          skipNative: true,
        })
        if (cutEdgeIds.length > 0) {
          const edgesToDelete = props.edges.filter((e) => cutEdgeIds.includes(e.id))
          if (edgesToDelete.length > 0) {
            handlers.onEdgesDelete(edgesToDelete)
            chrome.setToast?.(`已切断 ${edgesToDelete.length} 条连线`)
          }
        }
      }
    }
    lastFlowPosRef.current = currentFlowPos
    handlers.onPointerMove(event)
  }

  const rightClickStartRef = useRef<{
    time: number
    point: { x: number; y: number }
    moved: boolean
  } | null>(null)

  const triggerQuickRightClickMenu = (clientX: number, clientY: number, target: EventTarget | null) => {
    const start = rightClickStartRef.current
    rightClickStartRef.current = null

    const el = target as HTMLElement | null
    if (
      el?.closest(".react-flow__node") ||
      el?.closest(".session-card") ||
      el?.closest(".session-card__palette") ||
      el?.closest(".react-flow__minimap") ||
      el?.closest(".react-flow__controls") ||
      el?.closest('[data-testid="blueprint-action-menu"]')
    ) {
      return false
    }

    if (
      start !== null &&
      !start.moved &&
      isQuickRightClick({
        startPoint: start.point,
        endPoint: { x: clientX, y: clientY },
        durationMs: Date.now() - start.time,
        maxDistance: 6,
        maxDurationMs: 500,
      })
    ) {
      const clientPoint = { x: clientX, y: clientY }
      const flowPos = props.screenToFlowPosition(clientPoint)
      chrome.setBlueprintMenu?.({
        clientPoint,
        flowPos,
        fromNode: null,
      })
      return true
    }
    return false
  }

  const handleCanvasPointerDownCapture = (e: ReactPointerEvent) => {
    if (e.button === 2) {
      rightClickStartRef.current = {
        time: Date.now(),
        point: { x: e.clientX, y: e.clientY },
        moved: false,
      }
    }
    if (e.button === 1 && e.altKey) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const handleCanvasPointerMoveCapture = (e: ReactPointerEvent) => {
    if (rightClickStartRef.current && !rightClickStartRef.current.moved) {
      const moved = !isQuickRightClick({
        startPoint: rightClickStartRef.current.point,
        endPoint: { x: e.clientX, y: e.clientY },
        durationMs: 0,
        maxDistance: 6,
      })
      if (moved) {
        rightClickStartRef.current.moved = true
      }
    }
  }

  const handleCanvasPointerUpCapture = (e: ReactPointerEvent) => {
    if (e.button === 2 && rightClickStartRef.current) {
      triggerQuickRightClickMenu(e.clientX, e.clientY, e.target)
    }
  }

  const handleCanvasContextMenuCapture = (e: ReactMouseEvent) => {
    const el = e.target as HTMLElement | null
    if (el?.closest(".react-flow__node") || el?.closest(".session-card__palette")) {
      return
    }

    // Always prevent native browser context menu on canvas
    e.preventDefault()

    if (rightClickStartRef.current) {
      triggerQuickRightClickMenu(e.clientX, e.clientY, e.target)
    }
  }

  const handlePointerUp = () => {
    handlers.onPointerUp()
  }

  const handlePointerLeave = () => {
    lastFlowPosRef.current = null
  }

  return (
    <div
      className={`talk-map ${props.isLayoutAnimating ? "talk-map--animating" : ""} ${
        isAltPressed ? "talk-map--scissor-mode" : ""
      }`}
    >
      <div
        className="talk-map__canvas"
        onPointerLeave={handlePointerLeave}
        onPointerDownCapture={handleCanvasPointerDownCapture}
        onPointerMoveCapture={handleCanvasPointerMoveCapture}
        onPointerUpCapture={handleCanvasPointerUpCapture}
        onContextMenuCapture={handleCanvasContextMenuCapture}
        onMouseDownCapture={(e) => {
          if (e.button === 1 && e.altKey) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        onAuxClickCapture={(e) => {
          if (e.button === 1 && e.altKey) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
      >
        <ReactFlow
          nodes={props.nodes}
          edges={props.edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          minZoom={0.2}
          maxZoom={2.0}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          onNodeMouseEnter={handlers.onNodeMouseEnter}
          onNodeMouseLeave={handlers.onNodeMouseLeave}
          onNodeDragStart={handlers.onNodeDragStart}
          onNodeDragStop={handlers.onNodeDragStop}
          onNodesDelete={handlers.onNodesDelete}
          onEdgesDelete={handlers.onEdgesDelete}
          onEdgeClick={handlers.onEdgeClick}
          onEdgeMouseEnter={handleEdgeHoverCut}
          onEdgeMouseMove={handleEdgeHoverCut}
          onConnect={handlers.onConnect}
          onConnectEnd={handlers.onConnectEnd}
          onNodesChange={handlers.onNodesChange}
          onSelectionChange={handlers.onSelectionChange}
          onDoubleClick={handlers.onDoubleClick}
          onPointerDown={handlers.onPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          nodesConnectable={true}
          edgesFocusable={false}
          deleteKeyCode={["Backspace", "Delete"]}
          snapToGrid={false}
          panOnDrag={[1, 2]}
          selectionOnDrag={true}
          panOnScroll={false}
          zoomOnScroll={true}
          zoomOnDoubleClick={false}
          preventScrolling={true}
          colorMode="dark"
          onPaneContextMenu={(e) => e.preventDefault()}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#272a31" />
          <Controls position="bottom-left" showInteractive={false}>
            <ControlButton onClick={handlers.onAutoLayout} title="自动整理蓝图 (Dagre Layout)">
              <Wand2 className="w-3.5 h-3.5" />
            </ControlButton>
          </Controls>
          <MiniMap
            position="bottom-right"
            zoomable={true}
            pannable={true}
            nodeColor={miniMapNodeColor}
            nodeStrokeWidth={2}
            maskColor="rgba(12, 13, 14, 0.75)"
            style={{
              width: 180,
              height: 120,
              background: "rgba(18, 20, 24, 0.85)",
              border: "1px solid #272a31",
              borderRadius: "8px",
            }}
          />
        </ReactFlow>
        <MapOverlays
          hideChrome={chrome.hideChrome}
          view={chrome.view}
          toast={chrome.toast}
          band={chrome.band}
          hotkeyMenu={chrome.hotkeyMenu}
          blueprintMenu={chrome.blueprintMenu}
          client={chrome.client}
          newCardId={chrome.newCardId}
          onRetry={chrome.onRetry}
          onDirectory={chrome.onDirectory}
          persistMap={chrome.persistMap}
          setView={chrome.setView}
          setToast={chrome.setToast}
          setHotkeyMenu={chrome.setHotkeyMenu}
          setBlueprintMenu={chrome.setBlueprintMenu}
          onAutoLayout={handlers.onAutoLayout}
          onSelectSession={chrome.onSelectSession}
        />
      </div>
    </div>
  )
}
