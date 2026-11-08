import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Message } from '../types/opencode'
import {
  clearUserStop as clearUserStopAt,
  isTurnUserStopped as isTurnUserStoppedAt,
  markSystemAbort as markSystemAbortAt,
  markUserStop as markUserStopAt,
  resetStopRegistryForTests,
  SYSTEM_ABORT_GRACE_MS,
} from './stop-registry'

// Realistic epoch-ms base: values below 1e11 are read as seconds by the registry.
const T = 1_700_000_000_000
const markUserStop = (id: string, at: number) => markUserStopAt(id, T + at)
const clearUserStop = (id: string, at: number) => clearUserStopAt(id, T + at)
const markSystemAbort = (id: string, at: number) => markSystemAbortAt(id, T + at)
const isTurnUserStopped = (id: string, msgs: Message[], at: number) => isTurnUserStoppedAt(id, msgs, T + at)

function user(id: string, created: number): Message {
  return {
    info: { id, sessionID: 's1', role: 'user', time: { created: T + created } },
    parts: [],
  } as unknown as Message
}

function assistant(id: string, created: number, extra: Record<string, unknown> = {}): Message {
  return {
    info: { id, sessionID: 's1', role: 'assistant', time: { created: T + created }, ...extra },
    parts: [],
  } as unknown as Message
}

const ABORTED = { error: { name: 'MessageAbortedError', data: { message: 'The operation was aborted.' } } }

describe('stop-registry', () => {
  beforeEach(() => resetStopRegistryForTests())

  it('treats an aborted assistant tail as a user Stop even with no memory (tab switch, other client)', () => {
    const msgs = [user('u1', 1000), assistant('a1', 1001, ABORTED)]
    assert.equal(isTurnUserStopped('s1', msgs, 5000), true)
  })

  it('also treats finish=abort without an error as a Stop', () => {
    const msgs = [user('u1', 1000), assistant('a1', 1001, { finish: 'abort' })]
    assert.equal(isTurnUserStopped('s1', msgs, 5000), true)
  })

  it('does not treat a relay error or a clean finish as a Stop', () => {
    assert.equal(
      isTurnUserStopped('s1', [user('u1', 1), assistant('a1', 2, { error: { name: 'APIError', data: {} } })], 5000),
      false
    )
    assert.equal(isTurnUserStopped('s1', [user('u1', 1), assistant('a1', 2, { finish: 'stop' })], 5000), false)
  })

  it('remembers Stop even when the assistant shell has no abort marker yet', () => {
    markUserStop('s1', 10_000)
    const msgs = [user('u1', 9_000), assistant('a1', 9_500)]
    assert.equal(isTurnUserStopped('s1', msgs, 20_000), true)
  })

  it('lets go once a newer assistant turn exists after the Stop', () => {
    markUserStop('s1', 10_000)
    const msgs = [user('u1', 9_000), assistant('a1', 9_500), user('u2', 30_000), assistant('a2', 30_100)]
    assert.equal(isTurnUserStopped('s1', msgs, 40_000), false)
  })

  it('clearUserStop lifts the Stop (real user send)', () => {
    markUserStop('s1', 10_000)
    clearUserStop('s1', 10_500)
    const msgs = [user('u1', 9_000), assistant('a1', 9_500), user('u2', 10_600)]
    assert.equal(isTurnUserStopped('s1', msgs, 11_000), false)
  })

  it('a pending user message after an aborted turn is not a Stop', () => {
    const msgs = [user('u1', 1), assistant('a1', 2, ABORTED), user('u2', 3)]
    assert.equal(isTurnUserStopped('s1', msgs, 5000), false)
  })

  it('nudges (does not respect) an abort the companion issued itself within the grace window', () => {
    markSystemAbort('s1', 10_000)
    const msgs = [user('u1', 1), assistant('a1', 2, ABORTED)]
    assert.equal(isTurnUserStopped('s1', msgs, 10_000 + 1000), false)
    assert.equal(isTurnUserStopped('s1', msgs, 10_000 + SYSTEM_ABORT_GRACE_MS + 1), true)
  })

  it('a later user Stop overrides an earlier system abort mark', () => {
    markSystemAbort('s1', 10_000)
    markUserStop('s1', 12_000)
    const msgs = [user('u1', 1), assistant('a1', 2, ABORTED)]
    assert.equal(isTurnUserStopped('s1', msgs, 13_000), true)
  })

  it('is scoped per session', () => {
    markUserStop('s1', 10_000)
    assert.equal(isTurnUserStopped('s2', [user('u1', 1), assistant('a1', 2)], 11_000), false)
  })
})
