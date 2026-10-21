import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const STORE = fileURLToPath(new URL('./.agent-work/revert-snapshots/', import.meta.url))
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
const inside = (file, root) => file === root || file.startsWith(root + path.sep)
const protectedPath = /(?:^|[\\/])(?:\.env[^\\/]*|\.git|\.ssh|\.aws|\.azure|APIGatewayData|one-api\.db)(?:[\\/]|$)|(?:secret|credential|password|private[_-]?key)|\.(?:pem|key|p12|pfx)$/i

// Snapshot bytes never enter tool output or the conversation; only opaque references do.
export function createSnapshotStore({ root = STORE, resolvePath = (file) => path.resolve(file), allowedRoots = [], safeDelete } = {}) {
  function target(raw) {
    if (typeof raw !== 'string' || (!path.isAbsolute(raw) && !/^[A-Za-z]:[\\/]/.test(raw)) || protectedPath.test(raw)) throw new Error('Snapshot path is protected or not absolute')
    const resolved = resolvePath(raw)
    if (!resolved || !allowedRoots.some((base) => inside(resolved, path.resolve(base)))) throw new Error('Snapshot path is outside allowed roots')
    const base = allowedRoots.map((root) => path.resolve(root)).filter((root) => inside(resolved, root)).sort((a, b) => b.length - a.length)[0]
    const physicalRoot = fs.realpathSync(base)
    let current = resolved
    while (true) {
      const stat = fs.lstatSync(current, { throwIfNoEntry: false })
      if (stat && !inside(fs.realpathSync(current), physicalRoot)) throw new Error('Snapshot path escapes its physical root')
      if (stat?.isSymbolicLink() && current !== base) throw new Error('Snapshot symlink paths are not supported')
      if (current === base) break
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
    if (inside(resolved, path.resolve(root))) throw new Error('Cannot snapshot snapshot storage')
    return resolved
  }
  function read(file) {
    const stat = fs.statSync(file, { throwIfNoEntry: false })
    if (!stat) return { exists: false, digest: null, bytes: null }
    if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('Snapshot requires a regular file of at most 32 MiB')
    const bytes = fs.readFileSync(file)
    return { exists: true, digest: hash(bytes), bytes }
  }
  function location(session, call) {
    if (!session || !call) throw new Error('Snapshot requires session and call identifiers')
    return path.join(root, hash(String(session)), `${hash(String(call))}.json`)
  }
  function persist(file, record) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    const temporary = `${file}.${crypto.randomUUID()}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(record), { flag: 'wx', mode: 0o600 })
    fs.renameSync(temporary, file)
  }
  function load(session, call) {
    const record = JSON.parse(fs.readFileSync(location(session, call), 'utf8'))
    if (record.version !== 1 || record.session !== session || record.call !== call) throw new Error('Invalid snapshot identity')
    return record
  }
  return {
    capture(session, call, paths) {
      const file = location(session, call)
      if (fs.existsSync(file)) throw new Error('Duplicate snapshot call')
      const entries = [...new Set(paths)].map((raw) => {
        const state = read(target(raw))
        return { path: raw, exists: state.exists, before: state.digest, content: state.bytes?.toString('base64') ?? null }
      })
      if (!entries.length) throw new Error('No snapshot paths')
      persist(file, { version: 1, session, call, entries })
    },
    finish(session, call) {
      const record = load(session, call)
      for (const entry of record.entries) entry.after = read(target(entry.path)).digest
      record.complete = true
      persist(location(session, call), record)
      return { version: 1, session, call, paths: record.entries.map((entry) => entry.path) }
    },
    restore(session, calls) {
      if (!Array.isArray(calls) || !calls.length) throw new Error('No snapshot calls supplied')
      const files = new Map()
      for (const call of [...new Set(calls)]) {
        const record = load(session, call)
        if (!record.complete) throw new Error('Snapshot tool completion is missing')
        for (const entry of record.entries) {
          const disk = target(entry.path)
          const bytes = entry.exists ? Buffer.from(entry.content, 'base64') : null
          if ((bytes === null ? null : hash(bytes)) !== entry.before) throw new Error('Snapshot integrity check failed')
          const previous = files.get(disk)
          // Call order is the active message list, not a linear hash chain. A reverted
          // or branched turn drops intermediate calls, so later snapshots may not start
          // where the previous kept call ended. The first call in the request is the
          // earliest recorded pre-mutation state for this file.
          const seen = previous?.seen ?? []
          files.set(disk, {
            ...entry,
            bytes: previous ? previous.bytes : bytes,
            before: previous ? previous.before : entry.before,
            seen: [...seen, entry.before, entry.after],
          })
        }
      }
      // Preflight every file before any mutation. A retry after partial I/O failure is safe.
      for (const [disk, entry] of files) {
        const current = read(disk).digest
        if (!entry.seen.includes(current)) throw new Error(`File changed since the recorded tool call: ${entry.path}`)
      }
      const applied = []
      for (const [disk, entry] of files) {
        if (read(disk).digest === entry.before) continue
        if (entry.bytes === null) {
          if (safeDelete) safeDelete(disk)
          else execFileSync(process.platform === 'win32' ? 'python' : 'python3', [process.platform === 'win32' ? 'C:\\scripts\\safe_delete_agent.py' : '/mnt/scripts/safe_delete_agent.py', disk], { timeout: 10000, stdio: 'ignore' })
        } else {
          fs.mkdirSync(path.dirname(disk), { recursive: true })
          // In-place write preserves hardlinks used by the workspace skill trees.
          fs.writeFileSync(disk, entry.bytes)
        }
        if (read(disk).digest !== entry.before) throw new Error(`Restore verification failed: ${entry.path}`)
        applied.push(entry.path)
      }
      return { ok: true, applied }
    },
  }
}
