import type { ListedProject } from "../opencode/client"

import { CANONICAL_PROJECTS, matchCanonicalWorkspace } from "../../../services/api"

export const PROJECTS_ROOT = "/home/developer/projects/" as const

export function isRootWorktree(worktree: string): boolean {
  return worktree === "/"
}

export function isPreferredWorktree(worktree: string): boolean {
  return worktree.startsWith(PROJECTS_ROOT) && worktree.length > PROJECTS_ROOT.length
}

export function selectableProjects(
  projects: readonly ListedProject[],
): readonly ListedProject[] {
  const mapByCanonical = new Map<string, ListedProject>()

  for (const project of projects) {
    if (isRootWorktree(project.worktree)) continue
    const canonical = matchCanonicalWorkspace(project.worktree, project.name)
    if (!canonical) continue
    if (!mapByCanonical.has(canonical.name)) {
      mapByCanonical.set(canonical.name, {
        ...project,
        name: canonical.name,
        worktree: project.worktree || canonical.defaultWorktree,
      })
    }
  }

  const result: ListedProject[] = []
  for (const meta of CANONICAL_PROJECTS) {
    const existing = mapByCanonical.get(meta.name)
    if (existing) {
      result.push(existing)
    } else {
      result.push({
        id: meta.fallbackId,
        worktree: meta.defaultWorktree,
        name: meta.name,
      } as ListedProject)
    }
  }

  return result
}

export function pickDefaultDirectory(
  projects: readonly ListedProject[],
): string | undefined {
  const selectable = selectableProjects(projects)
  const preferred = selectable.find((project) => isPreferredWorktree(project.worktree))
  if (preferred !== undefined) {
    return preferred.worktree
  }
  const first = selectable[0]
  if (first === undefined) {
    return undefined
  }
  return first.worktree
}
