import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getPromptDraftStorageKey,
  getStoredPromptDraft,
  saveStoredPromptDraft,
  clearStoredPromptDraft,
  PROMPT_DRAFT_PREFIX,
} from './prompt-draft'

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

describe('Prompt Draft Persistence (prompt-draft.ts)', () => {
  it('correctly maps session IDs and draft fallbacks to storage keys', () => {
    assert.equal(getPromptDraftStorageKey('ses_123'), `${PROMPT_DRAFT_PREFIX}ses_123`)
    assert.equal(getPromptDraftStorageKey('  ses_abc  '), `${PROMPT_DRAFT_PREFIX}ses_abc`)
    assert.equal(getPromptDraftStorageKey(''), `${PROMPT_DRAFT_PREFIX}__draft__`)
    assert.equal(getPromptDraftStorageKey(null), `${PROMPT_DRAFT_PREFIX}__draft__`)
    assert.equal(getPromptDraftStorageKey(undefined), `${PROMPT_DRAFT_PREFIX}__draft__`)
  })

  it('returns null when draft does not exist or storage is empty', () => {
    const storage = createMockStorage()
    assert.equal(getStoredPromptDraft('ses_none', storage), null)
    assert.equal(getStoredPromptDraft(null, storage), null)
  })

  it('handles corrupt JSON gracefully without throwing', () => {
    const storage = createMockStorage({
      [`${PROMPT_DRAFT_PREFIX}ses_bad`]: 'invalid-json{{{',
    })
    assert.equal(getStoredPromptDraft('ses_bad', storage), null)
  })

  it('saves and reads draft text correctly', () => {
    const storage = createMockStorage()
    saveStoredPromptDraft('ses_test', { text: 'Hello AI assistant' }, storage)

    const draft = getStoredPromptDraft('ses_test', storage)
    assert.ok(draft)
    assert.equal(draft.text, 'Hello AI assistant')
    assert.deepEqual(draft.attachments, [])
    assert.ok(typeof draft.updatedAt === 'number')
  })

  it('saves and reads draft with attachments correctly', () => {
    const storage = createMockStorage()
    const attachments = [{ id: 'att_1', name: 'photo.png', mime: 'image/png', url: 'blob://1' }]
    saveStoredPromptDraft('ses_with_att', { text: 'Look at this', attachments }, storage)

    const draft = getStoredPromptDraft('ses_with_att', storage)
    assert.ok(draft)
    assert.equal(draft.text, 'Look at this')
    assert.deepEqual(draft.attachments, attachments)
  })

  it('removes storage key when saving empty text and attachments', () => {
    const storage = createMockStorage()
    saveStoredPromptDraft('ses_to_clear', { text: 'Some text' }, storage)
    assert.ok(getStoredPromptDraft('ses_to_clear', storage))

    // Save with empty text and no attachments
    saveStoredPromptDraft('ses_to_clear', { text: '   ' }, storage)
    assert.equal(getStoredPromptDraft('ses_to_clear', storage), null)
    assert.equal(storage.getItem(`${PROMPT_DRAFT_PREFIX}ses_to_clear`), null)
  })

  it('clears draft explicitly via clearStoredPromptDraft', () => {
    const storage = createMockStorage()
    saveStoredPromptDraft('ses_sent', { text: 'Sent message' }, storage)
    assert.ok(getStoredPromptDraft('ses_sent', storage))

    clearStoredPromptDraft('ses_sent', storage)
    assert.equal(getStoredPromptDraft('ses_sent', storage), null)
  })
})
