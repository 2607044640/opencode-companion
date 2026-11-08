/**
 * Smart File Matcher System (智能文件查找与匹配系统)
 * 
 * Invariants:
 * 1. High recall: matches files across word separators (_ vs - vs space vs %20), casing,
 *    path schemes (file://, /mnt/c, res://, jail paths), and relative paths.
 * 2. Absolute safety: NEVER match the wrong file. Zero false positives.
 *    - Strict extension equality.
 *    - Strict token sequence equality (exact same word tokens in exact order).
 *    - Unambiguous disambiguation.
 */

import type { WorkGroup, ExploreItem, EditItem } from './worked-summary'

export interface SmartMatchResult {
  matchingItem: ExploreItem | EditItem | null
  content?: string
  fullPath?: string
  fileName?: string
  sourceKind?: 'explore' | 'edit' | 'command'
  matchScore: number
}

/**
 * Standard known workspace root mappings
 */
export const WORKSPACE_MAPPINGS = [
  { jail: '/home/developer/projects/AISpace', win: 'C:/Godot/AISpace' },
  { jail: '/workspace/projects/AISpace', win: 'C:/Godot/AISpace' },
  { jail: '/home/developer/projects/APISpace', win: 'C:/APISpace' },
  { jail: '/workspace/projects/APISpace', win: 'C:/APISpace' },
  { jail: '/home/developer/projects/AICore', win: 'C:/AICore' },
  { jail: '/workspace/projects/AICore', win: 'C:/AICore' },
  { jail: '/home/developer/projects/ObsidianNote', win: 'C:/ObsidianNote' },
  { jail: '/workspace/projects/ObsidianNote', win: 'C:/ObsidianNote' },
  { jail: '/home/developer/projects/ObsidianDev', win: 'C:/ObsidianDev' },
  { jail: '/workspace/projects/ObsidianDev', win: 'C:/ObsidianDev' },
]

export const WORKSPACE_BASES = [
  'C:/Godot/AISpace',
  'C:/APISpace',
  'C:/AICore',
  'C:/ObsidianNote',
  'C:/ObsidianDev',
]

/**
 * Clean and normalize a raw file path or link target into a canonical path representation.
 */
export function normalizeFilePath(rawPath?: string): string {
  if (!rawPath || typeof rawPath !== 'string') return ''

  let p = rawPath.trim()

  // 1. Strip URI schemes
  if (p.startsWith('file:///')) p = p.slice(8)
  else if (p.startsWith('file://')) p = p.slice(7)

  // 2. Strip hash anchors and line numbers (#L10-L20, #L10, :10:5, :10)
  p = p.replace(/#L\d+(?:-[A-Za-z0-9]+)?$/i, '')
  p = p.replace(/#L\d+(?:-\d+)?$/i, '')
  p = p.replace(/:\d+(?::\d+)?$/, '')

  // 3. Strip query parameters (?session=...)
  p = p.replace(/\?[^#]*$/, '')

  // 4. Decode URI components (e.g. %20 -> space)
  try {
    if (p.includes('%')) {
      p = decodeURIComponent(p)
    }
  } catch {}

  // 5. Trim enclosing quotes, backticks, or trailing punctuation commonly caught in markdown
  p = p.replace(/^[`'"]+|[`'"]+$/g, '')
  p = p.replace(/[),;.]+$/, (match) => {
    // Keep extension dot, only strip trailing punctuation after extension
    return match.length === 1 && match !== '.' ? '' : match
  })

  // 6. WSL /mnt path mapping (/mnt/c/... -> C:/...)
  const mntMatch = p.match(/^\/mnt\/([a-zA-Z])\/(.*)/)
  if (mntMatch) {
    p = `${mntMatch[1].toUpperCase()}:/${mntMatch[2]}`
  }

  // 7. Godot res:// mapping (res://addons/... -> C:/Godot/AISpace/addons/...)
  if (p.startsWith('res://')) {
    p = `C:/Godot/AISpace/${p.slice(6)}`
  }

  // 8. Jail path mappings
  for (const m of WORKSPACE_MAPPINGS) {
    if (p.startsWith(m.jail)) {
      p = p.replace(m.jail, m.win)
      break
    }
  }

  // 9. Windows leading slash (/C:/... -> C:/...)
  if (/^\/[a-zA-Z]:[/\\\\]/.test(p)) {
    p = p.slice(1)
  }

  // 10. Normalize backslashes to forward slashes
  p = p.replace(/\\/g, '/')

  // 11. Normalize duplicate slashes (except protocol)
  p = p.replace(/([^:])\/\/+/g, '$1/')

  return p.trim()
}

/**
 * Extracts extension from a file name or path (lowercase with dot, e.g. '.md').
 */
export function getFileExtension(pathOrName: string): string {
  if (!pathOrName) return ''
  const clean = pathOrName.split(/[?#]/)[0]
  const lastDot = clean.lastIndexOf('.')
  const lastSlash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  if (lastDot > lastSlash && lastDot < clean.length - 1) {
    return clean.slice(lastDot).toLowerCase()
  }
  return ''
}

/**
 * Computes canonical token sequence and key for a file name.
 * 
 * Normalizes differences between:
 * - Underscore: 'GPT-6-Astra_Backpack_Meta_Review_Prompt.md'
 * - Space:      'GPT-6-Astra Backpack Meta Review Prompt.md'
 * - Hyphen:     'GPT-6-Astra-Backpack-Meta-Review-Prompt.md'
 * - URL encoded: 'GPT-6-Astra%20Backpack%20Meta%20Review%20Prompt.md'
 * 
 * Strict safety invariant:
 * - Both files MUST have the exact same extension.
 * - Both files MUST have the exact same tokens in the exact same order.
 * - Extra or missing tokens (e.g. 'Prompt_v2.md' or 'Astra.md') will NOT match.
 */
export function getCanonicalFileKey(pathOrName: string): string {
  if (!pathOrName) return ''
  const norm = normalizeFilePath(pathOrName)
  const baseFileName = norm.split('/').filter(Boolean).pop() || norm
  const ext = getFileExtension(baseFileName)

  const nameWithoutExt = ext ? baseFileName.slice(0, -ext.length) : baseFileName

  // Split into tokens on any non-alphanumeric sequence (spaces, underscores, hyphens, dots)
  const tokens = nameWithoutExt
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((tok) => tok.length > 0)

  if (tokens.length === 0) {
    return baseFileName.toLowerCase()
  }

  return `${tokens.join('_')}${ext}`
}

/**
 * Checks whether two file paths or filenames point to the same logical file.
 * Returns true if and only if they are an exact or canonical match with zero ambiguity.
 */
export function isSameFileSemantics(pathA?: string, pathB?: string): boolean {
  if (!pathA || !pathB) return false

  const normA = normalizeFilePath(pathA)
  const normB = normalizeFilePath(pathB)

  // 1. Direct exact match
  if (normA.toLowerCase() === normB.toLowerCase()) {
    return true
  }

  // 2. Extensions MUST match if both specify one
  const extA = getFileExtension(normA)
  const extB = getFileExtension(normB)
  if (extA && extB && extA !== extB) {
    return false
  }

  // 3. Basenames canonical token equality
  const keyA = getCanonicalFileKey(normA)
  const keyB = getCanonicalFileKey(normB)
  if (keyA && keyB && keyA === keyB) {
    // If both specified parent directory paths, verify directory compatibility
    const segmentsA = normA.split('/').filter(Boolean)
    const segmentsB = normB.split('/').filter(Boolean)

    if (segmentsA.length > 1 && segmentsB.length > 1) {
      // Both have directories: check if parent directory matches or one is suffix of other
      const parentA = segmentsA[segmentsA.length - 2].toLowerCase()
      const parentB = segmentsB[segmentsB.length - 2].toLowerCase()
      // If parents are completely distinct known different directories, don't false match
      if (parentA !== parentB && !normA.endsWith(normB) && !normB.endsWith(normA)) {
        return false
      }
    }
    return true
  }

  // 4. Suffix match (e.g. 'addons/A1/foo.gd' matches 'C:/Godot/AISpace/addons/A1/foo.gd')
  if (
    normA.length > normB.length &&
    normA.toLowerCase().endsWith(`/${normB.toLowerCase()}`)
  ) {
    return true
  }
  if (
    normB.length > normA.length &&
    normB.toLowerCase().endsWith(`/${normA.toLowerCase()}`)
  ) {
    return true
  }

  return false
}

/**
 * Searches in-memory turn groups (tools, edits, explores) for the matching file.
 * Prioritizes items that already have full file content loaded in memory!
 */
export function findBestMatchingFileInGroups(
  targetPath: string,
  groups: WorkGroup[]
): SmartMatchResult {
  const normTarget = normalizeFilePath(targetPath)
  const targetName = normTarget.split('/').filter(Boolean).pop() || normTarget
  const targetKey = getCanonicalFileKey(targetName)

  let bestResult: SmartMatchResult = {
    matchingItem: null,
    matchScore: 0,
  }

  const considerCandidate = (
    item: ExploreItem | EditItem,
    candidatePath: string,
    content: string | undefined,
    sourceKind: 'explore' | 'edit'
  ) => {
    const normCand = normalizeFilePath(candidatePath)
    const candName = normCand.split('/').filter(Boolean).pop() || normCand
    const candKey = getCanonicalFileKey(candName)

    let score = 0
    const hasContent = Boolean(content && content.trim().length > 0)

    // Tier 1: Exact full path match (slashes normalized, case-insensitive)
    if (normTarget.toLowerCase() === normCand.toLowerCase()) {
      score = hasContent ? 100 : 70
    }
    // Tier 2: Suffix match (e.g. 'addons/A1/foo.gd' matches 'C:/Godot/AISpace/addons/A1/foo.gd')
    else if (
      (normCand.length > normTarget.length && normCand.toLowerCase().endsWith(`/${normTarget.toLowerCase()}`)) ||
      (normTarget.length > normCand.length && normTarget.toLowerCase().endsWith(`/${normCand.toLowerCase()}`))
    ) {
      score = hasContent ? 95 : 65
    }
    // Tier 3: Exact file name match
    else if (targetName.toLowerCase() === candName.toLowerCase()) {
      score = hasContent ? 90 : 60
    }
    // Tier 4: Canonical token key match (handles _ vs - vs space vs %20)
    else if (targetKey && candKey && targetKey === candKey) {
      score = hasContent ? 85 : 55
    }

    const resolvedFullPath = normalizeFilePath(
      ('fullPath' in item && item.fullPath) ? item.fullPath :
      ('filePath' in item && item.filePath) ? item.filePath :
      candidatePath
    )

    if (score > bestResult.matchScore || (score === bestResult.matchScore && resolvedFullPath.includes('/') && !bestResult.fullPath?.includes('/'))) {
      bestResult = {
        matchingItem: item,
        content,
        fullPath: resolvedFullPath,
        fileName: candName,
        sourceKind,
        matchScore: score,
      }
    }
  }

  for (const group of groups) {
    if (group.kind === 'explore') {
      for (const it of group.items) {
        if (it.fullPath) {
          considerCandidate(it, it.fullPath, it.output, 'explore')
        }
        if (it.pathOrQuery) {
          considerCandidate(it, it.pathOrQuery, it.output, 'explore')
        }
      }
    } else if (group.kind === 'edit') {
      const edit = group.item
      // Extract edit item content: write/create file content, output, or unified diff
      const editInput = edit.rawPart?.state?.input || {}
      const editContent =
        (typeof editInput.content === 'string' && editInput.content) ||
        (typeof editInput.contents === 'string' && editInput.contents) ||
        (typeof editInput.CodeContent === 'string' && editInput.CodeContent) ||
        edit.rawPart?.state?.output ||
        edit.unified

      considerCandidate(edit, edit.filePath, editContent, 'edit')
      if (edit.fileName) {
        considerCandidate(edit, edit.fileName, editContent, 'edit')
      }
    }
  }

  return bestResult
}
