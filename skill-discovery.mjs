import fs from 'node:fs'
import path from 'node:path'

/** Relative skill-package dirs inside a workspace. Conventions, not skill names. */
const WORKSPACE_SKILL_REL_DIRS = ['.agents/skills', '.claude/skills', '.opencode/skills', 'skills']

const NAME_RE = /^[\w.+-]+$/
const MAX_DESCRIPTION = 160

function existingDir(candidate) {
  if (!candidate || typeof candidate !== 'string') return null
  try {
    const resolved = path.resolve(candidate)
    if (!fs.statSync(resolved).isDirectory()) return null
    return fs.realpathSync(resolved)
  } catch {
    return null
  }
}

function pushUnique(list, seen, candidate) {
  const real = existingDir(candidate)
  if (!real || seen.has(real)) return
  seen.add(real)
  list.push(real)
}

function looksLikeMirrorName(name) {
  return name.includes('\\') || name.includes(':') || name.startsWith('.')
}

/**
 * Extra skill roots besides the active workspace.
 * SKILLS_ROOT (path-delimiter separated) overrides discovery.
 * Otherwise every child of the projects root is scanned for the same relative
 * skill dirs — catalog location is a directory convention, never a name list.
 */
export function sharedSkillRootCandidates(projectsRoot) {
  const roots = []
  if (process.env.SKILLS_ROOT) {
    for (const part of process.env.SKILLS_ROOT.split(path.delimiter)) {
      if (part.trim()) roots.push(part.trim())
    }
    return roots
  }
  const projects = effectiveProjectsRoot(projectsRoot)
  let children
  try {
    children = fs.readdirSync(projects, { withFileTypes: true })
  } catch {
    return roots
  }
  for (const ent of children) {
    if (!ent.name || looksLikeMirrorName(ent.name)) continue
    const child = path.join(projects, ent.name)
    for (const rel of WORKSPACE_SKILL_REL_DIRS) {
      roots.push(path.join(child, rel))
    }
  }
  return roots
}

export function effectiveProjectsRoot(override) {
  const candidates = []
  if (override) candidates.push(override)
  if (process.env.PROJECTS_ROOT) candidates.push(process.env.PROJECTS_ROOT)
  candidates.push('/home/developer/projects')
  if (process.platform === 'win32') {
    candidates.push('C:\\AICore')
    candidates.push('C:\\APISpace')
    candidates.push('C:\\')
  }
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isDirectory()) return path.resolve(candidate)
    } catch {
      // try the next candidate
    }
  }
  return path.resolve(candidates[candidates.length - 1])
}

export function resolveSkillRoots({ projectsRoot, workspaceDir } = {}) {
  const roots = []
  const seen = new Set()
  if (workspaceDir) {
    for (const rel of WORKSPACE_SKILL_REL_DIRS) {
      pushUnique(roots, seen, path.join(workspaceDir, rel))
    }
  }
  for (const candidate of sharedSkillRootCandidates(projectsRoot || effectiveProjectsRoot())) {
    pushUnique(roots, seen, candidate)
  }
  if (process.platform === 'win32' && !projectsRoot) {
    pushUnique(roots, seen, 'C:\\AICore\\skills')
    pushUnique(roots, seen, 'C:\\APISpace\\.agents\\skills')
    pushUnique(roots, seen, 'C:\\APISpace\\skills')
  }
  return roots
}

function unquoteYaml(raw) {
  const s = String(raw ?? '').trim()
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s
      .slice(1, -1)
      .replace(/\\n/g, ' ')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1)
  }
  return s
}

export function summarizeDescription(description) {
  if (!description) return undefined
  const flat = String(description).replace(/\s+/g, ' ').trim()
  if (!flat) return undefined
  if (flat.length <= MAX_DESCRIPTION) return flat
  return `${flat.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…`
}

export function parseSkillFrontmatter(text) {
  const src = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  let fmName
  let fmDescription

  if (src.startsWith('---')) {
    const end = src.indexOf('\n---', 3)
    if (end >= 0) {
      const block = src.slice(src.indexOf('\n') + 1, end)
      const lines = block.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const nameMatch = line.match(/^name:\s*(.*)$/)
        if (nameMatch) {
          fmName = unquoteYaml(nameMatch[1])
          continue
        }
        const descMatch = line.match(/^description:\s*(.*)$/)
        if (!descMatch) continue
        let rest = descMatch[1].trim()
        if (rest === '>' || rest === '|' || rest === '>-' || rest === '|-') {
          const buf = []
          while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || lines[i + 1].trim() === '')) {
            i++
            if (lines[i].trim()) buf.push(lines[i].trim())
          }
          fmDescription = buf.join(' ')
        } else if (
          (rest.startsWith('"') && !rest.endsWith('"')) ||
          (rest.startsWith("'") && !rest.endsWith("'"))
        ) {
          const quote = rest[0]
          let buf = rest
          while (i + 1 < lines.length && !buf.endsWith(quote)) {
            i++
            buf += ` ${lines[i].trim()}`
          }
          fmDescription = unquoteYaml(buf)
        } else {
          fmDescription = unquoteYaml(rest)
        }
      }
    }
  }

  // Fallback / augmentation for descriptions:
  // If description is missing or generic boilerplate (e.g. "Explicit invocation only. Never auto-trigger."),
  // auto-extract the real functional description from <original_trigger_description>, **Objective:**, or role tags.
  let resolvedDescription = fmDescription?.trim()
  const isGenericExplicit = !resolvedDescription || /^(explicit invocation only\b|never auto-trigger\b)/i.test(resolvedDescription)

  if (isGenericExplicit) {
    const origMatch = src.match(/<original_trigger_description>\s*["']?([\s\S]*?)["']?\s*<\/original_trigger_description>/)
    if (origMatch && origMatch[1].trim()) {
      resolvedDescription = origMatch[1].replace(/\s+/g, ' ').trim()
    } else {
      const objMatch = src.match(/\*\*Objective:\*\*\s*([^\n\r<]+)/)
      if (objMatch && objMatch[1].trim()) {
        resolvedDescription = objMatch[1].replace(/\s+/g, ' ').trim()
      } else {
        const roleMatch = src.match(/<role_and_objective>[\s\S]*?You are (?:an? )?([^.\n\r<]+)/i)
        if (roleMatch && roleMatch[1].trim()) {
          resolvedDescription = roleMatch[1].replace(/\s+/g, ' ').trim()
        }
      }
    }
  }

  return {
    name: fmName?.trim() || undefined,
    description: resolvedDescription?.trim() || undefined,
  }
}

function safeSkillName(frontmatterName, folderName) {
  const fromFile = (frontmatterName || '').trim()
  if (NAME_RE.test(fromFile)) return fromFile
  const fromFolder = (folderName || '').trim()
  if (NAME_RE.test(fromFolder)) return fromFolder
  return ''
}

/**
 * Read every `<root>/<package>/SKILL.md`. Names come from frontmatter (else the package folder).
 * Hardlinked copies collapse by device+inode, then by name. Earlier roots win.
 */
export function discoverSkills(roots) {
  const seenInodes = new Set()
  const byName = new Map()
  for (const root of roots) {
    const rootResolved = path.resolve(root)
    let entries
    try {
      entries = fs.readdirSync(rootResolved, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      if (!ent.name || ent.name.startsWith('.')) continue
      const skillDir = path.resolve(rootResolved, ent.name)
      if (skillDir !== rootResolved && !skillDir.startsWith(rootResolved + path.sep)) continue
      const skillMd = path.join(skillDir, 'SKILL.md')
      let st
      try {
        st = fs.statSync(skillMd)
      } catch {
        continue
      }
      if (!st.isFile()) continue
      const inodeKey = `${st.dev}:${st.ino}`
      if (seenInodes.has(inodeKey)) continue
      seenInodes.add(inodeKey)
      let text = ''
      try {
        text = fs.readFileSync(skillMd, 'utf8')
      } catch {
        continue
      }
      const fm = parseSkillFrontmatter(text)
      const name = safeSkillName(fm.name, ent.name)
      if (!name) continue
      const nameKey = name.toLowerCase()
      if (byName.has(nameKey)) continue
      byName.set(nameKey, {
        name,
        description: summarizeDescription(fm.description),
        source: rootResolved,
      })
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function listSkills({ projectsRoot, workspaceDir } = {}) {
  return discoverSkills(resolveSkillRoots({ projectsRoot, workspaceDir }))
}

/** Live binding so tests can point discovery at a temp tree without touching disk roots. */
export const skillScan = {
  list(options) {
    return listSkills(options)
  },
}

export function resolveSkillWorkspace(rawDir, projectsRoot) {
  if (!rawDir || typeof rawDir !== 'string') return null
  const normalized = rawDir.replace(/\\/g, '/').replace(/\/+$/, '').trim()
  if (!normalized || normalized.includes('..')) return null
  const projects = effectiveProjectsRoot(projectsRoot)
  const resolved = path.resolve(normalized)
  if (resolved !== projects && !resolved.startsWith(projects + path.sep)) return null
  try {
    if (!fs.statSync(resolved).isDirectory()) return null
  } catch {
    return null
  }
  return resolved
}
