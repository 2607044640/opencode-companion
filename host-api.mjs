import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const PROJECTS_ROOT = '/home/developer/projects/'
const DESKTOP_JAIL = '/mnt/desktop/'
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
  const root = path.resolve(rootDir)
  return resolved === root || resolved.startsWith(root + path.sep)
}

export function resolveHostDirectory(rawDir) {
  if (!rawDir || typeof rawDir !== 'string') return null
  let normalized = rawDir.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normalized.startsWith('/workspace/projects/')) {
    normalized = `/home/developer/projects/${normalized.slice('/workspace/projects/'.length)}`
  }
  const resolved = path.resolve(normalized)
  if (!isInsideRoot(resolved, PROJECTS_ROOT)) return null
  return resolved
}

export function normalizeRollbackPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return ''
  const posix = filePath.replace(/\\/g, '/').replace(/\/+$/, '').trim()
  const winDesk = posix.match(/^[a-zA-Z]:\/Users\/[^/]+\/(?:OneDrive\/)?Desktop\/(.*)$/i)
  if (winDesk?.[1] !== undefined) return `/mnt/desktop/${winDesk[1]}`
  const wslDesk = posix.match(/^\/mnt\/[a-zA-Z]\/Users\/[^/]+\/(?:OneDrive\/)?Desktop\/(.*)$/i)
  if (wslDesk?.[1] !== undefined) return `/mnt/desktop/${wslDesk[1]}`
  if (posix.startsWith('/workspace/projects/')) {
    return `/home/developer/projects/${posix.slice('/workspace/projects/'.length)}`
  }
  return posix
}

export function isAllowedExternalPath(filePath) {
  const posix = normalizeRollbackPath(filePath)
  if (!posix || posix.includes('..')) return false
  const resolved = path.resolve(posix).replace(/\\/g, '/')
  if (resolved === '/mnt/desktop' || resolved.startsWith(DESKTOP_JAIL)) return true
  if (posix === '/mnt/desktop' || posix.startsWith(DESKTOP_JAIL)) return true
  return false
}

export function isAllowedRollbackPath(filePath) {
  const posix = normalizeRollbackPath(filePath)
  if (!posix || posix.includes('..') || isSensitiveGitPath(posix)) return false
  if (isAllowedExternalPath(posix)) return true
  const resolved = path.resolve(posix)
  return isInsideRoot(resolved, PROJECTS_ROOT)
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
  const cwd = resolveHostDirectory(directory)
  if (!cwd) {
    return { ok: false, error: 'directory is not an allowed project path' }
  }
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

function runExternalRollback(actions) {
  if (!Array.isArray(actions)) {
    return { ok: false, error: 'actions must be an array' }
  }
  const applied = []
  for (const action of actions) {
    if (!action || typeof action !== 'object') continue
    const filePath = typeof action.path === 'string' ? normalizeRollbackPath(action.path) : ''
    if (!isAllowedRollbackPath(filePath)) {
      continue
    }
    const resolved = path.resolve(filePath)
    if (action.kind === 'delete') {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        fs.unlinkSync(resolved)
      }
      applied.push({ kind: 'delete', path: resolved })
      continue
    }
    if (action.kind === 'restore' && typeof action.content === 'string') {
      fs.mkdirSync(path.dirname(resolved), { recursive: true })
      fs.writeFileSync(resolved, action.content, 'utf8')
      applied.push({ kind: 'restore', path: resolved })
    }
  }
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
    sendJson(res, 200, runExternalRollback(body.actions))
    return true
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
    return true
  }
}
