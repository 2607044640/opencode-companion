import dagre from "@dagrejs/dagre"
import type { Edge, Node } from "@xyflow/react"
import { COMMENT_GROUP_TYPE } from "./flow-nodes"
import type { TalkMap } from "../schema/talk-map"

export const DEFAULT_NODE_WIDTH = 240
export const DEFAULT_NODE_HEIGHT = 140
export const DEFAULT_NODE_SEP = 50
export const DEFAULT_RANK_SEP = 80

export interface LayoutDagreOptions {
  readonly direction?: "TB" | "LR"
  readonly nodeWidth?: number
  readonly nodeHeight?: number
  readonly nodeSep?: number
  readonly rankSep?: number
}

/**
 * Calculates Left-to-Right (or Top-to-Bottom) hierarchical layout using Dagre
 * for flow nodes, keeping comment groups intact.
 */
export function getLayoutedNodes<T extends Node>(
  nodes: readonly T[],
  edges: readonly Edge[],
  options: LayoutDagreOptions = {},
  groups?: TalkMap["groups"],
): T[] {
  if (nodes.length === 0) {
    return []
  }

  const {
    direction = "LR",
    nodeWidth = DEFAULT_NODE_WIDTH,
    nodeHeight = DEFAULT_NODE_HEIGHT,
    nodeSep = DEFAULT_NODE_SEP,
    rankSep = DEFAULT_RANK_SEP,
  } = options

  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: direction,
    nodesep: nodeSep,
    ranksep: rankSep,
  })
  g.setDefaultEdgeLabel(() => ({}))

  // Filter out group nodes from dagre node ranking so they don't break session DAG
  const layoutableNodes = nodes.filter((node) => node.type !== COMMENT_GROUP_TYPE)
  const nodeIds = new Set(layoutableNodes.map((n) => n.id))

  for (const node of layoutableNodes) {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      g.setEdge(edge.source, edge.target)
    }
  }

  dagre.layout(g)

  const updatedCards = new Map<string, { x: number; y: number }>()
  const result = nodes.map((node) => {
    if (!nodeIds.has(node.id)) {
      return node
    }
    const nodeWithPosition = g.node(node.id)
    if (!nodeWithPosition) {
      return node
    }
    // dagre returns center coordinates, react-flow expects top-left
    const pos = {
      x: Math.round(nodeWithPosition.x - nodeWidth / 2),
      y: Math.round(nodeWithPosition.y - nodeHeight / 2),
    }
    updatedCards.set(node.id, pos)
    return {
      ...node,
      position: pos,
    }
  })

  // If groups are provided, update comment group bounding nodes to enclose child cards
  if (groups) {
    return result.map((node) => {
      if (node.type !== COMMENT_GROUP_TYPE) {
        return node
      }
      const group = groups[node.id]
      if (!group || group.childCardIds.length === 0) {
        return node
      }
      const memberPositions = group.childCardIds
        .map((id) => updatedCards.get(id))
        .filter((pos): pos is { x: number; y: number } => pos !== undefined)
      if (memberPositions.length === 0) {
        return node
      }
      const minX = Math.min(...memberPositions.map((p) => p.x)) - 24
      const minY = Math.min(...memberPositions.map((p) => p.y)) - 24
      const maxX = Math.max(...memberPositions.map((p) => p.x + nodeWidth)) + 24
      const maxY = Math.max(...memberPositions.map((p) => p.y + nodeHeight)) + 24
      return {
        ...node,
        position: { x: minX, y: minY },
        data: {
          ...(node.data as Record<string, unknown>),
          w: maxX - minX,
          h: maxY - minY,
        },
      }
    })
  }

  return result
}

/**
 * Applies layout node positions back to the TalkMap cards and re-bounds comment groups
 */
export function applyLayoutToMap(
  map: TalkMap,
  layoutedNodes: readonly Node[],
): TalkMap {
  const nextCards = { ...map.cards }
  let changed = false
  for (const node of layoutedNodes) {
    const card = nextCards[node.id]
    if (card && (card.position.x !== node.position.x || card.position.y !== node.position.y)) {
      nextCards[node.id] = {
        ...card,
        position: { x: node.position.x, y: node.position.y },
      }
      changed = true
    }
  }

  // Also update group bounds in TalkMap schema for any groups whose child cards moved
  const nextGroups = { ...map.groups }
  for (const [groupId, group] of Object.entries(nextGroups)) {
    if (group.childCardIds.length === 0) {
      continue
    }
    const memberCards = group.childCardIds
      .map((id) => nextCards[id])
      .filter((c): c is NonNullable<typeof c> => c !== undefined)
    if (memberCards.length === 0) {
      continue
    }
    const minX = Math.min(...memberCards.map((c) => c.position.x)) - 24
    const minY = Math.min(...memberCards.map((c) => c.position.y)) - 24
    const maxX = Math.max(...memberCards.map((c) => c.position.x + DEFAULT_NODE_WIDTH)) + 24
    const maxY = Math.max(...memberCards.map((c) => c.position.y + DEFAULT_NODE_HEIGHT)) + 24
    const w = maxX - minX
    const h = maxY - minY
    if (group.x !== minX || group.y !== minY || group.w !== w || group.h !== h) {
      nextGroups[groupId] = {
        ...group,
        x: minX,
        y: minY,
        w,
        h,
      }
      changed = true
    }
  }

  return changed ? { ...map, cards: nextCards, groups: nextGroups } : map
}

/**
 * Checks if cards are clustered (stacked in a single vertical column or overlapping)
 */
export function shouldAutoLayoutCards(
  cards: readonly { readonly position: { readonly x: number; readonly y: number } }[],
): boolean {
  if (cards.length <= 1) {
    return false
  }
  const posSet = new Set<string>()
  let duplicates = 0
  for (const card of cards) {
    const key = `${card.position.x},${card.position.y}`
    if (posSet.has(key)) {
      duplicates++
    } else {
      posSet.add(key)
    }
  }
  if (duplicates > 0) {
    return true
  }
  // If all cards share the exact same X coordinate (like default stackPosition at x=48)
  const xs = new Set(cards.map((c) => c.position.x))
  if (cards.length >= 2 && xs.size === 1) {
    return true
  }
  // Heavy overlap detection (cards colliding within standard card bounds)
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const c1 = cards[i]!.position
      const c2 = cards[j]!.position
      if (Math.abs(c1.x - c2.x) < 180 && Math.abs(c1.y - c2.y) < 60) {
        return true
      }
    }
  }
  return false
}
