import type { TalkMap } from "../schema/talk-map"
import type { ParsedSseEvent } from "../opencode/sse"
import { applySessionCreated, applySessionDeleted } from "./session-sync"
import { assertNever } from "./assert-never"
import type { SessionRunning, SessionTitles, SessionUpdated } from "./map-bootstrap"

export type LiveBoard = {
  readonly map: TalkMap
  readonly titles: SessionTitles
  readonly running: SessionRunning
  readonly updated: SessionUpdated
}

export type ApplyLiveEventInput = {
  readonly board: LiveBoard
  readonly directory: string
  readonly event: ParsedSseEvent
  readonly newCardId: () => string
}

export function applyLiveEvent(input: ApplyLiveEventInput): LiveBoard {
  const { event, board, directory, newCardId } = input
  switch (event.kind) {
    case "ignored":
      return board
    case "deleted":
      return {
        map: applySessionDeleted(board.map, event.sessionId),
        titles: board.titles,
        running: { ...board.running, [event.sessionId]: false },
        updated: board.updated,
      }
    case "created":
      return {
        map: applySessionCreated({
          map: board.map,
          session: event.session,
          directory,
          newCardId,
        }),
        titles: { ...board.titles, [event.session.id]: event.session.title },
        running: board.running,
        updated: { ...board.updated, [event.session.id]: event.session.timeUpdated },
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
