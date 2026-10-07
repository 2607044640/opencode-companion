import type { SessionStatusPayload } from '../types/opencode'

/** How long a cached transcript may wait for /session/status before first paint. */
export const RUN_STATUS_PAINT_BUDGET_MS = 200

/**
 * Daemon GET /session/status is `{ [sessionID]: { type: idle|busy|retry } }`.
 * A missing id means the process is not running that session (crash, reboot, unknown).
 */
export function pickSessionRunStatus(table: unknown, sessionId: string): SessionStatusPayload | null {
  if (!sessionId || !table || typeof table !== 'object' || Array.isArray(table)) return null
  if (!Object.prototype.hasOwnProperty.call(table, sessionId)) return null
  return normalizeSessionStatus((table as Record<string, unknown>)[sessionId])
}

/**
 * Whole status map → one session.
 * An object that simply omits the id is idle (daemon up, session not running).
 * A missing or non-object body is unknown — callers must not invent busy.
 */
export function sessionStatusFromTable(table: unknown, sessionId: string): SessionStatusPayload | null {
  const picked = pickSessionRunStatus(table, sessionId)
  if (picked) return picked
  if (table && typeof table === 'object' && !Array.isArray(table)) return { type: 'idle' }
  return null
}

export function normalizeSessionStatus(raw: unknown): SessionStatusPayload {
  if (!raw || typeof raw !== 'object') return { type: 'idle' }
  const row = raw as {
    type?: unknown
    attempt?: unknown
    message?: unknown
    next?: unknown
  }
  if (row.type === 'busy') return { type: 'busy' }
  if (row.type === 'retry') {
    return {
      type: 'retry',
      ...(typeof row.attempt === 'number' ? { attempt: row.attempt } : {}),
      ...(typeof row.message === 'string' ? { message: row.message } : {}),
      ...(typeof row.next === 'number' ? { next: row.next } : {}),
    }
  }
  return { type: 'idle' }
}

export function isRunningStatus(status: SessionStatusPayload | null | undefined): boolean {
  return status?.type === 'busy' || status?.type === 'retry'
}

/** Chrome while /session/status has not answered. Never paint finished or retry from a guess. */
export type RunChrome = 'confirming' | 'running' | 'settled'

export function runChrome(runKnown: boolean, status: SessionStatusPayload | null | undefined): RunChrome {
  if (!runKnown) return 'confirming'
  return isRunningStatus(status) ? 'running' : 'settled'
}
