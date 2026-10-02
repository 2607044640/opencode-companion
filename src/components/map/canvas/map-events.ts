import type { TalkMap } from "../schema/talk-map"
import type { ParsedSseEvent } from "../opencode/sse"
import { applySessionDeleted } from "./session-sync"
import { assertNever } from "./assert-never"
import type { SessionRunning, SessionTitles, SessionUpdated } from "./map-bootstrap"
import type { ListedSession } from "../opencode/client"

export type LiveBoard = {
  readonly map: TalkMap
  readonly titles: SessionTitles
  readonly running: SessionRunning
  readonly updated: SessionUpdated
  readonly sessions?: readonly ListedSession[]
}

export type ApplyLiveEventInput = {
  readonly board: LiveBoard
  readonly directory: string
  readonly event: ParsedSseEvent
  readonly newCardId: () => string
}

export function applyLiveEvent(input: ApplyLiveEventInput): LiveBoard {
  const { event, board } = input
  switch (event.kind) {
    case "ignored":
      return board
    case "deleted":
      return {
        map: applySessionDeleted(board.map, event.sessionId),
        titles: board.titles,
        running: { ...board.running, [event.sessionId]: false },
        updated: board.updated,
        sessions: board.sessions ? board.sessions.filter((s) => s.id !== event.sessionId) : undefined,
      }
    case "created":
      return {
        map: board.map,
        titles: { ...board.titles, [event.session.id]: event.session.title },
        running: board.running,
        updated: { ...board.updated, [event.session.id]: event.session.timeUpdated },
        sessions: board.sessions
          ? [...board.sessions.filter((s) => s.id !== event.session.id), event.session]
          : [event.session],
      }
    case "status":
      return {
        map: board.map,
        titles: board.titles,
        running: { ...board.running, [event.sessionId]: event.running },
        updated: board.updated,
      }
    default:
      return assertNever(event)
  }
}
