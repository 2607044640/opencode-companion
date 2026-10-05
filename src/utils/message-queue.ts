import type { PromptAttachment } from '../types/opencode'

export interface QueuedPromptOptions {
  agent?: string
  model?: { providerID: string; modelID: string }
  attachments?: PromptAttachment[]
}

export interface QueuedMessage {
  id: string
  text: string
  options?: QueuedPromptOptions
  createdAt: number
}

/** Image rows the queue list can paint as a thumbnail. Non-images stay text-only. */
export function queuedImageAttachments(item: QueuedMessage): PromptAttachment[] {
  const list = item.options?.attachments
  if (!list || list.length === 0) return []
  return list.filter(
    (att) =>
      typeof att.mime === 'string' &&
      att.mime.startsWith('image/') &&
      typeof att.url === 'string' &&
      att.url.length > 0
  )
}

export interface QueueTurnSnapshot {
  /** Last assistant message carries a model/API error. */
  assistantHasError: boolean
  /** Hook-level error string (session.error / empty-idle fuse). Null when clean. */
  streamError: string | null
  /** True only when the user pressed Stop. User abort is not a model error. */
  userAborted: boolean
}

let queueSeq = 0

export function createQueuedMessage(
  text: string,
  options?: QueuedPromptOptions,
  now: number = Date.now()
): QueuedMessage {
  queueSeq += 1
  return {
    id: `q_${now}_${queueSeq}`,
    text,
    options,
    createdAt: now,
  }
}

export function enqueueMessage(queue: readonly QueuedMessage[], item: QueuedMessage): QueuedMessage[] {
  return [...queue, item]
}

export function removeQueuedMessage(queue: readonly QueuedMessage[], id: string): QueuedMessage[] {
  return queue.filter((item) => item.id !== id)
}

export function dequeueFirst(queue: readonly QueuedMessage[]): {
  item: QueuedMessage | null
  rest: QueuedMessage[]
} {
  if (queue.length === 0) return { item: null, rest: [] }
  return { item: queue[0], rest: queue.slice(1) }
}

/**
 * Auto-send the head of the queue only after a clean idle.
 * Model error, API error, empty-response fuse, and system abort all pause the queue.
 * A user Stop is not a model error, but it also does not auto-continue.
 */
const QUEUE_STORAGE_KEY = 'opencode_companion_prompt_queue'

const MAX_STORED_ATTACHMENT_CHARS = 1_500_000

function persistableAttachment(att: PromptAttachment): PromptAttachment | null {
  if (!att || typeof att.mime !== 'string' || typeof att.url !== 'string' || att.url.length === 0) return null
  if (att.url.length > MAX_STORED_ATTACHMENT_CHARS) return null
  return {
    mime: att.mime,
    url: att.url,
    name: typeof att.name === 'string' ? att.name : undefined,
  }
}

/** Drop empty or oversized attachments. Keep images so a refresh still shows the thumbnail. */
export function persistableQueue(queue: Record<string, QueuedMessage[]>): Record<string, QueuedMessage[]> {
  const next: Record<string, QueuedMessage[]> = {}
  for (const [sessionId, items] of Object.entries(queue)) {
    if (!Array.isArray(items) || items.length === 0) continue
    const kept: QueuedMessage[] = []
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || typeof item.text !== 'string') continue
      const options = item.options
      const attachments = Array.isArray(options?.attachments)
        ? options.attachments.map(persistableAttachment).filter((att): att is PromptAttachment => att !== null)
        : []
      kept.push({
        id: item.id,
        text: item.text,
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : 0,
        options: options
          ? {
              agent: typeof options.agent === 'string' ? options.agent : undefined,
              model:
                options.model && options.model.providerID && options.model.modelID
                  ? { providerID: options.model.providerID, modelID: options.model.modelID }
                  : undefined,
              attachments: attachments.length > 0 ? attachments : undefined,
            }
          : undefined,
      })
    }
    if (kept.length > 0) next[sessionId] = kept
  }
  return next
}

export function loadPersistedQueue(storage: Pick<Storage, 'getItem'> | undefined): Record<string, QueuedMessage[]> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(QUEUE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return persistableQueue(parsed as Record<string, QueuedMessage[]>)
  } catch {
    return {}
  }
}

export function savePersistedQueue(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined,
  queue: Record<string, QueuedMessage[]>
): void {
  if (!storage) return
  const slim = persistableQueue(queue)
  try {
    if (Object.keys(slim).length === 0) {
      storage.removeItem(QUEUE_STORAGE_KEY)
      return
    }
    storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(slim))
  } catch {
    // Quota or private mode. The in-memory queue still works for this tab.
  }
}

export function shouldAutoDispatchQueue(snapshot: QueueTurnSnapshot): boolean {
  if (snapshot.userAborted) return false
  if (snapshot.streamError) return false
  if (snapshot.assistantHasError) return false
  return true
}
