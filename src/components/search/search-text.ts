/**
 * One folding path for Ctrl+K titles and message bodies.
 * Session titles often contain raw `<user_intent>\n`, emoji variation
 * selectors, and CJK punctuation. Pasted queries do too. Matching both
 * sides through this fold is what makes those titles findable.
 */

const VARIATION_SELECTOR = /\uFE0E|\uFE0F/g
const INVISIBLE = /[\u200B-\u200D\uFEFF\u00AD]/g
const WHITESPACE_RUN = /\s+/g

export function foldSearchText(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(VARIATION_SELECTOR, '')
    .replace(INVISIBLE, '')
    .replace(WHITESPACE_RUN, ' ')
    .trim()
    .toLowerCase()
}

/** Whitespace removed. A window title drops the newline that the stored title keeps. */
export function compactSearchText(value: string | null | undefined): string {
  return foldSearchText(value).replace(/ /g, '')
}

/** Drop a trailing ellipsis copied from a truncated window title. */
export function prepareSearchQuery(query: string): string {
  return query.replace(/(?:\.{3}|…)+\s*$/u, '').trim()
}

/** Tokens a query must all hit. Empty when the query itself is blank. */
export function searchTokens(query: string): string[] {
  const folded = foldSearchText(query)
  if (!folded) return []
  return folded.split(' ').filter(Boolean)
}

export function textMatchesTokens(foldedHaystack: string, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true
  return tokens.every((token) => foldedHaystack.includes(token))
}

export function textMatchesQuery(haystack: string, query: string): boolean {
  const prepared = prepareSearchQuery(query)
  const tokens = searchTokens(prepared)
  if (tokens.length === 0) return false
  if (textMatchesTokens(foldSearchText(haystack), tokens)) return true
  const compactQuery = compactSearchText(prepared)
  if (!compactQuery) return false
  return compactSearchText(haystack).includes(compactQuery)
}
