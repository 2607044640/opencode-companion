import type { CachedMessageDoc, MessageSearchHit } from './search-types'

export function extractMatchSnippet(
  text: string,
  query: string,
  windowRadius = 55
): string {
  if (!text) return ''

  const trimmed = query.trim()
  if (!trimmed) {
    const preview = text.slice(0, 110).replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ').trim()
    return text.length > 110 ? `${preview}...` : preview
  }

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    const preview = text.slice(0, 110).replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ').trim()
    return text.length > 110 ? `${preview}...` : preview
  }

  const lowerText = text.toLowerCase()
  let firstMatchIndex = -1
  let matchedWordLength = 0

  for (const word of words) {
    const idx = lowerText.indexOf(word.toLowerCase())
    if (idx !== -1) {
      if (firstMatchIndex === -1 || idx < firstMatchIndex) {
        firstMatchIndex = idx
        matchedWordLength = word.length
      }
    }
  }

  if (firstMatchIndex === -1) {
    const preview = text.slice(0, 110).replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ').trim()
    return text.length > 110 ? `${preview}...` : preview
  }

  const start = Math.max(0, firstMatchIndex - windowRadius)
  const end = Math.min(text.length, firstMatchIndex + matchedWordLength + windowRadius)

  let snippet = text.slice(start, end).replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  const prefix = start > 0 ? '...' : ''
  const suffix = end < text.length ? '...' : ''

  return `${prefix}${snippet}${suffix}`
}

export interface SessionSearchMeta {
  projectId?: string
  projectName?: string
  projectColorClass?: string
  directory?: string
}

export function searchSessionDocs(
  sessionId: string,
  sessionTitle: string,
  docs: readonly CachedMessageDoc[],
  query: string,
  meta?: SessionSearchMeta,
  maxHitsPerSession = 3
): MessageSearchHit[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const lowerWords = words.map((w) => w.toLowerCase())
  const hits: MessageSearchHit[] = []

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]
    const lowerDoc = doc.text.toLowerCase()

    // Substring-AND match: all terms must match
    const allMatched = lowerWords.every((w) => lowerDoc.includes(w))
    if (!allMatched) continue

    hits.push({
      sessionId,
      sessionTitle: sessionTitle || 'Untitled Session',
      messageId: doc.id,
      role: doc.role,
      snippet: extractMatchSnippet(doc.text, query),
      matchWords: words,
      timestamp: doc.time?.created || doc.time?.completed,
      turnIndex: i + 1,
      projectId: meta?.projectId,
      projectName: meta?.projectName,
      projectColorClass: meta?.projectColorClass,
      directory: meta?.directory,
    })

    if (hits.length >= maxHitsPerSession) {
      break
    }
  }

  return hits
}

export interface SessionSearchTarget {
  sessionId: string
  sessionTitle: string
  docs: readonly CachedMessageDoc[]
  meta?: SessionSearchMeta
  updatedAt?: number
}

export function queryAllCachedMessages(
  targets: readonly SessionSearchTarget[],
  query: string,
  maxTotalHits = 80
): MessageSearchHit[] {
  const allHits: MessageSearchHit[] = []

  for (const target of targets) {
    const sessionHits = searchSessionDocs(
      target.sessionId,
      target.sessionTitle,
      target.docs,
      query,
      target.meta
    )
    allHits.push(...sessionHits)
    if (allHits.length >= maxTotalHits * 2) {
      break
    }
  }

  // Sort descending by message timestamp or session update
  allHits.sort((a, b) => {
    const timeA = a.timestamp || 0
    const timeB = b.timestamp || 0
    return timeB - timeA
  })

  return allHits.slice(0, maxTotalHits)
}
