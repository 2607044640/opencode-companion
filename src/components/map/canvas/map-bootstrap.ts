import type { TalkMap } from "../schema/talk-map"
import {
  OpenCodeUnreachableError,
  type ListedProject,
  type ListedSession,
  type SessionRunState,
  type TalkMapClient,
} from "../opencode/client"
import { syncSessions } from "./session-sync"
import { pickDefaultDirectory, selectableProjects } from "./project-directory"
import { assertNever } from "./assert-never"

export type SessionTitles = Readonly<Record<string, string>>
export type SessionRunning = Readonly<Record<string, boolean>>
export type SessionUpdated = Readonly<Record<string, number>>

export type BootstrapReady = {
  readonly kind: "ready"
  readonly map: TalkMap
  readonly directory: string | undefined
  readonly projects: readonly ListedProject[]
  readonly titles: SessionTitles
  readonly running: SessionRunning
  readonly updated: SessionUpdated
}

export type BootstrapUnreachable = {
  readonly kind: "unreachable"
}

export type BootstrapResult = BootstrapReady | BootstrapUnreachable

export type BootstrapMapInput = {
  readonly client: TalkMapClient
  readonly loadMap: () => Promise<TalkMap>
  readonly newCardId: () => string
  readonly directory?: string
}

export function isRunningState(state: SessionRunState): boolean {
  switch (state) {
    case "busy":
    case "retry":
      return true
    case "idle":
      return false
    default:
      return assertNever(state)
  }
}

export function titlesFromSessions(
  sessions: readonly ListedSession[],
): Record<string, string> {
  const titles: Record<string, string> = {}
  for (const session of sessions) {
    titles[session.id] = session.title
  }
  return titles
}

export function updatedFromSessions(
  sessions: readonly ListedSession[],
): Record<string, number> {
  const updated: Record<string, number> = {}
  for (const session of sessions) {
    updated[session.id] = session.timeUpdated
  }
  return updated
}

export function runningFromStatus(
  status: Readonly<Record<string, SessionRunState>>,
): Record<string, boolean> {
  const running: Record<string, boolean> = {}
  for (const [sessionId, state] of Object.entries(status)) {
    running[sessionId] = isRunningState(state)
  }
  return running
}

export async function bootstrapMap(input: BootstrapMapInput): Promise<BootstrapResult> {
  try {
    const saved = await input.loadMap()
    const listed = await input.client.listProjects()
    const projects = selectableProjects(listed)
    const directory = input.directory ?? pickDefaultDirectory(listed)
    if (directory === undefined) {
      return {
        kind: "ready",
        map: saved,
        directory: undefined,
        projects,
        titles: {},
        running: {},
        updated: {},
      }
    }
    const sessions = await input.client.listSessions(directory)
    const status = await input.client.listStatus(directory)
    const map = syncSessions({
      map: saved,
      sessions,
      directory,
      newCardId: input.newCardId,
    })
    return {
      kind: "ready",
      map,
      directory,
      projects,
      titles: titlesFromSessions(sessions),
      running: runningFromStatus(status),
      updated: updatedFromSessions(sessions),
    }
  } catch (error) {
    if (error instanceof OpenCodeUnreachableError) {
      return { kind: "unreachable" }
    }
    throw error
  }
}
