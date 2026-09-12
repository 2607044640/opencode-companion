import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getArchivedSessionIds,
  saveArchivedSessionIds,
  archiveSessionId,
  unarchiveSessionId,
  toggleArchiveSessionId,
  isSessionArchived,
  partitionArchivedSessions,
  ARCHIVED_SESSIONS_STORAGE_KEY,
} from './archiving'
import {
  PINNED_SESSIONS_STORAGE_KEY,
  savePinnedSessionIds,
  getPinnedSessionIds,
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

describe('Session Archiving Utilities (archiving.ts)', () => {
  it('returns empty array when storage is empty or corrupt', () => {
    const emptyStorage = createMockStorage()
    assert.deepEqual(getArchivedSessionIds(emptyStorage), [])

    const corruptStorage = createMockStorage({ [ARCHIVED_SESSIONS_STORAGE_KEY]: '{ invalid json' })
    assert.deepEqual(getArchivedSessionIds(corruptStorage), [])

    const nonArrayStorage = createMockStorage({ [ARCHIVED_SESSIONS_STORAGE_KEY]: '{"foo":"bar"}' })
    assert.deepEqual(getArchivedSessionIds(nonArrayStorage), [])
  })

  it('reads valid archived IDs and deduplicates them', () => {
    const storage = createMockStorage({
      [ARCHIVED_SESSIONS_STORAGE_KEY]: JSON.stringify(['ses_1', 'ses_2', 'ses_1', '', '  ']),
    })
    assert.deepEqual(getArchivedSessionIds(storage), ['ses_1', 'ses_2'])
  })

  it('saves archived session IDs to storage', () => {
    const storage = createMockStorage()
    saveArchivedSessionIds(['ses_a', 'ses_b', 'ses_a'], storage)
    assert.equal(
      storage.getItem(ARCHIVED_SESSIONS_STORAGE_KEY),
      JSON.stringify(['ses_a', 'ses_b'])
    )
  })

  it('archives a session and automatically unpins it if pinned', () => {
    const storage = createMockStorage()
    savePinnedSessionIds(['ses_arch_target', 'ses_other'], storage)

    const res = archiveSessionId('ses_arch_target', storage)
    assert.equal(res.archived, true)
    assert.deepEqual(res.archivedIds, ['ses_arch_target'])
    assert.equal(isSessionArchived('ses_arch_target', res.archivedIds), true)

    // Verify unpinned
    const pinnedAfter = getPinnedSessionIds(storage)
    assert.deepEqual(pinnedAfter, ['ses_other'])
  })

  it('unarchives a session correctly', () => {
    const storage = createMockStorage({
      [ARCHIVED_SESSIONS_STORAGE_KEY]: JSON.stringify(['s1', 's2', 's3']),
    })

    const res = unarchiveSessionId('s2', storage)
    assert.equal(res.archived, false)
    assert.deepEqual(res.archivedIds, ['s1', 's3'])
    assert.equal(isSessionArchived('s2', res.archivedIds), false)
  })

  it('toggles archive status on and off', () => {
    const storage = createMockStorage()
    const res1 = toggleArchiveSessionId('ses_toggle', storage)
    assert.equal(res1.archived, true)
    assert.deepEqual(res1.archivedIds, ['ses_toggle'])

    const res2 = toggleArchiveSessionId('ses_toggle', storage)
    assert.equal(res2.archived, false)
    assert.deepEqual(res2.archivedIds, [])
  })

  it('partitions sessions into active and archived lists', () => {
    const sessions = [
      { id: 's1', title: 'Session 1' },
      { id: 's2', title: 'Session 2' },
      { id: 's3', title: 'Session 3' },
      { id: 's4', title: 'Session 4' },
    ]
    const archivedIds = ['s3', 's1']
    const partitioned = partitionArchivedSessions(sessions, archivedIds)

    assert.deepEqual(
      partitioned.activeSessions.map((s) => s.id),
      ['s2', 's4']
    )
    assert.deepEqual(
      partitioned.archivedSessions.map((s) => s.id),
      ['s3', 's1']
    )
  })
})
