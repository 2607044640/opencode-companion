export type PopoverRankItem =
  | { type: 'command'; item: { name: string; description?: string } }
  | { type: 'skill'; item: { name: string; description?: string } }
  | { type: 'agent'; item: { name: string; description?: string } }
  | { type: 'file'; item: string }
  | { type: string; item: any }

const TITLE_BOUNDARY_CHARS = '-_/ '
const DESC_BOUNDARY_CHARS = '-_/ .,:;!?'

/** Cache tokenized parts for static titles across keystrokes */
const camelPartsCache = new Map<string, string[]>()

/**
 * Splits an identifier (CamelCase, PascalCase, snake_case, kebab-case) into individual lowercased word parts.
 * Uses a memory-bounded Map cache for instantaneous lookups during typing.
 * e.g. "InstructionDesignPrinciples" -> ["instruction", "design", "principles"]
 *      "WebResearch" -> ["web", "research"]
 *      "Explicit_CCSwitchHelper" -> ["explicit", "cc", "switch", "helper"]
 *      "database-tool-creator" -> ["database", "tool", "creator"]
 */
export function splitCamelCaseParts(title: string): string[] {
  if (!title) return []
  const cached = camelPartsCache.get(title)
  if (cached) return cached

  const rawParts = title.match(/[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g)
  const res = rawParts ? rawParts.map((p) => p.toLowerCase()).filter(Boolean) : [title.toLowerCase()]

  if (camelPartsCache.size > 500) {
    camelPartsCache.clear()
  }
  camelPartsCache.set(title, res)
  return res
}

function matchCamelPartsHelper(
  parts: string[],
  partIdx: number,
  query: string,
  queryIdx: number
): boolean {
  if (queryIdx === query.length) {
    return true
  }
  if (partIdx >= parts.length) {
    return false
  }

  const part = parts[partIdx]
  const maxK = Math.min(part.length, query.length - queryIdx)

  for (let k = maxK; k >= 1; k--) {
    const chunk = query.slice(queryIdx, queryIdx + k)
    if (part.startsWith(chunk)) {
      if (matchCamelPartsHelper(parts, partIdx + 1, query, queryIdx + k)) {
        return true
      }
    }
  }

  // Allow skipping the leading parts before the first match (e.g. skipping "Explicit_" prefix)
  if (queryIdx === 0) {
    return matchCamelPartsHelper(parts, partIdx + 1, query, 0)
  }

  return false
}

/**
 * Checks whether query matches the CamelCase / PascalCase words in order (Rider / VS Code style).
 * e.g. "insde" matches "InstructionDesignPrinciples" ("ins" in Instruction, "de" in Design)
 *      "idp" matches "InstructionDesignPrinciples" ("i", "d", "p")
 *      "webre" or "wr" matches "WebResearch" ("web"/"w", "re"/"r")
 */
export function matchCamelCase(title: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const parts = splitCamelCaseParts(title)
  if (parts.length === 0) return false
  return matchCamelPartsHelper(parts, 0, q, 0)
}

/**
 * Checks whether all characters in query appear sequentially in target (fuzzy subsequence match).
 */
export function matchSubsequence(target: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const t = target.trim().toLowerCase()
  if (q.length > t.length) return false

  let tIdx = 0
  let qIdx = 0
  while (tIdx < t.length && qIdx < q.length) {
    if (t[tIdx] === q[qIdx]) {
      qIdx++
    }
    tIdx++
  }
  return qIdx === q.length
}

/**
 * Fast allocation-free word boundary search.
 * Returns the 0-based index of query in text if query starts at position 0 or immediately
 * follows any character in boundaryChars. Returns -1 otherwise.
 */
function findWordBoundaryIndex(text: string, q: string, boundaryChars: string): number {
  let pos = text.indexOf(q)
  while (pos !== -1) {
    if (pos === 0 || boundaryChars.includes(text[pos - 1])) {
      return pos
    }
    pos = text.indexOf(q, pos + 1)
  }
  return -1
}

/**
 * Computes a relevance score for a popover candidate against a search query.
 * Lower score = higher relevance / priority.
 *
 * Priority Tiers:
 * Tier 1 (0): Exact title match
 * Tier 2 (10+): Title starts with query (prefix match)
 * Tier 3 (20+): Title word-boundary match (after _, -, /, or space)
 * Tier 3.5 (25+): Title CamelCase / Acronym match (e.g. "insde", "idp", "wr", "webre")
 * Tier 4 (30+): Title contains query anywhere (substring)
 * Tier 4.5 (35+): Title fuzzy subsequence match (letters in order across full string)
 * Tier 5 (100+): Title does not match; Description starts with query
 * Tier 6 (110+): Title does not match; Description word-boundary match
 * Tier 7 (120+): Title does not match; Description contains query anywhere
 * Infinity: Neither title nor description matches (filtered out)
 *
 * INVARIANT: ANY title match (score <= 50) ALWAYS strictly outranks ANY description-only match (score >= 100).
 */
export function scorePopoverItem(
  title: string,
  description: string | undefined,
  query: string
): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0

  const t = (title || '').trim().toLowerCase()
  const d = (description || '').trim().toLowerCase()

  // Tier 1: Exact title match
  if (t === q) {
    return 0
  }

  // Tier 2: Title prefix match
  if (t.startsWith(q)) {
    return 10 + (t.length - q.length) * 0.001
  }

  // Tier 3: Title word boundary match (after _, -, /, or space) without regex allocations
  const wordBoundaryIdx = findWordBoundaryIndex(t, q, TITLE_BOUNDARY_CHARS)
  if (wordBoundaryIdx !== -1) {
    return 20 + wordBoundaryIdx * 0.01 + (t.length - q.length) * 0.001
  }

  // Tier 3.5: Title CamelCase / Acronym match (Rider/VS Code style e.g. "insde" -> "InstructionDesignPrinciples")
  if (matchCamelCase(title, q)) {
    return 25 + (t.length - q.length) * 0.001
  }

  // Tier 4: Title contains query anywhere
  const tIdx = t.indexOf(q)
  if (tIdx !== -1) {
    return 30 + tIdx * 0.01 + (t.length - q.length) * 0.001
  }

  // Tier 4.5: Title fuzzy subsequence match (full field matching in order for queries >= 3 chars)
  if (q.length >= 3 && matchSubsequence(t, q)) {
    return 35 + (t.length - q.length) * 0.01
  }

  // Tier 5: Title does not match, but Description starts with query
  if (d.startsWith(q)) {
    return 100 + (d.length - q.length) * 0.0001
  }

  // Tier 6: Title does not match, but Description matches at word boundary without regex allocations
  const dWordBoundaryIdx = findWordBoundaryIndex(d, q, DESC_BOUNDARY_CHARS)
  if (dWordBoundaryIdx !== -1) {
    return 110 + Math.min(dWordBoundaryIdx, 100) * 0.01
  }

  // Tier 7: Title does not match, but Description contains query anywhere
  const dIdx = d.indexOf(q)
  if (dIdx !== -1) {
    return 120 + Math.min(dIdx, 100) * 0.01
  }

  return Infinity
}

/**
 * Filters and ranks popover items so that items whose title (name) matches
 * ALWAYS have higher priority than items that only match in description.
 */
export function rankPopoverItems<T extends PopoverRankItem>(
  items: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) {
    return items
  }

  const scored: { item: T; score: number; index: number }[] = []

  for (let i = 0; i < items.length; i++) {
    const entry = items[i]
    let title = ''
    let description: string | undefined

    if (entry.type === 'file') {
      title = typeof entry.item === 'string' ? entry.item : ''
    } else if (entry.item && typeof entry.item === 'object') {
      title = entry.item.name || ''
      description = entry.item.description
    }

    const score = scorePopoverItem(title, description, q)
    if (score < Infinity) {
      scored.push({ item: entry, score, index: i })
    }
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score
    }
    return a.index - b.index
  })

  return scored.map((s) => s.item)
}
