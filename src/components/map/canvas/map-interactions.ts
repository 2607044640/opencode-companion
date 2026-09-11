import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from "react"
import { OpenCodeUnreachableError, type TalkMapClient } from "../opencode/client"
import type { TalkMap } from "../schema/talk-map"
import { commitTitle } from "./commit-title"
import { createUntitledFromPane, type CreateAtClickResult } from "./create-at-click"
import type { BootstrapReady } from "./map-bootstrap"
import { openSessionDeepLink } from "./open-session"

export type ReadyView = BootstrapReady & { readonly kind: "ready" }

export type ViewState =
  | { readonly kind: "loading" }
  | { readonly kind: "unreachable" }
  | ReadyView

export function defaultOpenWindow(url: string): Window | null {
  return window.open(url, "_blank", "noopener,noreferrer")
}

export async function defaultCopyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

export function openSessionFromCard(input: {
  readonly sessionId: string
  readonly openWindow: (url: string) => Window | null
  readonly copyText: (text: string) => Promise<void>
  readonly setToast: (url: string) => void
}): void {
  void openSessionDeepLink({
    sessionId: input.sessionId,
    openWindow: input.openWindow,
    copyText: input.copyText,
  }).then((result) => {
    if (result.kind === "copied") {
      input.setToast(result.url)
    }
  })
}

export function applyCreatedSession(
  current: ViewState,
  directory: string,
  created: CreateAtClickResult,
): ViewState {
  if (current.kind !== "ready" || current.directory !== directory) {
    return current
  }
  return {
    ...current,
    map: created.map,
    titles: { ...current.titles, [created.session.id]: created.session.title },
    updated: { ...current.updated, [created.session.id]: created.session.timeUpdated },
  }
}

export type RenameResultInput = {
  readonly cardId: string
  readonly sessionId: string
  readonly result:
    | { readonly kind: "live"; readonly title: string }
    | { readonly kind: "ghost"; readonly title: string }
    | { readonly kind: "failed"; readonly status: number }
}

export function applyRenameResult(current: ViewState, input: RenameResultInput): ViewState {
  if (current.kind !== "ready") {
    return current
  }
  if (input.result.kind === "failed") {
    return current
  }
  const card = current.map.cards[input.cardId]
  if (card === undefined) {
    return current
  }
  if (input.result.kind === "ghost") {
    return {
      ...current,
      map: {
        ...current.map,
        cards: {
          ...current.map.cards,
          [input.cardId]: { ...card, label: input.result.title },
        },
      },
    }
  }
  return {
    ...current,
    titles: { ...current.titles, [input.sessionId]: input.result.title },
  }
}

export type CommitCardTitleInput = {
  readonly cardId: string
  readonly sessionId: string
  readonly directory: string
  readonly ghost: boolean
  readonly title: string
  readonly updateSession: TalkMapClient["updateSession"]
}

export type CommitCardTitleResult = {
  readonly cardId: string
  readonly sessionId: string
  readonly result: Awaited<ReturnType<typeof commitTitle>>
}

export async function commitCardTitle(
  input: CommitCardTitleInput,
): Promise<CommitCardTitleResult> {
  const result = await commitTitle({
    ghost: input.ghost,
    sessionId: input.sessionId,
    directory: input.directory,
    title: input.title,
    updateSession: (call) => input.updateSession(call),
  })
  return { cardId: input.cardId, sessionId: input.sessionId, result }
}

export function handleCreateError(
  error: unknown,
  setView: Dispatch<SetStateAction<ViewState>>,
  setToast: Dispatch<SetStateAction<string | undefined>>,
): void {
  if (error instanceof OpenCodeUnreachableError) {
    setView({ kind: "unreachable" })
    return
  }
  if (error instanceof Error) {
    setToast(error.message)
    return
  }
  throw error
}

export function createFromPaneDoubleClick(input: {
  readonly event: ReactMouseEvent
  readonly view: ViewState
  readonly client: TalkMapClient
  readonly newCardId: () => string
  readonly screenToFlowPosition: (point: {
    readonly x: number
    readonly y: number
  }) => { readonly x: number; readonly y: number }
  readonly saveMap: (map: TalkMap) => Promise<void>
  readonly mapRef: { current: TalkMap | undefined }
  readonly setView: Dispatch<SetStateAction<ViewState>>
  readonly setToast: Dispatch<SetStateAction<string | undefined>>
}): void {
  if (input.view.kind !== "ready" || input.view.directory === undefined) {
    return
  }
  const directory = input.view.directory
  void createUntitledFromPane({
    target: input.event.target,
    clientX: input.event.clientX,
    clientY: input.event.clientY,
    directory,
    map: input.view.map,
    client: input.client,
    newCardId: input.newCardId,
    screenToFlowPosition: input.screenToFlowPosition,
  })
    .then((created) => {
      if (created === undefined) {
        return
      }
      input.mapRef.current = created.map
      input.setView((current) => applyCreatedSession(current, directory, created))
      void input.saveMap(created.map)
    })
    .catch((error: unknown) => {
      handleCreateError(error, input.setView, input.setToast)
    })
}
