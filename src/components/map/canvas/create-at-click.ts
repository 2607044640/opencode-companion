import type { ListedSession, TalkMapClient } from "../opencode/client"
import type { TalkMap } from "../schema/talk-map"
import { applySessionCreated } from "./session-sync"

export type CreateAtClickInput = {
  readonly client: TalkMapClient
  readonly map: TalkMap
  readonly directory: string
  readonly position: { readonly x: number; readonly y: number }
  readonly newCardId: () => string
}

export type CreateAtClickResult = {
  readonly map: TalkMap
  readonly session: ListedSession
}

type ClosestTarget = {
  readonly closest: (selector: string) => unknown
}

function asClosestTarget(target: EventTarget | null): ClosestTarget | undefined {
  if (target === null || typeof target !== "object") {
    return undefined
  }
  if (!("closest" in target)) {
    return undefined
  }
  const closest = target.closest
  if (typeof closest !== "function") {
    return undefined
  }
  return { closest: closest.bind(target) }
}

export function isPaneDoubleClickTarget(target: EventTarget | null): boolean {
  const el = asClosestTarget(target)
  if (el === undefined) {
    return false
  }
  if (el.closest(".react-flow__node") !== null) {
    return false
  }
  if (el.closest(".react-flow__edge") !== null) {
    return false
  }
  return el.closest(".react-flow__pane") !== null || el.closest(".react-flow__renderer") !== null
}

export type PaneCreateInput = {
  readonly target: EventTarget | null
  readonly clientX: number
  readonly clientY: number
  readonly directory: string
  readonly map: TalkMap
  readonly client: TalkMapClient
  readonly newCardId: () => string
  readonly screenToFlowPosition: (point: {
    readonly x: number
    readonly y: number
  }) => { readonly x: number; readonly y: number }
}

export async function createUntitledFromPane(
  input: PaneCreateInput,
): Promise<CreateAtClickResult | undefined> {
  if (!isPaneDoubleClickTarget(input.target)) {
    return undefined
  }
  return createUntitledAtClick({
    client: input.client,
    map: input.map,
    directory: input.directory,
    position: input.screenToFlowPosition({ x: input.clientX, y: input.clientY }),
    newCardId: input.newCardId,
  })
}

export async function createUntitledAtClick(
  input: CreateAtClickInput,
): Promise<CreateAtClickResult> {
  const session = await input.client.createSession(input.directory)
  return {
    session,
    map: applySessionCreated({
      map: input.map,
      session,
      directory: input.directory,
      newCardId: input.newCardId,
      position: input.position,
    }),
  }
}
