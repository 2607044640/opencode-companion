import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getStoredOpenTabs,
  saveStoredOpenTabs,
  getStoredActiveTab,
  saveStoredActiveTab,
  resolveInitialTabsState,
  OPEN_TABS_STORAGE_KEY,
  ACTIVE_TAB_STORAGE_KEY,
} from './tab-persistence'

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

describe('Tab Persistence Utilities (tab-persistence.ts)', () => {
  describe('getStoredOpenTabs & saveStoredOpenTabs', () => {
    it('returns empty array when storage is empty', () => {
      const storage = createMockStorage()
      assert.deepEqual(getStoredOpenTabs(storage), [])
    })

    it('returns empty array when stored data is invalid JSON', () => {
      const storage = createMockStorage({ [OPEN_TABS_STORAGE_KEY]: 'invalid json{' })
      assert.deepEqual(getStoredOpenTabs(storage), [])
    })

    it('returns empty array when stored data is not an array', () => {
      const storage = createMockStorage({ [OPEN_TABS_STORAGE_KEY]: JSON.stringify({ a: 1 }) })
      assert.deepEqual(getStoredOpenTabs(storage), [])
    })

    it('persists and restores open tabs preserving order and removing duplicates', () => {
      const storage = createMockStorage()
      saveStoredOpenTabs(['sess-1', 'sess-2', 'sess-3', 'sess-2', ''], storage)
      assert.deepEqual(getStoredOpenTabs(storage), ['sess-1', 'sess-2', 'sess-3'])
    })

    it('filters out non-string items safely from storage', () => {
      const storage = createMockStorage({
        [OPEN_TABS_STORAGE_KEY]: JSON.stringify(['sess-1', null, 123, 'sess-2', '   ']),
      })
      assert.deepEqual(getStoredOpenTabs(storage), ['sess-1', 'sess-2'])
    })
  })

  describe('getStoredActiveTab & saveStoredActiveTab', () => {
    it('returns null when active tab is not stored', () => {
      const storage = createMockStorage()
      assert.equal(getStoredActiveTab(storage), null)
    })

    it('persists and reads active tab ID', () => {
      const storage = createMockStorage()
      saveStoredActiveTab('sess-active-42', storage)
      assert.equal(getStoredActiveTab(storage), 'sess-active-42')
    })

    it('removes active tab key when active tab is set to null or empty', () => {
      const storage = createMockStorage({ [ACTIVE_TAB_STORAGE_KEY]: 'sess-1' })
      saveStoredActiveTab(null, storage)
      assert.equal(getStoredActiveTab(storage), null)
    })
  })

  describe('resolveInitialTabsState', () => {
    it('restores all open tabs and active tab on F5 refresh with ?session=s2', () => {
      const storage = createMockStorage({
        [OPEN_TABS_STORAGE_KEY]: JSON.stringify(['s1', 's2', 's3']),
        [ACTIVE_TAB_STORAGE_KEY]: 's2',
      })
      const result = resolveInitialTabsState({
        urlSearch: '?session=s2',
        storage,
      })
      assert.deepEqual(result.initialTabs, ['s1', 's2', 's3'])
      assert.equal(result.initialActiveId, 's2')
    })

    it('restores all open tabs and active tab on reopening app without query string', () => {
      const storage = createMockStorage({
        [OPEN_TABS_STORAGE_KEY]: JSON.stringify(['s1', 's2', 's3']),
        [ACTIVE_TAB_STORAGE_KEY]: 's2',
      })
      const result = resolveInitialTabsState({
        urlSearch: '',
        storage,
      })
      assert.deepEqual(result.initialTabs, ['s1', 's2', 's3'])
      assert.equal(result.initialActiveId, 's2')
    })

    it('appends deep-linked session to open tabs when opened via external link ?session=s4', () => {
      const storage = createMockStorage({
        [OPEN_TABS_STORAGE_KEY]: JSON.stringify(['s1', 's2', 's3']),
        [ACTIVE_TAB_STORAGE_KEY]: 's2',
      })
      const result = resolveInitialTabsState({
        urlSearch: '?session=s4',
        storage,
      })
      assert.deepEqual(result.initialTabs, ['s1', 's2', 's3', 's4'])
      assert.equal(result.initialActiveId, 's4')
    })

    it('falls back cleanly when storage is empty and URL has no session', () => {
      const storage = createMockStorage()
      const result = resolveInitialTabsState({
        urlSearch: '',
        storage,
      })
      assert.deepEqual(result.initialTabs, [])
      assert.equal(result.initialActiveId, null)
    })

    it('opens solely the deep-linked session when storage is empty', () => {
      const storage = createMockStorage()
      const result = resolveInitialTabsState({
        urlSearch: '?session=s-first',
        storage,
      })
      assert.deepEqual(result.initialTabs, ['s-first'])
      assert.equal(result.initialActiveId, 's-first')
    })

    it('preserves draft session tab __draft__ and active state across refreshes', () => {
      const storage = createMockStorage({
        [OPEN_TABS_STORAGE_KEY]: JSON.stringify(['s1', '__draft__']),
        [ACTIVE_TAB_STORAGE_KEY]: '__draft__',
      })
      const result = resolveInitialTabsState({
        urlSearch: '',
        storage,
        draftSessionId: '__draft__',
      })
      assert.deepEqual(result.initialTabs, ['s1', '__draft__'])
      assert.equal(result.initialActiveId, '__draft__')
    })

    it('defaults active ID to the last tab if stored active ID is missing or invalid', () => {
      const storage = createMockStorage({
        [OPEN_TABS_STORAGE_KEY]: JSON.stringify(['s1', 's2', 's3']),
      })
      const result = resolveInitialTabsState({
        urlSearch: '',
        storage,
      })
      assert.deepEqual(result.initialTabs, ['s1', 's2', 's3'])
      assert.equal(result.initialActiveId, 's3')
    })
  })
})
