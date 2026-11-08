import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { skillScan, resolveSkillWorkspace } from './skill-discovery.mjs'
import { openInVSCode, openInExplorer } from './vscode-launcher.mjs'
import { createSnapshotStore } from './revert-snapshots.mjs'

const PROJECTS_ROOT = process.env.PROJECTS_ROOT || '/workspace/projects/'
const PROJECTS_JAIL_ROOT = '/home/developer/projects'
const WINDOWS_WORKSPACE_BASES = ['C:/', 'C:/Godot', 'C:/ObsidianPublish', 'D:/']
const DISALLOWED_WINDOWS_SYSTEM_DIRS = new Set([
  'windows',
  'program files',
  'program files (x86)',
  'programdata',
  'users',
  'system volume information',
  '$recycle.bin',
  'recovery',
  'perflogs',
])
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|rs|go|md|css|html|vue|svelte|json)$/i
const SENSITIVE_BASENAME = /(?:^|\/)(?:\.env(?:\..*)?|one-api\.db|api_secrets\.json)$/i
const SENSITIVE_EXT = /\.(?:key|pem|p12|pfx|crt|cer)$/i
const SENSITIVE_NAME = /(?:secret|credential|password|passwd|private[_-]?key)/i
const TOKEN_BASENAME = /token/i
const BLOCKED_DIR = /(?:^|\/)(?:gateway\/logs|\.git\/hooks)(?:\/|$)/i
const MAX_BODY_BYTES = 1_000_000

export function isSensitiveGitPath(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '')
  if (!p || p === '.' || p.includes('..')) return true
  if (BLOCKED_DIR.test(p)) return true
  const base = p.split('/').pop() || p
  if (SENSITIVE_BASENAME.test(base) || SENSITIVE_BASENAME.test(p)) return true
  if (SENSITIVE_EXT.test(base)) return true
  if (SENSITIVE_NAME.test(base)) return true
  if (TOKEN_BASENAME.test(base) && !SOURCE_EXT.test(base)) return true
  return false
}

function isInsideRoot(resolved, rootDir) {
  const root = path.posix.resolve(rootDir)
  return resolved === root || resolved.startsWith(root + '/')
}

export function resolveHostDirectory(rawDir) {
  if (!rawDir || typeof rawDir !== 'string') return null
  const normalized = rawDir.replace(/\\/g, '/').replace(/\/+$/, '')
  const resolved = path.posix.resolve(normalized)
  if (!isInsideRoot(resolved, PROJECTS_ROOT)) return null
  return resolved
}

export function normalizeRollbackPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return ''
  return filePath.replace(/\\/g, '/').replace(/\/+$/, '').trim()
}

function parseWorkspaceRoots() {
  if (process.env.WORKSPACE_ROOTS) {
    try {
      const configured = JSON.parse(process.env.WORKSPACE_ROOTS)
      if (Array.isArray(configured)) {
        return configured.filter((root) =>
          root && typeof root.jail === 'string' && typeof root.win === 'string'
        )
      }
    } catch {
      return []
    }
  }
  return []
}

export const WORKSPACE_ROOTS = parseWorkspaceRoots()

function discoverWorkspaceRoots({
  configuredRoots = WORKSPACE_ROOTS,
  candidateBases = WINDOWS_WORKSPACE_BASES,
  listDirectories = (base) => fs.readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name),
  directoryExists = fs.existsSync,
} = {}) {
  const roots = [...configuredRoots]
  for (const base of candidateBases) {
    let entries = []
    try {
      entries = listDirectories(base)
    } catch {
      continue
    }
    const normalizedBase = base.replace(/\\/g, '/')
    for (const name of entries) {
      if (DISALLOWED_WINDOWS_SYSTEM_DIRS.has(String(name).toLowerCase())) continue
      const winPath = path.posix.join(normalizedBase, name)
      roots.push({
        jail: `${PROJECTS_JAIL_ROOT}/${name}`,
        win: winPath,
      })
      if (normalizedBase.toLowerCase() !== 'c:/') {
        roots.push({
          jail: `${PROJECTS_JAIL_ROOT}/AISpace/${name}`,
          win: winPath,
        })
      }
    }
  }
  return roots
}

export function isAllowedExternalPath(_filePath) {
  return false
}

const JAIL_TO_WIN_WORKSPACE_MAPPINGS = [
  { jail: '/home/developer/projects/APISpace', win: 'C:/APISpace' },
  { jail: '/workspace/projects/APISpace', win: 'C:/APISpace' },
  { jail: '/home/developer/projects/AICore', win: 'C:/AICore' },
  { jail: '/workspace/projects/AICore', win: 'C:/AICore' },
  { jail: '/home/developer/projects/AISpace', win: 'C:/Godot/AISpace' },
  { jail: '/workspace/projects/AISpace', win: 'C:/Godot/AISpace' },
  { jail: '/home/developer/projects/ObsidianNote', win: 'C:/ObsidianNote' },
  { jail: '/workspace/projects/ObsidianNote', win: 'C:/ObsidianNote' },
  { jail: '/home/developer/projects/ObsidianDev', win: 'C:/ObsidianDev' },
  { jail: '/workspace/projects/ObsidianDev', win: 'C:/ObsidianDev' },
]

function convertMntPathToWindows(posixPath) {
  const mntMatch = /^\/mnt\/([a-zA-Z])\/(.*)$/.exec(posixPath)
  if (!mntMatch) return null
  return `${mntMatch[1].toUpperCase()}:/${mntMatch[2]}`
}

function mapKnownJailPathToWindows(rawPath) {
  let mapped = rawPath
  for (const m of JAIL_TO_WIN_WORKSPACE_MAPPINGS) {
    if (mapped.startsWith(m.jail)) {
      mapped = mapped.replace(m.jail, m.win)
      break
    }
  }
  const mntConverted = convertMntPathToWindows(mapped)
  return mntConverted || mapped
}

function matchesDiscoveredWinWorkspace(winPathCandidate, roots, directoryExists) {
  const candidateLower = winPathCandidate.toLowerCase()
  return roots.some(({ win }) => {
    const root = normalizeRollbackPath(win).toLowerCase()
    return (candidateLower === root || candidateLower.startsWith(`${root}/`)) && directoryExists(win)
  })
}

export function resolveRollbackDiskPath(rawPath, options = {}) {
  if (!rawPath || typeof rawPath !== 'string') return null
  const posix = normalizeRollbackPath(rawPath)
  if (!posix || posix.includes('..') || isSensitiveGitPath(posix)) return null
  const roots = [...discoverWorkspaceRoots(options)].sort((a, b) => b.jail.length - a.jail.length)
  const directoryExists = options.directoryExists || fs.existsSync

  for (const { jail, win } of roots) {
    if (posix === jail || posix.startsWith(jail + '/')) {
      const rel = posix.slice(jail.length).replace(/^\/+/, '')
      const hostPath = rel ? path.posix.join(win, rel) : win
      const resolved = path.resolve(hostPath)
      const winRoot = path.resolve(win)
      if ((resolved === winRoot || resolved.startsWith(winRoot + path.sep)) && directoryExists(winRoot)) {
        return resolved
      }
    }
  }

  const winCandidate = /^[a-zA-Z]:\//.test(posix) ? posix : convertMntPathToWindows(posix)
  if (winCandidate && matchesDiscoveredWinWorkspace(winCandidate, roots, directoryExists)) {
    return path.resolve(winCandidate)
  }

  const resolvedPosix = path.posix.resolve(posix)
  if (isInsideRoot(resolvedPosix, PROJECTS_ROOT)) {
    return path.resolve(posix)
  }

  return null
}

export function isAllowedRollbackPath(filePath) {
  return resolveRollbackDiskPath(filePath) !== null
}

function unquoteGitPath(raw) {
  const trimmed = raw.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return trimmed
}

export function parsePorcelainPaths(porcelain) {
  const paths = []
  const raw = String(porcelain || '')
  const lines = raw.includes('\0') ? raw.split('\0') : raw.split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    const payload = line.length >= 3 ? line.slice(3) : line
    if (!payload) continue
    const chosen = payload.includes(' -> ') ? payload.split(' -> ').pop() : payload
    if (!chosen) continue
    paths.push(unquoteGitPath(chosen))
  }
  return paths.filter((p) => p && !p.endsWith('/') && !isSensitiveGitPath(p))
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body))
}

function sendOptions(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end()
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 20000,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

function gitErrorMessage(err) {
  if (err && typeof err === 'object' && 'stderr' in err && typeof err.stderr === 'string' && err.stderr.trim()) {
    return err.stderr.trim()
  }
  return err instanceof Error ? err.message : String(err)
}

function runGitCheckpoint(directory, title, summary) {
  const jailDir = resolveHostDirectory(directory)
  if (!jailDir) {
    return { ok: false, error: 'directory is not an allowed project path' }
  }
  const diskPath = resolveRollbackDiskPath(jailDir)
  const cwd = diskPath || jailDir
  if (!fs.existsSync(cwd)) {
    return { ok: false, error: 'directory does not exist' }
  }

  try {
    const inside = git(cwd, ['rev-parse', '--is-inside-work-tree']).trim()
    if (inside !== 'true') {
      return { ok: true, skipped: 'not-a-git-repo' }
    }
  } catch {
    return { ok: true, skipped: 'not-a-git-repo' }
  }

  let porcelain = ''
  try {
    porcelain = git(cwd, ['status', '--porcelain', '-uall', '-z'])
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  const paths = parsePorcelainPaths(porcelain)
  if (paths.length === 0) {
    return { ok: true, skipped: 'zero-diff' }
  }

  try {
    git(cwd, ['add', '--', ...paths])
  } catch (err) {
    return { ok: false, error: gitErrorMessage(err) }
  }

  try {
    git(cwd, ['diff', '--cached', '--quiet'])
    return { ok: true, skipped: 'zero-diff' }
  } catch {
    // non-zero means there is a staged diff — continue
  }

  const safeTitle = String(title || 'Untitled Session').replace(/[\r\n]+/g, ' ').trim().slice(0, 180)
  const safeSummary = String(summary || 'workspace changes').replace(/[\r\n]+/g, ' ').trim().slice(0, 180)
  const message = `[OpenCode-Checkpoint] ${safeTitle}: ${safeSummary}`

  try {
    git(cwd, [
      '-c',
      'user.name=OpenCode Companion',
      '-c',
      'user.email=opencode-companion@local',
      'commit',
      '--no-verify',
      '-m',
      message,
    ])
  } catch (err) {
    const msg = gitErrorMessage(err)
    if (/nothing to commit/i.test(msg)) {
      return { ok: true, skipped: 'zero-diff' }
    }
    return { ok: false, error: msg }
  }

  return { ok: true, committed: true, files: paths, message }
}

export function runGitRevert(directory, mode = 'revert') {
  const jailDir = resolveHostDirectory(directory)
  const diskPath = resolveRollbackDiskPath(jailDir || directory)
  const cwd = diskPath || jailDir
  if (!cwd) {
    return { ok: false, status: 400, error: 'directory is not an allowed project path' }
  }
  if (!fs.existsSync(cwd)) {
    return { ok: false, status: 404, error: 'directory does not exist' }
  }
  try {
    const args = mode === 'reset' ? ['reset', 'HEAD~1', '--soft'] : ['revert', 'HEAD', '--no-edit']
    const out = git(cwd, args)
    return { ok: true, output: out }
  } catch (err) {
    return { ok: false, status: 500, error: gitErrorMessage(err) }
  }
}

function collectWorkspaceSymlinkRoots(roots) {
  const extraWinRoots = []
  for (const { win } of roots) {
    extraWinRoots.push(win)
    try {
      const entries = fs.readdirSync(win, { withFileTypes: true })
      for (const ent of entries) {
        if (ent.isSymbolicLink() || ent.isDirectory()) {
          const full = path.join(win, ent.name)
          try {
            const real = fs.realpathSync(full)
            if (real && real !== full) {
              extraWinRoots.push(full, real)
            }
          } catch {}
        }
      }
    } catch {}
  }
  return extraWinRoots
}

function runExternalRollback(actions) {
  // Browser-supplied file contents and inferred deletes are never authoritative.
  if (!Array.isArray(actions) || !actions.length || actions.some((action) => action?.kind !== 'snapshot' || typeof action.session !== 'string' || typeof action.call !== 'string')) {
    return { ok: false, error: 'Full pre-mutation snapshot references are required' }
  }
  if (new Set(actions.map((action) => action.session)).size !== 1) return { ok: false, error: 'Mixed snapshot sessions are not allowed' }
  const roots = discoverWorkspaceRoots()
  const desktop = process.platform === 'win32' && process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Desktop') : '/mnt/desktop'
  const extraWinRoots = collectWorkspaceSymlinkRoots(roots)
  const store = createSnapshotStore({
    allowedRoots: [
      ...extraWinRoots,
      PROJECTS_ROOT,
      ...(process.platform === 'win32'
        ? []
        : ['AISpace', 'ObsidianNote', 'ObsidianDev', 'APISpace', 'AICore'].map((name) => `${PROJECTS_JAIL_ROOT}/${name}`)),
      desktop,
    ],
    resolvePath: (raw) => {
      if (raw.startsWith('/mnt/desktop/')) return path.resolve(desktop, raw.slice('/mnt/desktop/'.length))
      if (process.platform !== 'win32' && raw.startsWith(PROJECTS_JAIL_ROOT + '/')) return path.resolve(raw)
      return resolveRollbackDiskPath(raw)
    },
  })
  try {
    return store.restore(actions[0].session, actions.map((action) => action.call))
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export const ROUTING_SSOT_PATHS = [
  'C:\\ObsidianNote\\.opencode\\opencode-routing.json',
  'C:/ObsidianNote/.opencode/opencode-routing.json',
  '/home/developer/.config/opencode/opencode-routing.json',
  '/home/developer/projects/ObsidianNote/.opencode/opencode-routing.json',
]

export const MODEL_PROFILE_PATHS = [
  'C:\\AIModelRegistry\\registry.json',
  'C:/AIModelRegistry/registry.json',
  '/mnt/c/AIModelRegistry/registry.json',
  'C:\\AICore\\skills\\OpenCodeDataControl\\scripts\\data\\model_profiles.json',
  'C:/AICore/skills/OpenCodeDataControl/scripts/data/model_profiles.json',
  '/mnt/c/AICore/skills/OpenCodeDataControl/scripts/data/model_profiles.json',
  '/home/developer/projects/AICore/skills/OpenCodeDataControl/scripts/data/model_profiles.json',
]

export function resolveModelProfiles(customPath = null) {
  const candidatePaths = customPath ? [customPath] : MODEL_PROFILE_PATHS
  let targetPath = null
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      targetPath = p
      break
    }
  }

  if (!targetPath) {
    return { ok: false, error: 'model profiles not found' }
  }

  try {
    const content = fs.readFileSync(targetPath, 'utf8')
    const data = JSON.parse(content)
    let profiles = data.profiles || {}
    let aliases = data.aliases || {}
    let defaultModelId = data.default_model_id || 'unknown'

    if (data.models && typeof data.models === 'object') {
      profiles = {}
      aliases = {}
      if (!customPath) {
        for (const bp of MODEL_PROFILE_PATHS) {
          if (bp !== targetPath && bp.endsWith('model_profiles.json') && fs.existsSync(bp)) {
            try {
              const baseData = JSON.parse(fs.readFileSync(bp, 'utf8'))
              if (baseData && typeof baseData.profiles === 'object') {
                Object.assign(profiles, baseData.profiles)
              }
              if (baseData && typeof baseData.aliases === 'object') {
                Object.assign(aliases, baseData.aliases)
              }
              break
            } catch {}
          }
        }
      }
      for (const [mid, mdata] of Object.entries(data.models)) {
        if (mdata && mdata.context) {
          profiles[mid] = {
            ...(profiles[mid] || {}),
            display_name: mdata.display_name || profiles[mid]?.display_name || mid,
            family: mdata.family || profiles[mid]?.family || 'unknown',
            ...mdata.context,
          }
        }
        if (mdata && Array.isArray(mdata.aliases)) {
          for (const alias of mdata.aliases) {
            aliases[alias] = mid
          }
        }
      }
      if (!profiles.unknown) {
        profiles.unknown = {
          display_name: 'Unknown / unlisted model',
          family: 'unknown',
          api_context_tokens: 200000,
          effective_context_tokens: 180000,
          warn_tokens: 120000,
          human_gate_tokens: 160000,
          reset_tokens: 180000,
        }
      }
      defaultModelId = (data.roles?.default_model || 'unknown').split('/').pop() || 'unknown'
    }

    return {
      ok: true,
      path: targetPath,
      version: data.version || 1,
      default_model_id: defaultModelId,
      aliases,
      profiles,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function writeRoutingDocument(document, baseRevision, customPath = null) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return { ok: false, status: 400, error: 'document must be an object' }
  }
  if (!Array.isArray(document.standaloneModels)) {
    return { ok: false, status: 400, error: 'standaloneModels must be an array' }
  }
  const located = locateRoutingFile(customPath)
  if (!located.ok) return located
  let current = {}
  try {
    current = JSON.parse(located.content)
  } catch (err) {
    return { ok: false, status: 400, error: err instanceof Error ? err.message : String(err) }
  }
  if (typeof baseRevision === 'number' && current.revision !== baseRevision) {
    return {
      ok: false,
      status: 409,
      error: 'revision conflict',
      revision: current.revision,
      document: current,
    }
  }
  const next = {
    ...current,
    ...document,
    groups: Array.isArray(current.groups) ? current.groups : [],
    activeGroupIds: Array.isArray(current.activeGroupIds) ? current.activeGroupIds : [],
    revision: (typeof current.revision === 'number' ? current.revision : 0) + 1,
    updatedAt: new Date().toISOString(),
  }
  const text = `${JSON.stringify(next, null, 2)}\n`
  const tmp = `${located.path}.tmp`
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, located.path)
  return { ok: true, path: located.path, revision: next.revision, document: next }
}

function locateRoutingFile(customPath = null) {
  const candidatePaths = customPath ? [customPath] : ROUTING_SSOT_PATHS
  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        return { ok: true, path: candidate, content: fs.readFileSync(candidate, 'utf8') }
      } catch (err) {
        return { ok: false, status: 500, error: err instanceof Error ? err.message : String(err) }
      }
    }
  }
  return { ok: false, status: 404, error: 'routing config not found' }
}

export function resolveRoutingConfig(customPath = null) {
  const located = locateRoutingFile(customPath)
  if (!located.ok) return located
  const targetPath = located.path

  try {
    const content = located.content
    const data = JSON.parse(content)

    let target = data.selectedActiveTarget || null
    if (!target && data.subagents?.executor?.targetId) {
      target = data.subagents.executor.targetId
    }
    if (!target && data.subagents?.planner?.targetId) {
      target = data.subagents.planner.targetId
    }
    if (!target && Array.isArray(data.activeStandaloneModelIds) && data.activeStandaloneModelIds.length > 0) {
      target = data.activeStandaloneModelIds[0]
    }
    if (!target && Array.isArray(data.standaloneModels)) {
      const primary = data.standaloneModels.find((m) => m && m.enabled && m.tags?.includes('primary'))
      if (primary) target = primary.id
    }

    let seniorModel = null
    if (target && typeof target === 'string' && target.includes('/')) {
      const [providerID, ...rest] = target.split('/')
      const modelID = rest.join('/')
      let name = `${modelID}`
      if (Array.isArray(data.standaloneModels)) {
        const found = data.standaloneModels.find((m) => m && m.id === target)
        if (found?.name) name = found.name
      }
      seniorModel = {
        providerID,
        modelID,
        name,
      }
    }

    const modelProfiles = resolveModelProfiles()

    return {
      ok: true,
      path: targetPath,
      selectedActiveTarget: target,
      seniorModel,
      activeStandaloneModelIds: data.activeStandaloneModelIds || [],
      revision: typeof data.revision === 'number' ? data.revision : 0,
      document: data,
      subagents: data.subagents || {},
      modelProfiles: modelProfiles.ok ? modelProfiles : undefined,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function getCanonicalFileKey(pathOrName) {
  if (!pathOrName) return ''
  const base = path.posix.basename(pathOrName).split(/[?#]/)[0]
  const lastDot = base.lastIndexOf('.')
  const ext = lastDot > 0 ? base.slice(lastDot).toLowerCase() : ''
  const nameWithoutExt = ext ? base.slice(0, -ext.length) : base
  const tokens = nameWithoutExt
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((tok) => tok.length > 0)
  if (tokens.length === 0) return base.toLowerCase()
  return `${tokens.join('_')}${ext}`
}

function findMatchingFilesInDir(rootDir, targetName, maxDepth = 4, maxMatches = 10) {
  const matches = []
  const targetLower = targetName.toLowerCase()
  const targetKey = getCanonicalFileKey(targetName)
  const IGNORE_DIRS = new Set([
    'node_modules', '.git', '.godot', 'bin', 'obj', 'dist', 'build',
    '.temp', 'temp', '.cache', 'coverage', '.system_generated'
  ])

  function scan(currentDir, depth) {
    if (depth > maxDepth || matches.length >= maxMatches) return
    let entries = []
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const nameLower = entry.name.toLowerCase()
        if (!IGNORE_DIRS.has(nameLower) && !entry.name.startsWith('.')) {
          scan(path.posix.join(currentDir, entry.name), depth + 1)
        }
      } else if (entry.isFile()) {
        const entryLower = entry.name.toLowerCase()
        if (entryLower === targetLower || (targetKey && getCanonicalFileKey(entry.name) === targetKey)) {
          matches.push(path.posix.join(currentDir, entry.name))
        }
      }
    }
  }

  try {
    if (fs.existsSync(rootDir) && fs.statSync(rootDir).isDirectory()) {
      scan(rootDir.replace(/\\/g, '/'), 1)
    }
  } catch {}

  return matches
}

export function readFileFromWorkspace(rawPath, options = {}) {
  if (!rawPath || typeof rawPath !== 'string') {
    return { ok: false, error: 'invalid path' }
  }
  let p = rawPath.trim()
  p = p.replace(/^[`'"]+|[`'"]+$/g, '').trim()
  if (p.startsWith('file:///')) p = p.slice(8)
  else if (p.startsWith('file://')) p = p.slice(7)
  p = p.replace(/^[`'"]+|[`'"]+$/g, '').trim()
  p = p.replace(/#L\d+(?:-[A-Za-z0-9]+)?$/i, '')
  p = p.replace(/#L\d+(?:-\d+)?$/i, '').replace(/:\d+(?::\d+)?$/, '').replace(/\(\d+(?:,\s*\d+)?\)$/, '')
  p = p.replace(/\?[^#]*$/, '')
  try {
    if (p.includes('%')) {
      p = decodeURIComponent(p)
    }
  } catch {}
  p = p.replace(/^[`'"]+|[`'"]+$/g, '').trim()
  if (/^\/[a-zA-Z]:[/\\\\]/.test(p)) p = p.slice(1)
  if (!p) return { ok: false, error: 'invalid path' }

  // Map Godot res:// resource scheme
  if (p.startsWith('res://')) {
    p = `C:/Godot/AISpace/${p.slice(6)}`
  }

  // Refuse sensitive files immediately
  if (isSensitiveGitPath(p)) {
    return { ok: false, error: 'Access denied: sensitive file path' }
  }

  p = mapKnownJailPathToWindows(p)

  // Handle direct workspace name prefix without drive letter (e.g. "AISpace/...", "ObsidianNote/...")
  const wsPrefixMatch = p.match(/^(?:projects\/)?(apispace|aicore|aispace|obsidiannote|obsidiandev)\/(.*)$/i)
  if (wsPrefixMatch) {
    const wsName = wsPrefixMatch[1].toLowerCase()
    const rel = wsPrefixMatch[2]
    const wsBaseMap = {
      aicore: 'C:/AICore',
      aispace: 'C:/Godot/AISpace',
      obsidiannote: 'C:/ObsidianNote',
      obsidiandev: 'C:/ObsidianDev',
      apispace: 'C:/APISpace',
    }
    p = `${wsBaseMap[wsName] || 'C:/APISpace'}/${rel}`
  }

  // Normalize directory context from options if provided
  let activeDir = null
  if (options && typeof options.directory === 'string' && options.directory.trim()) {
    const d = mapKnownJailPathToWindows(options.directory.trim())
    if (/^[a-zA-Z]:[/\\\\]/.test(d)) {
      activeDir = d.replace(/\\/g, '/')
    }
  }

  const workspaceBases = []
  if (activeDir) workspaceBases.push(activeDir)
  const defaultBases = [
    'C:/Godot/AISpace',
    'C:/APISpace',
    'C:/APISpace/opencode-companion',
    'C:/AICore',
    'C:/ObsidianNote',
    'C:/ObsidianDev',
  ]
  for (const b of defaultBases) {
    if (!workspaceBases.includes(b)) workspaceBases.push(b)
  }

  function tryReadFile(filePath) {
    try {
      if (isSensitiveGitPath(filePath)) return null
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const stats = fs.statSync(filePath)
        if (stats.size > 5_000_000) {
          return { ok: false, error: 'File too large (>5MB)' }
        }
        const content = fs.readFileSync(filePath, 'utf8')
        return {
          ok: true,
          filePath: filePath.replace(/\//g, '\\'),
          fileName: path.basename(filePath),
          content,
          lineCount: content.split('\n').length,
          byteSize: Buffer.byteLength(content, 'utf8'),
        }
      }
    } catch {}
    return null
  }

  function findCanonicalFileInDir(dir, key) {
    if (!key || !fs.existsSync(dir)) return null
    try {
      const files = fs.readdirSync(dir)
      for (const f of files) {
        if (getCanonicalFileKey(f) === key) {
          const matched = tryReadFile(path.posix.join(dir, f))
          if (matched) return matched
        }
      }
    } catch {}
    return null
  }

  // Stage 1: Exact / Absolute candidates
  if (/^[a-zA-Z]:[/\\\\]/.test(p)) {
    const normP = p.replace(/\\/g, '/')
    const direct = tryReadFile(normP)
    if (direct) return direct

    const canonicalMatch = findCanonicalFileInDir(
      path.posix.dirname(normP),
      getCanonicalFileKey(path.posix.basename(normP))
    )
    if (canonicalMatch) return canonicalMatch
  }

  const cleanRel = p.replace(/^[/\\\\]+/, '').replace(/\\/g, '/')
  const targetKey = getCanonicalFileKey(cleanRel)

  // Stage 2: Direct resolution against workspace bases
  for (const base of workspaceBases) {
    const candidate = path.posix.join(base, cleanRel)
    const direct = tryReadFile(candidate)
    if (direct) return direct

    if (!cleanRel.includes('/')) {
      const canonicalMatch = findCanonicalFileInDir(base, targetKey)
      if (canonicalMatch) return canonicalMatch
    }
  }

  // Stage 3: Subdirectory suffix matching (if cleanRel had subdirectories, e.g. "TodoData/Backpack_Meta_D.md")
  if (cleanRel.includes('/')) {
    for (const base of workspaceBases) {
      const baseName = path.posix.basename(base)
      if (cleanRel.toLowerCase().startsWith(baseName.toLowerCase() + '/')) {
        const subRel = cleanRel.slice(baseName.length + 1)
        const direct = tryReadFile(path.posix.join(base, subRel))
        if (direct) return direct
      }
    }
  }

  // Stage 4: Smart Disambiguated Search (for bare filename or partial path)
  // Contract: Find the file across relevant workspaces without ever finding the wrong file.
  const targetName = path.posix.basename(cleanRel)
  const targetSuffix = cleanRel.toLowerCase()

  // 4a. If activeDir is provided, search inside activeDir first
  if (activeDir && fs.existsSync(activeDir)) {
    const localMatches = findMatchingFilesInDir(activeDir, targetName, 5).filter(
      (m) => m.toLowerCase().endsWith(targetSuffix) && !isSensitiveGitPath(m)
    )
    if (localMatches.length === 1) {
      const direct = tryReadFile(localMatches[0])
      if (direct) return direct
    } else if (localMatches.length > 1) {
      const exactCase = localMatches.filter((m) => m.endsWith(cleanRel))
      if (exactCase.length === 1) {
        const direct = tryReadFile(exactCase[0])
        if (direct) return direct
      }
    }
  }

  // 4b. Order bases by domain relevance
  const sortedBases = [...workspaceBases].sort((a, b) => {
    const aLow = a.toLowerCase()
    const bLow = b.toLowerCase()
    const ext = path.posix.extname(targetName).toLowerCase()

    if (['.cs', '.gd', '.tscn', '.tres'].includes(ext)) {
      if (aLow.includes('aispace')) return -1
      if (bLow.includes('aispace')) return 1
    }
    if (['.ts', '.tsx', '.vue', '.html', '.css'].includes(ext)) {
      if (aLow.includes('apispace')) return -1
      if (bLow.includes('apispace')) return 1
    }
    if (targetName.toLowerCase() === 'skill.md' || aLow.includes('aicore')) {
      if (aLow.includes('aicore')) return -1
      if (bLow.includes('aicore')) return 1
    }
    if (ext === '.md') {
      if (aLow.includes('obsidiannote')) return -1
      if (bLow.includes('obsidiannote')) return 1
    }
    return 0
  })

  const allMatches = []
  for (const base of sortedBases) {
    if (!fs.existsSync(base)) continue
    const found = findMatchingFilesInDir(base, targetName, 4).filter(
      (m) => m.toLowerCase().endsWith(targetSuffix) && !isSensitiveGitPath(m)
    )
    for (const f of found) {
      if (!allMatches.includes(f)) allMatches.push(f)
    }
  }

  if (allMatches.length === 1) {
    const direct = tryReadFile(allMatches[0])
    if (direct) return direct
  } else if (allMatches.length > 1) {
    if (activeDir) {
      const activeMatch = allMatches.filter((m) => m.startsWith(activeDir))
      if (activeMatch.length === 1) {
        const direct = tryReadFile(activeMatch[0])
        if (direct) return direct
      }
    }
    return {
      ok: false,
      error: `Ambiguous file: found ${allMatches.length} candidates for ${rawPath}`,
      candidates: allMatches.map((m) => m.replace(/\//g, '\\')),
    }
  }

  return { ok: false, error: `File not found: ${rawPath}` }
}

export async function handleHostApi(req, res) {
  const rawUrl = req.url || ''
  const queryAt = rawUrl.indexOf('?')
  const url = queryAt >= 0 ? rawUrl.slice(0, queryAt) : rawUrl
  const query = new URLSearchParams(queryAt >= 0 ? rawUrl.slice(queryAt + 1) : '')
  if (
    url !== '/api/git-checkpoint' &&
    url !== '/api/git-revert' &&
    url !== '/api/external-file-rollback' &&
    url !== '/api/routing-config' &&
    url !== '/api/skills' &&
    url !== '/api/model-profiles' &&
    url !== '/api/open-external' &&
    url !== '/api/file-content'
  ) {
    return false
  }

  if (req.method === 'OPTIONS') {
    sendOptions(res)
    return true
  }

  if (url === '/api/file-content') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method not allowed' })
      return true
    }
    const targetPath = query.get('path') || ''
    if (!targetPath) {
      sendJson(res, 400, { ok: false, error: 'path query parameter is required' })
      return true
    }
    const directory = query.get('directory') || ''
    const result = readFileFromWorkspace(targetPath, { directory })
    sendJson(res, result.ok ? 200 : 404, result)
    return true
  }

  if (url === '/api/routing-config') {
    if (req.method === 'GET') {
      const result = resolveRoutingConfig()
      sendJson(res, result.ok ? 200 : 404, result)
      return true
    }
    if (req.method === 'PUT') {
      try {
        const raw = await readBody(req)
        const body = raw ? JSON.parse(raw) : {}
        const result = writeRoutingDocument(body.document, body.baseRevision)
        sendJson(res, result.ok ? 200 : result.status || 400, result)
      } catch (err) {
        sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) })
      }
      return true
    }
    sendJson(res, 405, { error: 'method not allowed' })
    return true
  }

  if (url === '/api/model-profiles') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method not allowed' })
      return true
    }
    const result = resolveModelProfiles()
    sendJson(res, result.ok ? 200 : 404, result)
    return true
  }

  if (url === '/api/skills') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method not allowed' })
      return true
    }
    const workspaceDir = resolveSkillWorkspace(query.get('directory') || '')
    const skills = skillScan.list({ workspaceDir: workspaceDir || undefined })
    sendJson(res, 200, { ok: true, skills })
    return true
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' })
    return true
  }

  try {
    const raw = await readBody(req)
    const body = raw ? JSON.parse(raw) : {}
    if (url === '/api/git-checkpoint') {
      sendJson(res, 200, runGitCheckpoint(body.directory, body.title, body.summary))
      return true
    }
    if (url === '/api/git-revert') {
      const result = runGitRevert(body.directory, body.mode)
      sendJson(res, result.ok ? 200 : result.status || 400, result)
      return true
    }
    if (url === '/api/open-external') {
      const { filePath, target, line } = body
      if (target === 'vscode') {
        const resObj = openInVSCode(filePath, line)
        sendJson(res, resObj.ok ? 200 : 400, resObj)
        return true
      }
      if (target === 'explorer') {
        const resObj = openInExplorer(filePath)
        sendJson(res, resObj.ok ? 200 : 400, resObj)
        return true
      }
      sendJson(res, 400, { ok: false, error: 'target must be "vscode" or "explorer"' })
      return true
    }
    console.log(`[Revert:HostApi] Received POST /api/external-file-rollback: ${body.actions?.length || 0} action(s)`)
    const result = runExternalRollback(body.actions)
    console.log(`[Revert:HostApi] Returning result:`, JSON.stringify(result))
    sendJson(res, result.ok ? 200 : 409, result)
    return true
  } catch (err) {
    console.error(`[Revert:HostApi] Request handling error:`, err)
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
    return true
  }
}
