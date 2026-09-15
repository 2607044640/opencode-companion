import type { Project, Session } from '../types/opencode'

export function normalizePath(p?: string): string {
  if (!p) return ''
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function isSameOrSubdirectory(parentPath: string, targetPath: string): boolean {
  const parent = normalizePath(parentPath)
  const target = normalizePath(targetPath)
  if (!parent || !target) return false
  if (parent === target) return true
  if (target.startsWith(parent + '/')) return true

  const parentSegments = parent.split('/').filter(Boolean)
  const parentBase = parentSegments.pop()
  if (!parentBase) return false

  const targetSegments = target.split('/').filter(Boolean)
  if (targetSegments.includes(parentBase)) {
    return true
  }

  return false
}

/**
 * Checks if a session belongs to a project
 */
export function doesSessionBelongToProject(session: Session, project: Project): boolean {
  if (!session || !project) return false

  // Match by directory/worktree
  if (session.directory && project.worktree) {
    if (isSameOrSubdirectory(project.worktree, session.directory)) {
      return true
    }
  }

  // Match by project ID or associated IDs
  if (session.projectID) {
    if (session.projectID === project.id) return true
    if (project.associatedIds && project.associatedIds.includes(session.projectID)) return true
  }

  // Fallback match by project name in session directory path
  if (project.name && session.directory) {
    const normDir = normalizePath(session.directory)
    const normName = project.name.toLowerCase()
    if (normDir.split('/').includes(normName)) {
      return true
    }
  }

  return false
}

/**
 * Formats relative timestamp in compact format: 5m, 8h, 2d, 1mo, 1y
 */
export function formatCompactTime(timestamp?: number, now: number = Date.now()): string {
  if (!timestamp) return ''
  const diff = Math.max(0, now - timestamp)
  const seconds = Math.floor(diff / 1000)

  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  const years = Math.floor(days / 365)
  return `${years}y`
}

/**
 * Progressive disclosure / pagination configuration for sidebar folders.
 * Default shows 7 sessions, expanding by 5 on each "See more" click.
 */
export const DEFAULT_FOLDER_LIMIT = 7
export const FOLDER_PAGE_STEP = 5

export interface FolderPaginationResult<T> {
  visibleItems: T[]
  hasMore: boolean
  remaining: number
  nextStep: number
}

/**
 * Returns the sliced visible items and pagination metadata for a folder list.
 */
export function getVisibleSessions<T>(
  items: T[],
  limit: number = DEFAULT_FOLDER_LIMIT
): FolderPaginationResult<T> {
  const safeLimit = Math.max(1, limit)
  const visibleItems = items.slice(0, safeLimit)
  const remaining = Math.max(0, items.length - safeLimit)
  return {
    visibleItems,
    hasMore: remaining > 0,
    remaining,
    nextStep: Math.min(FOLDER_PAGE_STEP, remaining),
  }
}

/**
 * Calculates the next limit after clicking "See more" (+5).
 */
export function calculateNextLimit(
  currentLimit: number = DEFAULT_FOLDER_LIMIT,
  step: number = FOLDER_PAGE_STEP
): number {
  return Math.max(1, currentLimit) + step
}
