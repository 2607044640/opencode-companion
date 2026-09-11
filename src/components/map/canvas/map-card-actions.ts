import type { Dispatch, SetStateAction } from "react"
import type { TalkMap } from "../schema/talk-map"
import type { TalkMapClient } from "../opencode/client"
import { applyColorTag } from "./card-meta"
import { assignCardToGroup, deleteGroupFromMap } from "../groups/group-commands"
import { disconnectPinEdges, removeCardFromMap, removeEdgesFromMap, removeNodesFromMap } from "./map-mutations"
import { COMMENT_GROUP_TYPE, SESSION_CARD_TYPE } from "./flow-nodes"
import { applyRenameResult, commitCardTitle, type ViewState } from "./map-interactions"
import { pushAutoSync } from "../digest/autosync"
import { runDigest } from "../digest/run-digest"

export function patchReadyMap(
  setView: Dispatch<SetStateAction<ViewState>>,
  persistMap: (map: TalkMap) => void,
  mutate: (map: TalkMap) => TalkMap,
): void {
  setView((current) => {
    if (current.kind !== "ready") {
      return current
    }
    const nextMap = mutate(current.map)
    persistMap(nextMap)
    return { ...current, map: nextMap }
  })
}

export function colorTagCard(
  setView: Dispatch<SetStateAction<ViewState>>,
  persistMap: (map: TalkMap) => void,
  cardId: string,
  colorTag: string,
): void {
  patchReadyMap(setView, persistMap, (map) => applyColorTag(map, cardId, colorTag))
}

export function assignGroup(
  setView: Dispatch<SetStateAction<ViewState>>,
  persistMap: (map: TalkMap) => void,
  cardId: string,
  groupId: string | null,
): void {
  patchReadyMap(setView, persistMap, (map) => assignCardToGroup(map, cardId, groupId))
}

export function removeCard(
  setView: Dispatch<SetStateAction<ViewState>>,
  persistMap: (map: TalkMap) => void,
  cardId: string,
): void {
  patchReadyMap(setView, persistMap, (map) => removeCardFromMap(map, cardId))
}

export function removeGroup(
  setView: Dispatch<SetStateAction<ViewState>>,
  persistMap: (map: TalkMap) => void,
  groupId: string,
): void {
  patchReadyMap(setView, persistMap, (map) => deleteGroupFromMap(map, groupId))
}

export function removeFlowNodes(
  setView: Dispatch<SetStateAction<ViewState>>,
  persistMap: (map: TalkMap) => void,
  deleted: readonly { readonly id: string; readonly type?: string }[],
): void {
  patchReadyMap(setView, persistMap, (map) =>
    removeNodesFromMap(map, deleted, SESSION_CARD_TYPE, COMMENT_GROUP_TYPE),
  )
}

export function removeFlowEdges(
  setView: Dispatch<SetStateAction<ViewState>>,
  persistMap: (map: TalkMap) => void,
  edgeIds: readonly string[],
): void {
  patchReadyMap(setView, persistMap, (map) => removeEdgesFromMap(map, edgeIds))
}

export function breakPinConnections(
  setView: Dispatch<SetStateAction<ViewState>>,
  persistMap: (map: TalkMap) => void,
  setToast: Dispatch<SetStateAction<string | undefined>>,
  cardId: string,
  type: "source" | "target",
): void {
  patchReadyMap(setView, persistMap, (map) => {
    const result = disconnectPinEdges(map, cardId, type)
    if (result.removedCount > 0) {
      setToast(`已断开引脚连线 (${result.removedCount} 条)`)
    } else if (result.nativeCount > 0) {
      setToast("原生会话连线由后端维护，无法单独切断")
    } else {
      setToast("该引脚无连线")
    }
    return result.map
  })
}


export async function deleteLiveSession(input: {
  readonly client: TalkMapClient
  readonly view: ViewState
  readonly sessionId: string
  readonly cardId: string
  readonly onRemoveCard: (cardId: string) => void
  readonly setToast: Dispatch<SetStateAction<string | undefined>>
}): Promise<void> {
  try {
    if (input.view.kind === "ready" && input.view.directory !== undefined) {
      await input.client.deleteSession({
        sessionID: input.sessionId,
        directory: input.view.directory,
      })
    }
    input.onRemoveCard(input.cardId)
    input.setToast("会话已彻底删除")
  } catch (error: unknown) {
    if (error instanceof Error) {
      input.setToast("删除会话失败")
      return
    }
    throw error
  }
}

export function commitLiveTitle(input: {
  readonly view: ViewState
  readonly client: TalkMapClient
  readonly cardId: string
  readonly sessionId: string
  readonly ghost: boolean
  readonly title: string
  readonly mapRef: { current: TalkMap | undefined }
  readonly saveMap: (map: TalkMap) => Promise<void>
  readonly setView: Dispatch<SetStateAction<ViewState>>
  readonly setToast: Dispatch<SetStateAction<string | undefined>>
}): void {
  if (input.view.kind !== "ready" || input.view.directory === undefined) {
    return
  }
  const directory = input.view.directory
  void commitCardTitle({
    cardId: input.cardId,
    sessionId: input.sessionId,
    directory,
    ghost: input.ghost,
    title: input.title,
    updateSession: (call) => input.client.updateSession(call),
  })
    .then((committed) => {
      input.setView((current) => {
        const next = applyRenameResult(current, committed)
        if (next.kind === "ready") {
          input.mapRef.current = next.map
          if (
            current.kind === "ready" &&
            (next.map !== current.map || next.titles !== current.titles)
          ) {
            void input.saveMap(next.map)
          }
        }
        return next
      })
      if (committed.result.kind === "failed") {
        input.setToast(`Rename failed (${committed.result.status})`)
      }
    })
    .catch((error: unknown) => {
      if (error instanceof Error) {
        input.setToast(error.message)
        return
      }
      throw error
    })
}

export function refreshSessionDigest(input: {
  readonly view: ViewState
  readonly client: TalkMapClient
  readonly sessionId: string
  readonly autoSyncEnabled: boolean
  readonly sseConnected: boolean
  readonly persistMap: (map: TalkMap) => void
  readonly setView: Dispatch<SetStateAction<ViewState>>
  readonly setToast: Dispatch<SetStateAction<string | undefined>>
}): void {
  if (input.view.kind !== "ready" || input.view.directory === undefined) {
    return
  }
  const directory = input.view.directory
  const title = input.view.titles[input.sessionId] ?? input.sessionId
  void runDigest({
    client: input.client,
    map: input.view.map,
    directory,
    sessionId: input.sessionId,
    title,
  })
    .then((nextMap) => {
      input.persistMap(nextMap)
      input.setView((current) => (current.kind === "ready" ? { ...current, map: nextMap } : current))
      if (input.autoSyncEnabled) {
        return pushAutoSync({
          map: nextMap,
          sourceSessionId: input.sessionId,
          visible: document.visibilityState === "visible",
          sseConnected: input.sseConnected,
          promptNoReply: (call) => input.client.promptNoReply(call),
        })
      }
    })
    .catch((error: unknown) => {
      if (error instanceof Error) {
        input.setToast(error.message)
        return
      }
      throw error
    })
}
