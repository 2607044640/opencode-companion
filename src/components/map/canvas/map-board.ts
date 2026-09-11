import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import type { TalkMap } from "../schema/talk-map"
import {
  OpenCodeUnreachableError,
  type TalkMapClient,
} from "../opencode/client"
import { syncNativeEdges } from "../edges/sync-native"
import { pushAutoSync } from "../digest/autosync"
import { runDigest } from "../digest/run-digest"
import type { SubscribeEventsInput } from "../opencode/sse"
import { bootstrapMap } from "./map-bootstrap"
import { applyLiveEvent } from "./map-events"
import { cardsToSessionNodes } from "./flow-nodes"
import {
  applyLayoutToMap,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_SEP,
  DEFAULT_NODE_WIDTH,
  DEFAULT_RANK_SEP,
  getLayoutedNodes,
  shouldAutoLayoutCards,
} from "./layout-dagre"
import type { ViewState } from "./map-interactions"

const AUTO_LAYOUT = {
  direction: "LR" as const,
  nodeWidth: DEFAULT_NODE_WIDTH,
  nodeHeight: DEFAULT_NODE_HEIGHT,
  nodeSep: DEFAULT_NODE_SEP,
  rankSep: DEFAULT_RANK_SEP,
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

export function shouldIgnoreSubscribeError(error: unknown): boolean {
  return (
    isAbortError(error) ||
    error instanceof TypeError ||
    error instanceof OpenCodeUnreachableError
  )
}

export async function loadTalkBoard(input: {
  readonly client: TalkMapClient
  readonly loadMap: () => Promise<TalkMap>
  readonly saveMap: (map: TalkMap) => Promise<void>
  readonly newCardId: () => string
  readonly directory?: string
  readonly mapRef: MutableRefObject<TalkMap | undefined>
  readonly onProjectsLoaded?: (
    projects: readonly { id: string; worktree: string; name?: string }[],
  ) => void
}): Promise<ViewState> {
  const result = await bootstrapMap({
    client: input.client,
    loadMap: async () => input.mapRef.current ?? (await input.loadMap()),
    newCardId: input.newCardId,
    ...(input.directory === undefined ? {} : { directory: input.directory }),
  })
  if (result.kind === "unreachable") {
    input.mapRef.current = undefined
    return { kind: "unreachable" }
  }
  const listed =
    result.directory === undefined ? [] : await input.client.listSessions(result.directory)
  const mapped = syncNativeEdges(
    result.map,
    listed.map((session) => ({ sessionId: session.id, parentId: session.parentID })),
  )
  const dirCards = Object.values(mapped.cards).filter((card) => card.directory === result.directory)
  let finalMap = mapped
  if (shouldAutoLayoutCards(dirCards)) {
    const initialNodes = cardsToSessionNodes(
      mapped,
      result.directory ?? "",
      result.titles,
      result.running,
      result.updated,
    )
    const initialEdges = Object.values(mapped.edges).map((edge) => ({
      id: edge.edgeId,
      source: edge.sourceCardId,
      target: edge.targetCardId,
    }))
    finalMap = applyLayoutToMap(mapped, getLayoutedNodes(initialNodes, initialEdges, AUTO_LAYOUT))
  }
  input.mapRef.current = finalMap
  void input.saveMap(finalMap)
  if (input.onProjectsLoaded !== undefined) {
    input.onProjectsLoaded(result.projects)
  }
  return { ...result, map: finalMap }
}

export function subscribeTalkBoard(input: {
  readonly directory: string
  readonly subscribe: (call: SubscribeEventsInput) => Promise<void>
  readonly client: TalkMapClient
  readonly newCardId: () => string
  readonly persist: { readonly schedule: (map: TalkMap) => void }
  readonly persistMap: (map: TalkMap) => void
  readonly setView: Dispatch<SetStateAction<ViewState>>
  readonly autoSyncEnabled: boolean
  readonly sseConnectedRef: MutableRefObject<boolean>
  readonly mapRef: MutableRefObject<TalkMap | undefined>
}): () => void {
  const controller = new AbortController()
  input.sseConnectedRef.current = true
  void input.subscribe({
    directory: input.directory,
    signal: controller.signal,
    onEvent: (event) => {
      input.setView((current) => {
        if (current.kind !== "ready" || current.directory !== input.directory) {
          return current
        }
        const next = applyLiveEvent({
          board: current,
          directory: input.directory,
          event,
          newCardId: input.newCardId,
        })
        input.mapRef.current = next.map
        if (next.map !== current.map) {
          input.persist.schedule(next.map)
        }
        if (event.kind === "status" && !event.running) {
          const idleId = event.sessionId
          const title = next.titles[idleId] ?? idleId
          void runDigest({
            client: input.client,
            map: next.map,
            directory: input.directory,
            sessionId: idleId,
            title,
          }).then((digested) => {
            input.persistMap(digested)
            input.setView((latest) =>
              latest.kind === "ready" ? { ...latest, map: digested } : latest,
            )
            if (input.autoSyncEnabled) {
              return pushAutoSync({
                map: digested,
                sourceSessionId: idleId,
                visible: document.visibilityState === "visible",
                sseConnected: input.sseConnectedRef.current,
                promptNoReply: (call) => input.client.promptNoReply(call),
              })
            }
          })
        }
        return { ...current, ...next }
      })
    },
  }).catch((error: unknown) => {
    if (shouldIgnoreSubscribeError(error)) {
      return
    }
    throw error
  })
  return () => {
    input.sseConnectedRef.current = false
    controller.abort()
  }
}
