/**
 * Durable message index for Ctrl+K.
 * The in-memory LRU is a hot cache only. Closing the modal or reloading
 * the app used to drop every session that had not been opened in chat,
 * so message search only returned whatever happened to be fetched this
 * mount. IndexedDB keeps the extracted docs; the memory cache stays the
 * synchronous read path.
 */

import type { CachedMessageDoc } from './search-types'

export const MESSAGE_INDEX_DB = 'opencode-companion-search'
export const MESSAGE_INDEX_STORE = 'session-docs'

export interface StoredMessageIndex {
  sessionId: string
  updatedAt: number
  docs: CachedMessageDoc[]
}

export function indexIsFresh(storedUpdatedAt: number, currentUpdatedAt?: number): boolean {
  if (currentUpdatedAt === undefined) return true
  return storedUpdatedAt >= currentUpdatedAt
}

type IdFactory = {
  open: (name: string, version: number) => IDBOpenDBRequest
}

function indexedDbFactory(): IdFactory | null {
  if (typeof indexedDB === 'undefined') return null
  return indexedDB
}

function openIndexDb(): Promise<IDBDatabase | null> {
  const factory = indexedDbFactory()
  if (!factory) return Promise.resolve(null)
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = factory.open(MESSAGE_INDEX_DB, 1)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(MESSAGE_INDEX_STORE)) {
        db.createObjectStore(MESSAGE_INDEX_STORE, { keyPath: 'sessionId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
}

export async function readStoredIndex(sessionId: string): Promise<StoredMessageIndex | null> {
  const db = await openIndexDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(MESSAGE_INDEX_STORE, 'readonly')
      const req = tx.objectStore(MESSAGE_INDEX_STORE).get(sessionId)
      req.onsuccess = () => {
        const value = req.result as StoredMessageIndex | undefined
        resolve(value && Array.isArray(value.docs) ? value : null)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function writeStoredIndex(entry: StoredMessageIndex): Promise<void> {
  const db = await openIndexDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(MESSAGE_INDEX_STORE, 'readwrite')
      tx.objectStore(MESSAGE_INDEX_STORE).put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

