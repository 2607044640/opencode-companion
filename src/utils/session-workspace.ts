import type { Project, Session } from '../types/opencode'
import { matchCanonicalWorkspace } from '../services/api'
import { isSameOrSubdirectory } from './sidebar-helpers'

export const PROJECT_COLOR_MAP: Record<string, string> = {
  cyan: 'bg-cyan-950/60 text-cyan-300 border-cyan-700/50',
  blue: 'bg-blue-950/60 text-blue-300 border-blue-700/50',
  green: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50',
  purple: 'bg-purple-950/60 text-purple-300 border-purple-700/50',
  magenta: 'bg-pink-950/60 text-pink-300 border-pink-700/50',
  pink: 'bg-pink-950/60 text-pink-300 border-pink-700/50',
  amber: 'bg-amber-950/60 text-amber-300 border-amber-700/50',
  orange: 'bg-orange-950/60 text-orange-300 border-orange-700/50',
  mint: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50',
}

export interface SessionProjectBadge {
  readonly id: string
  readonly name: string
  readonly colorClass: string
  readonly abbreviation?: string
}

const FALLBACK_BADGE: SessionProjectBadge = {
  id: 'global',
  name: 'Global',
  colorClass: 'bg-zinc-800/80 text-zinc-400 border-zinc-700',
  abbreviation: 'GL',
}

function colorClassFor(colorKey: string): string {
  return PROJECT_COLOR_MAP[colorKey] || 'bg-zinc-800 text-zinc-300 border-zinc-700'
}

function projectDisplayName(project: Project): string {
  const canonical = matchCanonicalWorkspace(project.worktree, project.name)
  return (
    canonical?.name ||
    project.name ||
    project.worktree.split('/').filter(Boolean).pop() ||
    'Project'
  )
}

export type SessionWorkspaceTarget = {
  readonly projectID?: string
  readonly directory?: string
}

function findProjectForSession(
  session: SessionWorkspaceTarget,
  projects: readonly Project[]
): Project | null {
  const projectID = session.projectID
  if (projectID) {
    const matchedById = projects.find(
      (p) =>
        p.id !== 'global' &&
        (p.id === projectID || Boolean(p.associatedIds && p.associatedIds.includes(projectID)))
    )
    if (matchedById) return matchedById
  }

  const directory = session.directory
  if (!directory) return null

  const matchedByDir = projects.find(
    (p) => p.worktree && p.worktree !== '/' && isSameOrSubdirectory(p.worktree, directory)
  )
  if (matchedByDir) return matchedByDir

  const canonicalDirect = matchCanonicalWorkspace(directory)
  if (canonicalDirect) {
    const byCanonical = projects.find((p) => {
      const meta = matchCanonicalWorkspace(p.worktree, p.name)
      return meta?.name === canonicalDirect.name || p.id === canonicalDirect.fallbackId
    })
    return byCanonical ?? null
  }

  return null
}

export function resolveCanonicalProjectId(
  session: SessionWorkspaceTarget,
  projects: readonly Project[]
): string | null {
  const matched = findProjectForSession(session, projects)
  if (matched) return matched.id

  if (session.directory) {
    const canonicalDirect = matchCanonicalWorkspace(session.directory)
    if (canonicalDirect) return canonicalDirect.fallbackId
  }

  return null
}

/**
 * Generates an automated 2-letter project abbreviation for UI tabs and badges.
 * Automatically detects capital letters, splits words across PascalCase/camelCase,
 * acronym boundaries, kebab-case, snake_case, and leaf folder names.
 *
 * Examples:
 *   - "ObsidianNote" -> "ON"
 *   - "ObsidianDev"  -> "OD"
 *   - "APISpace"     -> "AS"
 *   - "AISpace"      -> "AI"
 *   - "NullSpace"    -> "NS"
 *   - "my-cool-app"  -> "MC"
 */
export function getProjectAbbreviation(name?: string): string {
  if (!name || !name.trim()) return '--'

  const cleanName = name.replace(/\\/g, '/').split('/').filter(Boolean).pop() || name.trim()

  // 1. Replace delimiters (hyphens, underscores, dots, whitespace) with space
  let formatted = cleanName.replace(/[-_.\s]+/g, ' ').trim()

  // 2. Acronym followed by PascalCase: e.g. "APISpace" -> "API Space", "AISpace" -> "AI Space"
  formatted = formatted.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')

  // 3. camelCase / PascalCase boundary: e.g. "ObsidianNote" -> "Obsidian Note"
  formatted = formatted.replace(/([a-z0-9])([A-Z])/g, '$1 $2')

  const words = formatted.split(/\s+/).filter(Boolean)
  if (words.length === 0) return '--'

  // Special recognition for 2-letter acronym as first word (e.g. "AI" in "AI Space") -> "AI"
  if (words.length >= 2 && words[0].length === 2 && /^[A-Z]{2}$/.test(words[0])) {
    return words[0]
  }

  // If 2 or more words, take first letter of word 1 and first letter of word 2
  if (words.length >= 2) {
    const first = words[0].charAt(0).toUpperCase()
    const second = words[1].charAt(0).toUpperCase()
    return `${first}${second}`
  }

  // Single word:
  const single = words[0]
  const uppers = single.replace(/[^A-Z]/g, '')
  if (uppers.length >= 2) {
    return uppers.slice(0, 2)
  }

  return single.slice(0, 2).toUpperCase()
}

export function resolveSessionProject(
  session: SessionWorkspaceTarget,
  projects: readonly Project[]
): SessionProjectBadge {
  const matched = findProjectForSession(session, projects)
  if (matched) {
    const canonical = matchCanonicalWorkspace(matched.worktree, matched.name)
    const colorKey = matched.icon?.color || canonical?.defaultColor || 'blue'
    const name = projectDisplayName(matched)
    return {
      id: matched.id,
      name,
      colorClass: colorClassFor(colorKey),
      abbreviation: getProjectAbbreviation(name),
    }
  }

  if (session.directory) {
    const canonicalDirect = matchCanonicalWorkspace(session.directory)
    if (canonicalDirect) {
      return {
        id: canonicalDirect.fallbackId,
        name: canonicalDirect.name,
        colorClass: colorClassFor(canonicalDirect.defaultColor),
        abbreviation: getProjectAbbreviation(canonicalDirect.name),
      }
    }

    const dirParts = session.directory.replace(/\\/g, '/').split('/').filter(Boolean)
    const dirBase = dirParts.pop() || 'Workspace'
    return {
      id: 'dir-' + dirBase,
      name: dirBase,
      colorClass: 'bg-zinc-800/80 text-zinc-300 border-zinc-700',
      abbreviation: getProjectAbbreviation(dirBase),
    }
  }

  return FALLBACK_BADGE
}

export function formatProjectPill(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '[Global]'
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed
  return `[${trimmed}]`
}

export function sessionBelongsToProjectFilter(
  session: Pick<Session, 'id' | 'projectID' | 'directory'>,
  projectFilterId: string,
  projects: readonly Project[],
  badge: SessionProjectBadge
): boolean {
  if (projectFilterId === 'ALL' || projectFilterId === '') return true

  const targetProj = projects.find((p) => p.id === projectFilterId)
  if (!targetProj) return badge.id === projectFilterId

  if (targetProj.associatedIds && targetProj.associatedIds.includes(session.projectID)) {
    return true
  }
  if (targetProj.id === session.projectID) return true
  if (targetProj.worktree && session.directory && isSameOrSubdirectory(targetProj.worktree, session.directory)) {
    return true
  }
  return badge.id === projectFilterId || badge.name.toLowerCase() === (targetProj.name || '').toLowerCase()
}

export function selectSearchCorpus<T>(
  items: readonly T[],
  query: string,
  projectFilterId: string,
  belongsToFilter: (item: T) => boolean
): readonly T[] {
  const hasKeyword = query.trim().length > 0
  if (hasKeyword || projectFilterId === 'ALL' || projectFilterId === '') {
    return items
  }
  return items.filter(belongsToFilter)
}

export interface SessionActivationPlan {
  readonly session: Session | null
  readonly projectId: string | null
  readonly shouldInsert: boolean
}

export function planSessionActivation(input: {
  readonly sessionId: string
  readonly localSessions: readonly Session[]
  readonly fetchedSession: Session | null
  readonly projects: readonly Project[]
}): SessionActivationPlan {
  const local = input.localSessions.find((s) => s.id === input.sessionId) ?? null
  if (local) {
    return {
      session: local,
      projectId: resolveCanonicalProjectId(local, input.projects),
      shouldInsert: false,
    }
  }

  if (input.fetchedSession && input.fetchedSession.id === input.sessionId) {
    return {
      session: input.fetchedSession,
      projectId: resolveCanonicalProjectId(input.fetchedSession, input.projects),
      shouldInsert: true,
    }
  }

  return { session: null, projectId: null, shouldInsert: false }
}
