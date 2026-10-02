export function parseSkillFrontmatter(text: string): { name?: string; description?: string }
export function summarizeDescription(description: string | undefined): string | undefined
export function discoverSkills(roots: string[]): { name: string; description?: string; source: string }[]
export function listSkills(options?: {
  projectsRoot?: string
  workspaceDir?: string
}): { name: string; description?: string; source: string }[]
export function resolveSkillRoots(options?: { projectsRoot?: string; workspaceDir?: string }): string[]
export function resolveSkillWorkspace(rawDir: string, projectsRoot?: string): string | null
export const skillScan: {
  list(options?: { projectsRoot?: string; workspaceDir?: string }): {
    name: string
    description?: string
    source: string
  }[]
}
