import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const PROJECTS_ROOT = process.env.PROJECTS_ROOT || '/workspace/projects/'
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
      return JSON.parse(process.env.WORKSPACE_ROOTS)
    } catch {
      return []
    }
  }
  return []
}

export const WORKSPACE_ROOTS = parseWorkspaceRoots()

export function isAllowedExternalPath(_filePath) {
  return false
}

export function resolveRollbackDiskPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null
  const posix = normalizeRollbackPath(rawPath)
  if (!posix || posix.includes('..') || isSensitiveGitPath(posix)) return null

  // 1. Check if it matches a mapped jail path
  for (const { jail, win } of WORKSPACE_ROOTS) {
    if (posix === jail || posix.startsWith(jail + '/')) {
      const rel = posix.slice(jail.length).replace(/^\/+/, '')
      const hostPath = rel ? path.posix.join(win, rel) : win
      const resolved = path.resolve(hostPath)
      const winRoot = path.resolve(win)
      if (resolved === winRoot || resolved.startsWith(winRoot + path.sep)) {
        return resolved
      }
    }
  }

  // 2. Check if it is already a Windows path under one of the allowed roots
  for (const { win } of WORKSPACE_ROOTS) {
    const normWin = win.toLowerCase()
    if (posix.toLowerCase() === normWin || posix.toLowerCase().startsWith(normWin + '/')) {
      const resolved = path.resolve(posix)
      const winRoot = path.resolve(win)
      if (resolved === winRoot || resolved.startsWith(winRoot + path.sep)) {
        return resolved
      }
    }
  }

  // 3. Fallback for pure POSIX jail path (e.g. pure test environment)
  if (isInsideRoot(path.posix.resolve(posix), PROJECTS_ROOT)) {
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function findGitRepoRoot(targetPath) {
  try {
    let dir = fs.statSync(targetPath, { throwIfNoEntry: false })?.isDirectory()
      ? targetPath
      : path.dirname(targetPath)
    while (dir) {
      if (fs.existsSync(path.join(dir, '.git'))) {
        return dir
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch {}
  return null
}

function runExternalRollback(actions) {
  if (!Array.isArray(actions)) {
    console.error('[Revert:HostApi] runExternalRollback error: actions is not an array')
    return { ok: false, error: 'actions must be an array' }
  }
  console.log(`[Revert:HostApi] Processing ${actions.length} external rollback action(s)`)
  const applied = []
  for (const action of actions) {
    if (!action || typeof action !== 'object') continue
    const resolved = resolveRollbackDiskPath(action.path)
    if (!resolved) {
      console.warn(`[Revert:HostApi] Rejected unresolvable/unallowed path: "${action.path}"`)
      continue
    }
    console.log(`[Revert:HostApi] Action: kind=${action.kind}, path=${action.path} -> resolved=${resolved}`)
    if (action.kind === 'delete') {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        try {
          execFileSync('python', ['C:\\scripts\\safe_delete_agent.py', resolved], {
            timeout: 5000,
            stdio: ['ignore', 'ignore', 'ignore'],
          })
          console.log(`[Revert:HostApi] Safe-deleted file via agent: ${resolved}`)
        } catch {
          fs.unlinkSync(resolved)
          console.log(`[Revert:HostApi] Unlinked file via fs: ${resolved}`)
        }
      } else {
        console.log(`[Revert:HostApi] File does not exist for deletion (already gone): ${resolved}`)
      }
      applied.push({ kind: 'delete', path: resolved })
      continue
    }
    if (action.kind === 'restore') {
      if (typeof action.content === 'string' && action.content.length > 0) {
        fs.mkdirSync(path.dirname(resolved), { recursive: true })
        fs.writeFileSync(resolved, action.content, 'utf8')
        console.log(`[Revert:HostApi] Restored file content directly (${action.content.length} chars): ${resolved}`)
        applied.push({ kind: 'restore', path: resolved, method: 'content' })
        continue
      }
      // Git restore fallback if content is not available or empty
      const repoDir = findGitRepoRoot(resolved)
      if (repoDir) {
        try {
          const rel = path.relative(repoDir, resolved)
          git(repoDir, ['checkout', '--', rel])
          console.log(`[Revert:HostApi] Restored file via git checkout in ${repoDir}: ${rel}`)
          applied.push({ kind: 'restore', path: resolved, method: 'git' })
          continue
        } catch (gitErr) {
          console.warn(`[Revert:HostApi] Git restore failed for ${resolved}:`, gitErrorMessage(gitErr))
        }
      } else {
        console.warn(`[Revert:HostApi] No git repository found to restore file: ${resolved}`)
      }
    }
  }
  console.log(`[Revert:HostApi] Successfully applied ${applied.length} / ${actions.length} action(s)`)
  return { ok: true, applied }
}

export async function handleHostApi(req, res) {
  const url = (req.url || '').split('?')[0]
  if (url !== '/api/git-checkpoint' && url !== '/api/external-file-rollback') {
    return false
  }

  if (req.method === 'OPTIONS') {
    sendOptions(res)
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
    console.log(`[Revert:HostApi] Received POST /api/external-file-rollback: ${body.actions?.length || 0} action(s)`)
    const result = runExternalRollback(body.actions)
    console.log(`[Revert:HostApi] Returning result:`, JSON.stringify(result))
    sendJson(res, 200, result)
    return true
  } catch (err) {
    console.error(`[Revert:HostApi] Request handling error:`, err)
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
    return true
  }
}
