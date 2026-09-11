import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  ViewportPortal,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type NodeChange,
} from "@xyflow/react"
import { Wand2 } from "lucide-react"
import { useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react"
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
  const [laser, setLaser] = useState<{ readonly start: Point; readonly current: Point } | undefined>(undefined)
  const cutEdgesRef = useRef<Set<string>>(new Set())
  const cutCountRef = useRef(0)

  const handlePointerDownCapture = (event: ReactPointerEvent) => {
    const target = event.target as HTMLElement | null
    const onNode = Boolean(target?.closest(".react-flow__node"))
    const onEdge = Boolean(target?.closest(".react-flow__edge"))
    const onControl = Boolean(
      target?.closest(".react-flow__controls") || target?.closest(".react-flow__minimap"),
    )

    const isMiddleLaser = event.altKey && event.button === 1
    const isLeftLaser = event.altKey && event.button === 0 && !onNode && !onEdge && !onControl

    if (isMiddleLaser || isLeftLaser) {
      event.preventDefault()
      event.stopPropagation()
      if (
        event.currentTarget instanceof HTMLElement &&
        typeof event.currentTarget.setPointerCapture === "function"
      ) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // ignore
        }
      }
      const origin = props.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      cutEdgesRef.current.clear()
      cutCountRef.current = 0
      setLaser({ start: origin, current: origin })
    }
  }

  const handlePointerMove = (event: ReactPointerEvent) => {
    if (laser !== undefined) {
      event.preventDefault()
      event.stopPropagation()
      const current = props.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      setLaser({ start: laser.start, current })

      const cutter = { start: laser.start, end: current }
      const resolveHandlePoint = createNodeHandleResolver(props.nodes)
      const cutEdgeIds = findIntersectedEdges({
        cutter,
        edges: props.edges,
        resolveHandlePoint,
        skipNative: true,
      })

      const newlyCut = cutEdgeIds.filter((id) => !cutEdgesRef.current.has(id))
      if (newlyCut.length > 0) {
        const isFirstInStroke = cutCountRef.current === 0
        cutCountRef.current += newlyCut.length
        for (const id of newlyCut) {
          cutEdgesRef.current.add(id)
        }
        if (handlers.onLaserCutEdges) {
          handlers.onLaserCutEdges(newlyCut, isFirstInStroke)
        } else {
          const edgesToDelete = props.edges.filter((e) => newlyCut.includes(e.id))
          handlers.onEdgesDelete(edgesToDelete)
        }
      }
      return
    }
    handlers.onPointerMove(event)
  }

  const handlePointerUp = (event: ReactPointerEvent) => {
    if (laser !== undefined) {
      event.preventDefault()
      event.stopPropagation()
      if (
        event.currentTarget instanceof HTMLElement &&
        typeof event.currentTarget.releasePointerCapture === "function"
      ) {
        try {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
        } catch {
          // ignore
        }
      }
      const total = cutCountRef.current
      setLaser(undefined)
      cutEdgesRef.current.clear()
      cutCountRef.current = 0
      if (total > 0) {
        chrome.setToast?.(`已切断 ${total} 条连线`)
      }
      return
    }
    handlers.onPointerUp()
  }

  const handlePointerCancel = (event: ReactPointerEvent) => {
    if (laser !== undefined) {
      if (
        event.currentTarget instanceof HTMLElement &&
        typeof event.currentTarget.releasePointerCapture === "function"
      ) {
        try {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
        } catch {
          // ignore
        }
      }
      setLaser(undefined)
      cutEdgesRef.current.clear()
      cutCountRef.current = 0
    }
  }

  return (
    <div className={`talk-map ${props.isLayoutAnimating ? "talk-map--animating" : ""}`}>
      <div
        className="talk-map__canvas"
        onPointerDownCapture={handlePointerDownCapture}
        onPointerCancel={handlePointerCancel}
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
          {laser !== undefined && (
            <ViewportPortal>
              <svg
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  overflow: "visible",
                  pointerEvents: "none",
                  zIndex: 1000,
                }}
              >
                <line
                  x1={laser.start.x}
                  y1={laser.start.y}
                  x2={laser.current.x}
                  y2={laser.current.y}
                  stroke="#ef4444"
                  strokeWidth={3}
                  strokeLinecap="round"
                  style={{
                    filter: "drop-shadow(0 0 6px #ef4444) drop-shadow(0 0 2px #f87171)",
                  }}
                />
                <line
                  x1={laser.start.x}
                  y1={laser.start.y}
                  x2={laser.current.x}
                  y2={laser.current.y}
                  stroke="#ffffff"
                  strokeWidth={1}
                  strokeLinecap="round"
                />
              </svg>
            </ViewportPortal>
          )}
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
        />
      </div>
    </div>
  )
}
