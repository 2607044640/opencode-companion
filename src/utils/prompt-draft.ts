/**
 * Prompt Draft Persistence Utility for OpenCode Companion
 * 
 * Ensures unsent prompt text and attachments remain persistent across
 * F5 page refreshes, tab switching, and window closing.
 */

import type { PromptAttachment } from '../types/opencode'

export const PROMPT_DRAFT_PREFIX = 'opencode_prompt_draft_'

export interface SavedPromptDraft {
  text: string
  attachments?: PromptAttachment[]
  updatedAt: number
}

function resolveStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return undefined
}

/**
 * Normalizes session ID into storage key.
 * Empty or draft sessions map to '__draft__'.
 */
export function getPromptDraftStorageKey(sessionId?: string | null): string {
  const normalized = sessionId && sessionId.trim() ? sessionId.trim() : '__draft__'
  return `${PROMPT_DRAFT_PREFIX}${normalized}`
}

/**
 * Safely reads stored prompt draft for a session from localStorage.
 */
export function getStoredPromptDraft(
  sessionId?: string | null,
  storage?: Storage
): SavedPromptDraft | null {
  try {
    const store = resolveStorage(storage)
    if (!store) return null
    const key = getPromptDraftStorageKey(sessionId)
    const raw = store.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedPromptDraft
    if (!parsed || typeof parsed !== 'object') return null

    const hasText = typeof parsed.text === 'string' && parsed.text.length > 0
    const hasAttachments = Array.isArray(parsed.attachments) && parsed.attachments.length > 0

    if (!hasText && !hasAttachments) {
      return null
    }

    return {
      text: typeof parsed.text === 'string' ? parsed.text : '',
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    }
  } catch (err) {
    console.error('Failed to read prompt draft from storage:', err)
    return null
  }
}

/**
 * Persists prompt draft for a session safely to localStorage.
 * Automatically clears the key if both text and attachments are empty.
 */
export function saveStoredPromptDraft(
  sessionId: string | null | undefined,
  draft: {
    text?: string
    attachments?: PromptAttachment[]
  },
  storage?: Storage
): void {
  try {
    const store = resolveStorage(storage)
    if (!store) return
    const key = getPromptDraftStorageKey(sessionId)
    const text = draft.text ?? ''
    const attachments = Array.isArray(draft.attachments) ? draft.attachments : []

    // If empty text and no attachments, delete key from storage
    if (!text.trim() && attachments.length === 0) {
      store.removeItem(key)
      return
    }

    const payload: SavedPromptDraft = {
      text,
      attachments,
      updatedAt: Date.now(),
    }
    store.setItem(key, JSON.stringify(payload))
  } catch (err) {
    console.error('Failed to save prompt draft to storage:', err)
  }
}

/**
 * Clears stored prompt draft for a specific session (e.g. after sending).
 */
export function clearStoredPromptDraft(
  sessionId?: string | null,
  storage?: Storage
): void {
  try {
    const store = resolveStorage(storage)
    if (!store) return
    const key = getPromptDraftStorageKey(sessionId)
    store.removeItem(key)
  } catch (err) {
    console.error('Failed to clear prompt draft from storage:', err)
  }
}
