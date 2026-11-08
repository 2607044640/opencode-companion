import type { Message } from '../types/opencode'
import { isAbortError } from '../services/api'

/**
 * Durable "the user pressed Stop" memory for auto-recovery (go on / empty retry).
 *
 * Why this exists: `userAbortedRef` lives inside one hook instance and is reset when the
 * session tab is switched away and back (or the page reloads). The daemon stamps a stopped
 * assistant with `MessageAbortedError`, which auto-recovery used to read as a relay cut and
 * answer with "go on". Stop must survive remounts, and a Stop issued elsewhere (TUI, another
 * window) must be recognised from the message history itself.
 *
 * Rules:
 *  - A user Stop is remembered per session until the user sends something real.
 *  - A history tail that is an aborted assistant counts as a user Stop, unless the companion
 *    itself aborted a stalled stream a moment ago (system abort), which should be nudged.
 *  - Auto-sent prompts never clear a Stop; only a real user send does.
 */

const STORAGE_KEY = 'oc-companion:stop-registry:v1'
/** A Stop stays relevant until a newer assistant turn exists; this is only a clock-skew pad. */
const NEWER_TURN_PAD_MS = 5_000
/** How long an aborted tail is attributed to our own stall-abort instead of the user. */
export const SYSTEM_ABORT_GRACE_MS = 120_000
const ENTRY_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface StopEntry {
  userStopAt?: number
  systemAbortAt?: number
}

type Store = Record<string, StopEntry>

let memoryStore: Store = {}

function readStore(now: number): Store {
  try {
    if (typeof localStorage === 'undefined') return memoryStore
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: Store = raw ? JSON.parse(raw) : {}
    const next: Store = {}
    for (const [id, entry] of Object.entries(parsed)) {
      const stamp = Math.max(entry?.userStopAt ?? 0, entry?.systemAbortAt ?? 0)
      if (stamp > 0 && now - stamp < ENTRY_TTL_MS) next[id] = entry
    }
    return next
  } catch {
    return memoryStore
  }
}

function writeStore(store: Store): void {
  memoryStore = store
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    }
  } catch {
    // Storage may be unavailable or full; the in-memory copy still protects this page.
  }
}

function update(sessionId: string, now: number, patch: (entry: StopEntry) => StopEntry | null): void {
  if (!sessionId) return
  const store = readStore(now)
  const next = patch(store[sessionId] ?? {})
  if (next && (next.userStopAt || next.systemAbortAt)) store[sessionId] = next
  else delete store[sessionId]
  writeStore(store)
}

export function markUserStop(sessionId: string, now = Date.now()): void {
  update(sessionId, now, (entry) => ({ ...entry, userStopAt: now, systemAbortAt: undefined }))
}

/** The user sent a real prompt (or pressed Retry): auto-recovery is allowed again. */
export function clearUserStop(sessionId: string, now = Date.now()): void {
  update(sessionId, now, (entry) => (entry.systemAbortAt ? { systemAbortAt: entry.systemAbortAt } : null))
}

/** Call right before the companion aborts a stalled stream itself, so it is nudged, not respected. */
export function markSystemAbort(sessionId: string, now = Date.now()): void {
  update(sessionId, now, (entry) => ({ ...entry, systemAbortAt: now }))
}

function toMs(value: unknown): number {
  const n = Number(value || 0)
  return n > 0 && n < 1e11 ? n * 1000 : n
}

function isAbortedAssistant(message: Message | undefined): boolean {
  if (!message || message.info.role !== 'assistant') return false
  if (message.info.error) return isAbortError(message.info.error)
  return message.info.finish === 'abort'
}

/**
 * True when the current turn ended because the user stopped it.
 * Used as a hard gate before any automatic "go on" or empty-turn resend.
 */
export function isTurnUserStopped(
  sessionId: string | null | undefined,
  messages: readonly Message[],
  now = Date.now()
): boolean {
  if (!sessionId) return false
  const entry = readStore(now)[sessionId]

  if (entry?.userStopAt) {
    let lastAssistant: Message | undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].info.role === 'assistant') {
        lastAssistant = messages[i]
        break
      }
    }
    const createdMs = toMs(lastAssistant?.info.time?.created)
    // A newer assistant turn means the session moved on after the Stop (new prompt from elsewhere).
    if (!lastAssistant || createdMs <= entry.userStopAt + NEWER_TURN_PAD_MS) return true
  }

  if (isAbortedAssistant(messages[messages.length - 1])) {
    const systemAt = entry?.systemAbortAt ?? 0
    if (systemAt > 0 && now - systemAt <= SYSTEM_ABORT_GRACE_MS) return false
    return true
  }
  return false
}

/** Test helper: forget everything held in memory and storage. */
export function resetStopRegistryForTests(): void {
  memoryStore = {}
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
