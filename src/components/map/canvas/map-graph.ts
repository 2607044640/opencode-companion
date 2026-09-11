import type { Dispatch, SetStateAction } from "react"
import type { Edge } from "@xyflow/react"
import type { TalkMap } from "../schema/talk-map"
import { setEdgeAutoSync, setEdgeComment } from "../edges/sync-native"
import { applyCardDropToGroups, translateGroup } from "../groups/group-commands"
import { removeFlowEdges } from "./map-card-actions"
import {
  cardsToSessionNodes,
  COMMENT_GROUP_TYPE,
  groupsToNodes,
  withColorHandler,
  withDeleteHandler,
  withBreakPinHandler,
  withDigestHandler,
  withGroupAssignHandler,
  withGroupBindHandler,
  withOpenHandler,
  withTitleCommitHandler,
  skeletonNodes,
  type SessionFlowNode,
  type TalkMapFlowNode,
} from "./flow-nodes"
import {
  collectMatchedSessionCards,
  withSearchHighlight,
  type MatchedSessionCard,
} from "./session-search"
import type { ViewState } from "./map-interactions"
import {
  applyLayoutToMap,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_SEP,
  DEFAULT_NODE_WIDTH,
  DEFAULT_RANK_SEP,
  getLayoutedNodes,
} from "./layout-dagre"

export type SessionNodeHandlers = {
  readonly onOpenSession: (sessionId: string) => void
  readonly onCommitTitle: (input: {
    readonly cardId: string
    readonly sessionId: string
    readonly ghost: boolean
    readonly title: string
  }) => void
  readonly onColorTag: (input: { readonly cardId: string; readonly colorTag: string }) => void
  readonly onAssignGroup: (input: {
    readonly cardId: string
    readonly groupId: string | null
  }) => void
  readonly onRefreshDigest: (sessionId: string) => void
  readonly onRemoveCard: (cardId: string) => void
  readonly onDeleteSession: (sessionId: string, cardId: string) => void
  readonly onBreakPinConnections?: (input: { readonly cardId: string; readonly type: "source" | "target" }) => void
  readonly onBindHotkey: (input: {
    readonly groupId: string
    readonly clientX: number
    readonly clientY: number
  }) => void
  readonly onResizeGroup?: (input: {
    readonly groupId: string
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
  }) => void
  readonly onDeleteGroup?: (groupId: string) => void
}

export function rawSessionNodesFromView(view: ViewState): SessionFlowNode[] {
  if (view.kind !== "ready" || view.directory === undefined) {
    return []
  }
  return cardsToSessionNodes(
    view.map,
    view.directory,
    view.titles,
    view.running,
    view.updated,
  )
}

export function matchedCardsFromView(
  view: ViewState,
  nodes: readonly SessionFlowNode[],
  query: string,
): MatchedSessionCard[] {
  if (view.kind !== "ready") {
    return []
  }
  return collectMatchedSessionCards(nodes, query)
}

export function buildTalkMapNodes(input: {
  readonly view: ViewState
  readonly rawSessionNodes: readonly SessionFlowNode[]
  readonly query: string
  readonly activeIndex: number | undefined
  readonly matchedCards: readonly MatchedSessionCard[]
  readonly handlers: SessionNodeHandlers
}): TalkMapFlowNode[] {
  const view = input.view
  if (view.kind === "loading") {
    return [...skeletonNodes()]
  }
  if (view.kind !== "ready" || view.directory === undefined) {
    return []
  }
  const directory = view.directory
  const groupList = Object.values(view.map.groups)
    .filter((group) => group.directory === directory)
    .map((group) => ({ groupId: group.groupId, title: group.title }))
  const active = input.activeIndex !== undefined ? input.matchedCards[input.activeIndex] : undefined
  const highlighted = withSearchHighlight(
    input.rawSessionNodes,
    input.query,
    active?.sessionId,
  )
  const sessionNodes = withDeleteHandler(
    withDigestHandler(
      withGroupAssignHandler(
        withColorHandler(
          withTitleCommitHandler(
            withOpenHandler(highlighted, input.handlers.onOpenSession),
            input.handlers.onCommitTitle,
          ),
          input.handlers.onColorTag,
        ),
        groupList,
        input.handlers.onAssignGroup,
      ),
      input.handlers.onRefreshDigest,
    ),
    input.handlers.onRemoveCard,
    input.handlers.onDeleteSession,
  )
  const finalSessionNodes = input.handlers.onBreakPinConnections
    ? withBreakPinHandler(sessionNodes, input.handlers.onBreakPinConnections)
    : sessionNodes
  const groupNodes = withGroupBindHandler(
    groupsToNodes(view.map, directory),
    input.handlers.onBindHotkey,
    input.handlers.onResizeGroup,
    input.handlers.onDeleteGroup,
  )
  return [...groupNodes, ...finalSessionNodes]
}

export function buildTalkMapEdges(
  view: ViewState,
  persistMap: (map: TalkMap) => void,
  setView: Dispatch<SetStateAction<ViewState>>,
  setToast?: Dispatch<SetStateAction<string | undefined>>,
): Edge[] {
  if (view.kind !== "ready") {
    return []
  }
  return Object.values(view.map.edges).map((edge) => ({
    id: edge.edgeId,
    source: edge.sourceCardId,
    target: edge.targetCardId,
    type: "talk",
    animated: edge.kind === "inject" || edge.autoSync,
    deletable: edge.kind !== "native",
    data: {
      kind: edge.kind,
      comment: edge.comment,
      autoSync: edge.autoSync,
      onBreakEdge: () => {
        if (edge.kind === "native") {
          setToast?.("原生会话连线由后端维护，无法单独切断")
        } else {
          removeFlowEdges(setView, persistMap, [edge.edgeId])
          setToast?.("已断开连线")
        }
      },
      onComment: (comment: string) => {
        setView((current) => {
          if (current.kind !== "ready") {
            return current
          }
          const nextMap = setEdgeComment(current.map, edge.edgeId, comment)
          persistMap(nextMap)
          return { ...current, map: nextMap }
        })
      },
      onAutoSync: (autoSync: boolean) => {
        setView((current) => {
          if (current.kind !== "ready") {
            return current
          }
          const nextMap = setEdgeAutoSync(current.map, edge.edgeId, autoSync)
          persistMap(nextMap)
          return { ...current, map: nextMap }
        })
      },
    },
  }))
}

export function mergeFlowPositions(
  previous: readonly TalkMapFlowNode[],
  next: readonly TalkMapFlowNode[],
  isDragging: boolean,
): TalkMapFlowNode[] {
  if (isDragging) {
    return [...previous]
  }
  const posMap = new Map(previous.map((node) => [node.id, node]))
  return next.map((node) => {
    const prevNode = posMap.get(node.id)
    if (prevNode === undefined) {
      return node
    }
    // For groups: if position or size changed in next (e.g. from resize, auto-layout, or auto-expansion), adopt next
    if (node.type === COMMENT_GROUP_TYPE) {
      if (
        prevNode.type !== COMMENT_GROUP_TYPE ||
        prevNode.data.w !== node.data.w ||
        prevNode.data.h !== node.data.h ||
        prevNode.position.x !== node.position.x ||
        prevNode.position.y !== node.position.y
      ) {
        return {
          ...node,
          width: node.data.w,
          height: node.data.h,
          style: { width: node.data.w, height: node.data.h },
        }
      }
    }
    return { ...node, position: prevNode.position }
  })
}

export function applyDragStop(map: TalkMap, node: TalkMapFlowNode): TalkMap | undefined {
  if (node.type === COMMENT_GROUP_TYPE) {
    const group = map.groups[node.id]
    if (group === undefined) {
      return undefined
    }
    return translateGroup(map, node.id, {
      x: node.position.x - group.x,
      y: node.position.y - group.y,
    })
  }
  const card = map.cards[node.id]
  if (card !== undefined && card.position.x === node.position.x && card.position.y === node.position.y) {
    return undefined
  }
  return applyCardDropToGroups(map, node.id, node.position)
}

export function layoutTalkMap(input: {
  readonly map: TalkMap
  readonly nodes: readonly TalkMapFlowNode[]
  readonly edges: readonly Edge[]
}): { readonly nodes: TalkMapFlowNode[]; readonly map: TalkMap } {
  const layouted = getLayoutedNodes(input.nodes, input.edges, {
    direction: "LR",
    nodeWidth: DEFAULT_NODE_WIDTH,
    nodeHeight: DEFAULT_NODE_HEIGHT,
    nodeSep: DEFAULT_NODE_SEP,
    rankSep: DEFAULT_RANK_SEP,
  })
  return { nodes: layouted, map: applyLayoutToMap(input.map, layouted) }
}

export function miniMapNodeColor(node: {
  readonly type?: string
  readonly data: unknown
}): string {
  if (node.type === COMMENT_GROUP_TYPE) {
    return "rgba(58, 65, 80, 0.4)"
  }
  if (node.data === null || typeof node.data !== "object") {
    return "#38bdf8"
  }
  if ("colorTag" in node.data && typeof node.data.colorTag === "string") {
    return node.data.colorTag
  }
  if ("running" in node.data && node.data.running === true) {
    return "#1f6feb"
  }
  if ("ghost" in node.data && node.data.ghost === true) {
    return "#4b5563"
  }
  return "#38bdf8"
}
