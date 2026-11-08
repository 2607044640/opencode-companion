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
  model?: { providerID: string; modelID: string; name?: string }
  agent?: string
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
    const hasModel = Boolean(parsed.model && typeof parsed.model === 'object' && parsed.model.modelID)
    const hasAgent = typeof parsed.agent === 'string' && Boolean(parsed.agent.trim())

    if (!hasText && !hasAttachments && !hasModel && !hasAgent) {
      return null
    }

    return {
      text: typeof parsed.text === 'string' ? parsed.text : '',
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      model: hasModel ? parsed.model : undefined,
      agent: hasAgent ? parsed.agent : undefined,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    }
  } catch (err) {
    console.error('Failed to read prompt draft from storage:', err)
    return null
  }
}

/**
 * Persists prompt draft for a session safely to localStorage.
 * Automatically clears the key if text, attachments, model, and agent are all empty.
 */
export function saveStoredPromptDraft(
  sessionId: string | null | undefined,
  draft: {
    text?: string
    attachments?: PromptAttachment[]
    model?: { providerID: string; modelID: string; name?: string }
    agent?: string
  },
  storage?: Storage
): void {
  try {
    const store = resolveStorage(storage)
    if (!store) return
    const key = getPromptDraftStorageKey(sessionId)
    const text = draft.text ?? ''
    const attachments = Array.isArray(draft.attachments) ? draft.attachments : []
    const model = draft.model && draft.model.modelID ? draft.model : undefined
    const agent = draft.agent && draft.agent.trim() ? draft.agent.trim() : undefined

    // If empty text, no attachments, and no model/agent override, delete key from storage
    if (!text.trim() && attachments.length === 0 && !model && !agent) {
      store.removeItem(key)
      return
    }

    const payload: SavedPromptDraft = {
      text,
      attachments,
      ...(model ? { model } : {}),
      ...(agent ? { agent } : {}),
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
