import type { Session } from '../../types/opencode'
import {
  compactSearchText,
  foldSearchText,
  prepareSearchQuery,
  searchTokens,
} from './search-text'

/**
 * Filter and rank sessions specifically by session ID, with fallback title matching.
 * Handles exact ID matches, prefix matches, substring/hash fragments, and normalized token matching.
 */
export function filterSessionsById(
  sessions: readonly Session[],
  query: string
): Session[] {
  const prepared = prepareSearchQuery(query)
  const foldedQuery = foldSearchText(prepared)

  if (!foldedQuery) {
    return [...sessions].sort((a, b) => {
      const timeA = a.time?.updated || a.time?.created || 0
      const timeB = b.time?.updated || b.time?.created || 0
      return timeB - timeA
    })
  }

  const queryLower = foldedQuery.toLowerCase()
  const compactQuery = compactSearchText(prepared).toLowerCase()
  const strippedQuery = compactQuery.replace(/[-_]/g, '')
  const tokens = searchTokens(prepared).map((t) => t.toLowerCase())

  const scored: { session: Session; score: number }[] = []

  for (const s of sessions) {
    const rawId = s.id || ''
    const idLower = rawId.toLowerCase()
    const idCompact = compactSearchText(rawId).toLowerCase()
    const idStripped = idCompact.replace(/[-_]/g, '')
    const titleLower = foldSearchText(s.title).toLowerCase()

    let score = 0

    // Direct ID matches (exact, prefix, contains)
    if (idLower === queryLower || idCompact === compactQuery || (strippedQuery && idStripped === strippedQuery)) {
      score += 600
    } else if (idLower.startsWith(queryLower) || idCompact.startsWith(compactQuery) || (strippedQuery && idStripped.startsWith(strippedQuery))) {
      score += 400
    } else if (idLower.includes(queryLower) || idCompact.includes(compactQuery) || (strippedQuery && idStripped.includes(strippedQuery))) {
      score += 250
    } else if (titleLower.includes(queryLower)) {
      score += 50
    }

    // Token-based matching
    if (tokens.length > 1) {
      let idMatches = 0
      let titleMatches = 0
      for (const token of tokens) {
        if (idLower.includes(token)) idMatches++
        else if (titleLower.includes(token)) titleMatches++
      }

      if (idMatches === tokens.length) {
        score += 300
      } else if (idMatches + titleMatches === tokens.length) {
        score += 80 + idMatches * 40
      }
    }

    if (score > 0) {
      scored.push({ session: s, score })
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    const timeA = a.session.time?.updated || a.session.time?.created || 0
    const timeB = b.session.time?.updated || b.session.time?.created || 0
    return timeB - timeA
  })

  return scored.map((item) => item.session)
}
