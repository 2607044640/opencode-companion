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
