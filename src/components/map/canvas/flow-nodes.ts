import type { Node } from "@xyflow/react"
import type { TalkMap } from "../schema/talk-map"
import { stackPosition } from "./session-sync"
import type { SessionRunning, SessionTitles, SessionUpdated } from "./map-bootstrap"
import { formatRelativeTime, truncateNextStep } from "./card-meta"

export const SESSION_CARD_TYPE = "sessionCard" as const
export const SKELETON_CARD_TYPE = "skeletonCard" as const
export const COMMENT_GROUP_TYPE = "commentGroup" as const
export const SKELETON_COUNT = 3

export type SessionCardData = {
  readonly title: string
  readonly ghost: boolean
  readonly running: boolean
  readonly sessionId?: string
  readonly colorTag?: string
  readonly nextStep?: string
  readonly relativeTime?: string
  readonly isDimmed?: boolean
  readonly isHighlighted?: boolean
  readonly isSelected?: boolean
  readonly onOpen?: (sessionId: string) => void
  readonly onCommitTitle?: (input: {
    readonly cardId: string
    readonly sessionId: string
    readonly ghost: boolean
    readonly title: string
  }) => void
  readonly onColorTag?: (input: { readonly cardId: string; readonly colorTag: string }) => void
  readonly groups?: readonly { readonly groupId: string; readonly title: string }[]
  readonly onAssignGroup?: (input: { readonly cardId: string; readonly groupId: string | null }) => void
  readonly onRefreshDigest?: (sessionId: string) => void
  readonly onRemoveCard?: (cardId: string) => void
  readonly onDeleteSession?: (sessionId: string, cardId: string) => void
  readonly onBreakPinConnections?: (input: { readonly cardId: string; readonly type: "source" | "target" }) => void
}

export type GroupCardData = {
  readonly title: string
  readonly color: string
  readonly w: number
  readonly h: number
  readonly onBindHotkey?: (input: {
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

export type SessionFlowNode = Node<SessionCardData, typeof SESSION_CARD_TYPE>
export type SkeletonFlowNode = Node<Record<string, unknown>, typeof SKELETON_CARD_TYPE>
export type GroupFlowNode = Node<GroupCardData, typeof COMMENT_GROUP_TYPE>
export type TalkMapFlowNode = SessionFlowNode | SkeletonFlowNode | GroupFlowNode

function cardTitle(
  label: string | undefined,
  sessionId: string | undefined,
  titles: SessionTitles,
): string {
  if (label !== undefined) {
    return label
  }
  if (sessionId !== undefined) {
    const listed = titles[sessionId]
    if (listed !== undefined) {
      return listed
    }
    return sessionId
  }
  return "Untitled"
}

export function skeletonNodes(): readonly SkeletonFlowNode[] {
  const nodes: SkeletonFlowNode[] = []
  for (let index = 0; index < SKELETON_COUNT; index += 1) {
    nodes.push({
      id: `skeleton_${index}`,
      type: SKELETON_CARD_TYPE,
      position: stackPosition(index),
      data: {},
      draggable: false,
      selectable: false,
    })
  }
  return nodes
}

export function cardsToSessionNodes(
  map: TalkMap,
  directory: string,
  titles: SessionTitles,
  running: SessionRunning,
  updated: SessionUpdated = {},
  now: number = Date.now(),
): SessionFlowNode[] {
  const nodes: SessionFlowNode[] = []
  for (const card of Object.values(map.cards)) {
    if (card.directory !== directory) {
      continue
    }
    const sessionId = card.sessionId
    const digest = sessionId === undefined ? undefined : map.digests[sessionId]
    const nextStep = truncateNextStep(digest?.nextStep)
    const timeSource = digest?.updatedAt ?? (sessionId === undefined ? undefined : updated[sessionId])
    const relativeTime = timeSource === undefined ? undefined : formatRelativeTime(timeSource, now)
    nodes.push({
      id: card.cardId,
      type: SESSION_CARD_TYPE,
      position: { x: card.position.x, y: card.position.y },
      data: {
        title: cardTitle(card.label, sessionId, titles),
        ghost: card.ghost,
        running: sessionId !== undefined && running[sessionId] === true,
        ...(sessionId === undefined ? {} : { sessionId }),
        ...(card.colorTag === undefined ? {} : { colorTag: card.colorTag }),
        ...(nextStep === undefined ? {} : { nextStep }),
        ...(relativeTime === undefined ? {} : { relativeTime }),
      },
      draggable: true,
    })
  }
  return nodes
}

export function withOpenHandler(
  nodes: readonly SessionFlowNode[],
  onOpen: (sessionId: string) => void,
): SessionFlowNode[] {
  return nodes.map((node) => {
    if (node.data.sessionId === undefined) {
      return node
    }
    return {
      ...node,
      data: { ...node.data, onOpen },
    }
  })
}

export function withTitleCommitHandler(
  nodes: readonly SessionFlowNode[],
  onCommitTitle: (input: {
    readonly cardId: string
    readonly sessionId: string
    readonly ghost: boolean
    readonly title: string
  }) => void,
): SessionFlowNode[] {
  return nodes.map((node) => {
    if (node.data.sessionId === undefined) {
      return node
    }
    return {
      ...node,
      data: { ...node.data, onCommitTitle },
    }
  })
}

export function withColorHandler(
  nodes: readonly SessionFlowNode[],
  onColorTag: (input: { readonly cardId: string; readonly colorTag: string }) => void,
): SessionFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    data: { ...node.data, onColorTag },
  }))
}

export function groupsToNodes(
  map: TalkMap,
  directory: string,
): GroupFlowNode[] {
  const nodes: GroupFlowNode[] = []
  for (const group of Object.values(map.groups)) {
    if (group.directory !== directory) {
      continue
    }
    nodes.push({
      id: group.groupId,
      type: COMMENT_GROUP_TYPE,
      position: { x: group.x, y: group.y },
      width: group.w,
      height: group.h,
      style: { width: group.w, height: group.h },
      data: {
        title: group.title,
        color: group.color,
        w: group.w,
        h: group.h,
      },
      draggable: true,
      selectable: true,
      zIndex: -1,
    })
  }
  return nodes
}

export function withDigestHandler(
  nodes: readonly SessionFlowNode[],
  onRefreshDigest: (sessionId: string) => void,
): SessionFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    data: { ...node.data, onRefreshDigest },
  }))
}

export function withGroupAssignHandler(
  nodes: readonly SessionFlowNode[],
  groups: readonly { readonly groupId: string; readonly title: string }[],
  onAssignGroup: (input: { readonly cardId: string; readonly groupId: string | null }) => void,
): SessionFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    data: { ...node.data, groups, onAssignGroup },
  }))
}

export function withGroupBindHandler(
  nodes: readonly GroupFlowNode[],
  onBindHotkey: (input: {
    readonly groupId: string
    readonly clientX: number
    readonly clientY: number
  }) => void,
  onResizeGroup?: (input: {
    readonly groupId: string
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
  }) => void,
  onDeleteGroup?: (groupId: string) => void,
): GroupFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    data: { ...node.data, onBindHotkey, onResizeGroup, onDeleteGroup },
  }))
}

export function withDeleteHandler(
  nodes: readonly SessionFlowNode[],
  onRemoveCard: (cardId: string) => void,
  onDeleteSession: (sessionId: string, cardId: string) => void,
): SessionFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    data: { ...node.data, onRemoveCard, onDeleteSession },
  }))
}

export function withBreakPinHandler(
  nodes: readonly SessionFlowNode[],
  onBreakPinConnections: (input: { readonly cardId: string; readonly type: "source" | "target" }) => void,
): SessionFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    data: { ...node.data, onBreakPinConnections },
  }))
}

