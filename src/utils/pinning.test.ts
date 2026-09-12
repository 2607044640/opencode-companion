import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getPinnedSessionIds,
  savePinnedSessionIds,
  togglePinSessionId,
  isSessionPinned,
  partitionPinnedSessions,
  PINNED_SESSIONS_STORAGE_KEY,
} from './pinning'

function createMockStorage(initialData: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initialData))
  return {
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    get length() {
      return store.size
    },
  }
}

describe('Session Pinning Utilities (pinning.ts)', () => {
  it('reads empty array when storage is empty or corrupt', () => {
    const emptyStorage = createMockStorage()
    assert.deepEqual(getPinnedSessionIds(emptyStorage), [])

    const corruptStorage = createMockStorage({ [PINNED_SESSIONS_STORAGE_KEY]: '{ invalid json' })
    assert.deepEqual(getPinnedSessionIds(corruptStorage), [])

    const nonArrayStorage = createMockStorage({ [PINNED_SESSIONS_STORAGE_KEY]: '{"foo":"bar"}' })
    assert.deepEqual(getPinnedSessionIds(nonArrayStorage), [])
  })

  it('reads valid pinned IDs and deduplicates them', () => {
    const storage = createMockStorage({
      [PINNED_SESSIONS_STORAGE_KEY]: JSON.stringify(['ses_1', 'ses_2', 'ses_1', '', '  ']),
    })
    assert.deepEqual(getPinnedSessionIds(storage), ['ses_1', 'ses_2'])
  })

  it('saves pinned session IDs to storage', () => {
    const storage = createMockStorage()
    savePinnedSessionIds(['ses_a', 'ses_b', 'ses_a'], storage)
    assert.equal(
      storage.getItem(PINNED_SESSIONS_STORAGE_KEY),
      JSON.stringify(['ses_a', 'ses_b'])
    )
  })

  it('toggles session pin on and off correctly', () => {
    const storage = createMockStorage({
      [PINNED_SESSIONS_STORAGE_KEY]: JSON.stringify(['ses_existing']),
    })

    // Pin a new session (should prepend to top)
    const res1 = togglePinSessionId('ses_new', storage)
    assert.equal(res1.pinned, true)
    assert.deepEqual(res1.pinnedIds, ['ses_new', 'ses_existing'])
    assert.equal(isSessionPinned('ses_new', res1.pinnedIds), true)

    // Unpin the newly pinned session
    const res2 = togglePinSessionId('ses_new', storage)
    assert.equal(res2.pinned, false)
    assert.deepEqual(res2.pinnedIds, ['ses_existing'])
    assert.equal(isSessionPinned('ses_new', res2.pinnedIds), false)
  })

  it('partitions sessions into pinned and unpinned groups preserving order', () => {
    const sessions = [
      { id: 's1', title: 'Session 1' },
      { id: 's2', title: 'Session 2' },
      { id: 's3', title: 'Session 3' },
      { id: 's4', title: 'Session 4' },
    ]

    const pinnedIds = ['s3', 's1']
    const result = partitionPinnedSessions(sessions, pinnedIds)

    assert.deepEqual(
      result.pinnedSessions.map((s) => s.id),
      ['s3', 's1']
    )
    assert.deepEqual(
      result.unpinnedSessions.map((s) => s.id),
      ['s2', 's4']
    )
  })
})
