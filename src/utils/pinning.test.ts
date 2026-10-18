import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getPinnedSessionIds,
  savePinnedSessionIds,
  togglePinSessionId,
  isSessionPinned,
  partitionPinnedSessions,
  reorderPinnedSessionIds,
  unpinSessionId,
  sortProjectsByLatestActivity,
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

  it('reorders pinned session IDs using move-to-index semantics', () => {
    const storage = createMockStorage({
      [PINNED_SESSIONS_STORAGE_KEY]: JSON.stringify(['a', 'b', 'c']),
    })

    // Drag 'c' before 'a' -> ['c', 'a', 'b']
    const res1 = reorderPinnedSessionIds('c', 'a', storage)
    assert.deepEqual(res1, ['c', 'a', 'b'])
    assert.deepEqual(getPinnedSessionIds(storage), ['c', 'a', 'b'])

    // Drag 'c' to 'b' -> ['a', 'b', 'c']
    const res2 = reorderPinnedSessionIds('c', 'b', storage)
    assert.deepEqual(res2, ['a', 'b', 'c'])
    assert.deepEqual(getPinnedSessionIds(storage), ['a', 'b', 'c'])

    // Drag 'a' to 'c' -> ['b', 'c', 'a']
    const res3 = reorderPinnedSessionIds('a', 'c', storage)
    assert.deepEqual(res3, ['b', 'c', 'a'])
    assert.deepEqual(getPinnedSessionIds(storage), ['b', 'c', 'a'])
  })

  it('preserves hidden archived IDs in full storage array when reordering', () => {
    const storage = createMockStorage({
      [PINNED_SESSIONS_STORAGE_KEY]: JSON.stringify(['a', 'b_arch', 'c']),
    })

    // Drag 'c' before 'a' -> ['c', 'a', 'b_arch']
    const res = reorderPinnedSessionIds('c', 'a', storage)
    assert.deepEqual(res, ['c', 'a', 'b_arch'])
    assert.deepEqual(getPinnedSessionIds(storage), ['c', 'a', 'b_arch'])
  })

  it('no-ops without modifying storage on identical or unknown IDs', () => {
    const storage = createMockStorage({
      [PINNED_SESSIONS_STORAGE_KEY]: JSON.stringify(['x', 'y', 'z']),
    })

    // fromId === toId
    const res1 = reorderPinnedSessionIds('x', 'x', storage)
    assert.deepEqual(res1, ['x', 'y', 'z'])

    // unknown fromId
    const res2 = reorderPinnedSessionIds('unknown', 'y', storage)
    assert.deepEqual(res2, ['x', 'y', 'z'])

    // unknown toId
    const res3 = reorderPinnedSessionIds('x', 'unknown', storage)
    assert.deepEqual(res3, ['x', 'y', 'z'])
  })

  it('unpins session explicitly using unpinSessionId', () => {
    const storage = createMockStorage({
      [PINNED_SESSIONS_STORAGE_KEY]: JSON.stringify(['p1', 'p2', 'p3']),
    })

    const updated = unpinSessionId('p2', storage)
    assert.deepEqual(updated, ['p1', 'p3'])
    assert.deepEqual(getPinnedSessionIds(storage), ['p1', 'p3'])

    // No-op for non-existent session
    const noop = unpinSessionId('non_existent', storage)
    assert.deepEqual(noop, ['p1', 'p3'])
  })

  it('dynamically re-sorts projects when top session is pinned/hidden vs unpinned (User scenario)', () => {
    const projAPISpace = { id: 'proj_api', name: 'APISpace' }
    const projObsidian = { id: 'proj_obs', name: 'ObsidianDev' }
    const projEmpty = { id: 'proj_empty', name: 'EmptyProject' }

    const projects = [projAPISpace, projObsidian, projEmpty]

    // Scenario:
    // Session 1 (in APISpace): updated at 12:00 (timestamp 1200)
    // Session 2 (in APISpace): updated at 08:00 (timestamp 800, 16h ago)
    // Session 3 (in ObsidianDev): updated at 10:00 (timestamp 1000, 2h ago)
    const s1_pinned = { id: 's1', time: { updated: 1200 } }
    const s2_unpinned = { id: 's2', time: { updated: 800 } }
    const s3_unpinned = { id: 's3', time: { updated: 1000 } }

    // Case 1: When s1 is pinned, APISpace's visible sessions only include s2 (timestamp 800)
    // ObsidianDev's visible sessions include s3 (timestamp 1000)
    // Result: ObsidianDev (1000) MUST sort before APISpace (800)!
    const mapWhenPinned = new Map<string, any[]>([
      ['proj_api', [s2_unpinned]], // s1 is hidden because it is pinned
      ['proj_obs', [s3_unpinned]],
      ['proj_empty', []],
    ])

    const sortedWhenPinned = sortProjectsByLatestActivity(projects, mapWhenPinned)
    assert.deepEqual(
      sortedWhenPinned.map((p) => p.name),
      ['ObsidianDev', 'APISpace', 'EmptyProject'],
      'ObsidianDev must rank above APISpace when APISpace top session is pinned/hidden'
    )

    // Case 2: When s1 is unpinned, s1 returns to APISpace's visible sessions (timestamp 1200)
    // Result: APISpace (1200) MUST jump back to rank above ObsidianDev (1000)!
    const mapWhenUnpinned = new Map<string, any[]>([
      ['proj_api', [s1_pinned, s2_unpinned]], // s1 returned to APISpace
      ['proj_obs', [s3_unpinned]],
      ['proj_empty', []],
    ])

    const sortedWhenUnpinned = sortProjectsByLatestActivity(projects, mapWhenUnpinned)
    assert.deepEqual(
      sortedWhenUnpinned.map((p) => p.name),
      ['APISpace', 'ObsidianDev', 'EmptyProject'],
      'APISpace must rank above ObsidianDev when top session is unpinned and returns'
    )
  })
})

