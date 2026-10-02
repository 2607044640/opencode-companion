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
export function shouldAutoDispatchQueue(snapshot: QueueTurnSnapshot): boolean {
  if (snapshot.userAborted) return false
  if (snapshot.streamError) return false
  if (snapshot.assistantHasError) return false
  return true
}
