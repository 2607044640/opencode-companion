import type { Dispatch, SetStateAction } from "react"
import type { TalkMap } from "../schema/talk-map"
import { upsertLinkEdge } from "../edges/sync-native"
import { createGroupFromRubberBand } from "../groups/group-commands"
import type { TalkMapClient } from "../opencode/client"
import { applyInjectedBranch, createInjectedBranch } from "./connect-inject"
import type { ViewState } from "./map-interactions"
import { rubberBandBox, type RubberBand } from "./rubber-band"

function sessionIdFromNodeData(data: unknown): string | undefined {
  if (data === null || typeof data !== "object" || !("sessionId" in data)) {
    return undefined
  }
  return typeof data.sessionId === "string" ? data.sessionId : undefined
}

export function applyLinkConnection(
  map: TalkMap,
  source: string | null,
  target: string | null,
): TalkMap | undefined {
  if (source === null || target === null) {
    return undefined
  }
  return upsertLinkEdge(map, source, target)
}

export function applyLinkOnView(
  setView: Dispatch<SetStateAction<ViewState>>,
  persistMap: (map: TalkMap) => void,
  source: string | null,
  target: string | null,
): void {
  setView((current) => {
    if (current.kind !== "ready") {
      return current
    }
    const nextMap = applyLinkConnection(current.map, source, target)
    if (nextMap === undefined) {
      return current
    }
    persistMap(nextMap)
    return { ...current, map: nextMap }
  })
}

export function dropPositionFromConnectEnd(
  event: MouseEvent | TouchEvent,
  screenToFlowPosition: (point: {
    readonly x: number
    readonly y: number
  }) => { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } | undefined {
  if ("clientX" in event && typeof event.clientX === "number") {
    return screenToFlowPosition({ x: event.clientX, y: event.clientY })
  }
  if ("changedTouches" in event) {
    const touch = event.changedTouches[0]
    if (touch === undefined) {
      return undefined
    }
    return screenToFlowPosition({ x: touch.clientX, y: touch.clientY })
  }
  return undefined
}

export function finishRubberBandGroup(input: {
  readonly map: TalkMap
  readonly directory: string
  readonly band: RubberBand
  readonly now: number
  readonly newGroupId: () => string
}): TalkMap | null {
  return createGroupFromRubberBand({
    map: input.map,
    directory: input.directory,
    box: rubberBandBox(input.band),
    now: input.now,
    newGroupId: input.newGroupId,
  })
}

export function startInjectFromConnectEnd(input: {
  readonly view: ViewState
  readonly toNode: unknown
  readonly fromNode: {
    readonly id: string
    readonly data: unknown
    readonly position?: { readonly x: number; readonly y: number }
  } | null
  readonly client: TalkMapClient
  readonly newCardId: () => string
  readonly dropPos: { readonly x: number; readonly y: number } | undefined
  readonly persistMap: (map: TalkMap) => void
  readonly setView: Dispatch<SetStateAction<ViewState>>
  readonly setToast: Dispatch<SetStateAction<string | undefined>>
}): void {
  if (input.toNode !== null || input.view.kind !== "ready" || input.view.directory === undefined) {
    return
  }
  const source = input.fromNode
  if (source === null) {
    return
  }
  const sourceSession = sessionIdFromNodeData(source.data)
  if (sourceSession === undefined) {
    return
  }
  const sourceTitle = input.view.titles[sourceSession] ?? sourceSession
  const directory = input.view.directory
  void createInjectedBranch({
    client: input.client,
    directory,
    source: {
      cardId: source.id,
      sessionId: sourceSession,
      title: sourceTitle,
      digest: input.view.map.digests[sourceSession],
      position: { x: source.position?.x ?? 0, y: source.position?.y ?? 0 },
    },
  })
    .then((created) => {
      const cardId = input.newCardId()
      input.setView((current) => {
        const next = applyInjectedBranch({
          current,
          sourceCardId: source.id,
          sourcePosition: { x: source.position?.x ?? 0, y: source.position?.y ?? 0 },
          targetPosition: input.dropPos,
          cardId,
          created,
        })
        if (next.kind === "ready") {
          input.persistMap(next.map)
        }
        return next
      })
    })
    .catch((error: unknown) => {
      if (error instanceof Error) {
        input.setToast(error.message)
        return
      }
      throw error
    })
}
