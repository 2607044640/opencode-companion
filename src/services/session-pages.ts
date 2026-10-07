/**
 * The daemon ignores `offset` and `before`. It returns the newest
 * `limit` rows and nothing else, so a single `limit=500` permanently
 * hides every older session from the sidebar and from Ctrl+K.
 * Grow the limit until a page comes back shorter than requested.
 */

export const SESSION_LIST_START = 500
export const SESSION_LIST_STEP = 500
export const SESSION_LIST_CAP = 5000

export interface SessionPageRow {
  readonly id?: string
}

export function sessionListPath(limit: number, directory?: string): string {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (directory) params.set('directory', directory)
  return `/session?${params.toString()}`
}

export function sessionListExhausted(returned: number, requested: number): boolean {
  return returned < requested
}

export function nextSessionListLimit(current: number): number {
  return Math.min(current + SESSION_LIST_STEP, SESSION_LIST_CAP)
}
