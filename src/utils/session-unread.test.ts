import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getUnreadSessionIds,
  saveUnreadSessionIds,
  markSessionUnread,
  markSessionRead,
  isSessionUnread,
  markHumanInitiated,
  isHumanInitiated,
  clearHumanInitiated,
  handleSessionCompletion,
  UNREAD_SESSIONS_STORAGE_KEY,
  HUMAN_PENDING_STORAGE_KEY,
} from './session-unread'

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

describe('Session Unread Utilities (session-unread.ts)', () => {
  describe('Unread Storage CRUD', () => {
    it('returns empty array when storage is empty or invalid', () => {
      const storage = createMockStorage()
      assert.deepEqual(getUnreadSessionIds(storage), [])

      const corrupt = createMockStorage({ [UNREAD_SESSIONS_STORAGE_KEY]: 'invalid json{' })
      assert.deepEqual(getUnreadSessionIds(corrupt), [])
    })

    it('marks a session as unread and removes duplicates', () => {
      const storage = createMockStorage()
      const ids1 = markSessionUnread('session-1', storage)
      assert.deepEqual(ids1, ['session-1'])

      // Calling again should not duplicate
      const ids2 = markSessionUnread('session-1', storage)
      assert.deepEqual(ids2, ['session-1'])

      const ids3 = markSessionUnread('session-2', storage)
      assert.deepEqual(ids3, ['session-1', 'session-2'])
      assert.equal(isSessionUnread('session-1', ids3), true)
      assert.equal(isSessionUnread('session-3', ids3), false)
    })

    it('marks a session as read', () => {
      const storage = createMockStorage({
        [UNREAD_SESSIONS_STORAGE_KEY]: JSON.stringify(['session-1', 'session-2']),
      })
      const remaining = markSessionRead('session-1', storage)
      assert.deepEqual(remaining, ['session-2'])
      assert.equal(isSessionUnread('session-1', remaining), false)
      assert.equal(isSessionUnread('session-2', remaining), true)
    })
  })

  describe('Human vs AI Origin Tracking & Completion', () => {
    it('tracks human initiated prompts in session storage', () => {
      const sessionStorage = createMockStorage()
      assert.equal(isHumanInitiated('session-human', sessionStorage), false)

      markHumanInitiated('session-human', sessionStorage)
      assert.equal(isHumanInitiated('session-human', sessionStorage), true)

      clearHumanInitiated('session-human', sessionStorage)
      assert.equal(isHumanInitiated('session-human', sessionStorage), false)
    })

    it('marks unread when human sent the prompt and AI completes', () => {
      const localStorage = createMockStorage()
      const sessionStorage = createMockStorage()

      // 1. Human sends a message in companion UI
      markHumanInitiated('session-human-1', sessionStorage)
      assert.equal(isHumanInitiated('session-human-1', sessionStorage), true)

      // 2. AI finishes generating -> triggers handleSessionCompletion
      const wasMarked = handleSessionCompletion('session-human-1', localStorage, sessionStorage)
      assert.equal(wasMarked, true)

      // Unread state should now be active with blue indicator
      const unread = getUnreadSessionIds(localStorage)
      assert.deepEqual(unread, ['session-human-1'])
      assert.equal(isSessionUnread('session-human-1', unread), true)

      // Human pending flag should be cleared
      assert.equal(isHumanInitiated('session-human-1', sessionStorage), false)
    })

    it('DOES NOT mark unread when AI or automated task runs (e.g. /RelayAPIVetting)', () => {
      const localStorage = createMockStorage()
      const sessionStorage = createMockStorage()

      // Automated AI task (e.g. /RelayAPIVetting or script) runs on session-vetting-1
      // It does NOT call markHumanInitiated!
      assert.equal(isHumanInitiated('session-vetting-1', sessionStorage), false)

      // AI completes on session-vetting-1
      const wasMarked = handleSessionCompletion('session-vetting-1', localStorage, sessionStorage)
      assert.equal(wasMarked, false)

      // Unread list remains empty!
      assert.deepEqual(getUnreadSessionIds(localStorage), [])
      assert.equal(isSessionUnread('session-vetting-1', []), false)
    })
  })
})
