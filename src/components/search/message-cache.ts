import type { Message, TextPart } from '../../types/opencode'
import type { CachedMessageDoc } from './search-types'

export function extractSearchableDocs(messages: readonly Message[]): CachedMessageDoc[] {
  const docs: CachedMessageDoc[] = []

  for (const msg of messages) {
    if (!msg || !msg.info) continue

    const textParts: string[] = []
    for (const part of msg.parts || []) {
      if (part && part.type === 'text') {
        const text = (part as TextPart).text
        if (text && typeof text === 'string') {
          textParts.push(text)
        }
      }
    }

    const fullText = textParts.join('\n\n').trim()
    if (!fullText) continue

    docs.push({
      id: msg.info.id,
      role: msg.info.role === 'user' ? 'user' : 'assistant',
      text: fullText,
      time: msg.info.time,
    })
  }

  return docs
}

export interface CacheEntry {
  updatedAt: number
  docs: CachedMessageDoc[]
  lastAccessedAt: number
}

export class MessageCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly maxEntries: number
  private accessCounter = 0

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries
  }

  get(sessionId: string, currentUpdatedAt?: number): CachedMessageDoc[] | undefined {
    const entry = this.entries.get(sessionId)
    if (!entry) return undefined

    if (currentUpdatedAt !== undefined && entry.updatedAt < currentUpdatedAt) {
      // Stale cache
      this.entries.delete(sessionId)
      return undefined
    }

    entry.lastAccessedAt = ++this.accessCounter
    return entry.docs
  }

  set(sessionId: string, updatedAt: number, docs: CachedMessageDoc[]): void {
    if (this.entries.size >= this.maxEntries && !this.entries.has(sessionId)) {
      // Evict least recently accessed entry
      let oldestKey: string | null = null
      let oldestTime = Infinity

      for (const [key, entry] of this.entries.entries()) {
        if (entry.lastAccessedAt < oldestTime) {
          oldestTime = entry.lastAccessedAt
          oldestKey = key
        }
      }

      if (oldestKey) {
        this.entries.delete(oldestKey)
      }
    }

    this.entries.set(sessionId, {
      updatedAt,
      docs,
      lastAccessedAt: ++this.accessCounter,
    })
  }

  has(sessionId: string, currentUpdatedAt?: number): boolean {
    return this.get(sessionId, currentUpdatedAt) !== undefined
  }

  clear(): void {
    this.entries.clear()
  }

  size(): number {
    return this.entries.size
  }
}

export const messageCache = new MessageCache(200)
