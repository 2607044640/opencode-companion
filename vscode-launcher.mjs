import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, exec, execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const VSCODE_CACHE_FILE = path.join(__dirname, '.vscode-path.json')

export const DEFAULT_WORKSPACE_MAPPINGS = [
  { jail: '/home/developer/projects/APISpace', win: 'C:\\APISpace' },
  { jail: '/workspace/projects/APISpace', win: 'C:\\APISpace' },
  { jail: '/home/developer/projects/AICore', win: 'C:\\AICore' },
  { jail: '/workspace/projects/AICore', win: 'C:\\AICore' },
  { jail: '/home/developer/projects/AISpace', win: 'C:\\Godot\\AISpace' },
  { jail: '/workspace/projects/AISpace', win: 'C:\\Godot\\AISpace' },
  { jail: '/home/developer/projects/ObsidianNote', win: 'C:\\ObsidianNote' },
  { jail: '/workspace/projects/ObsidianNote', win: 'C:\\ObsidianNote' },
  { jail: '/home/developer/projects/ObsidianDev', win: 'C:\\ObsidianDev' },
  { jail: '/workspace/projects/ObsidianDev', win: 'C:\\ObsidianDev' },
]

/**
 * Strips file:// schemes, quotes, URI encodings, and trailing line numbers (:42, #L42)
 */
export function cleanRawPath(raw) {
  if (!raw || typeof raw !== 'string') return ''
  let clean = raw.trim()

  // 1. Strip surrounding quotes first
  if (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'"))
  ) {
    clean = clean.slice(1, -1).trim()
  }

  // 2. Strip file:/// or file://
  if (clean.startsWith('file:///')) {
    clean = clean.slice(7)
    if (/^\/[a-zA-Z]:[/\\\\]/.test(clean)) {
      clean = clean.slice(1)
    }
  } else if (clean.startsWith('file://')) {
    clean = clean.slice(7)
  }

  // 3. Strip surrounding quotes again if wrapped
  if (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'"))
  ) {
    clean = clean.slice(1, -1).trim()
  }

  // 4. Decode URI components (%20, etc.)
  try {
    if (clean.includes('%')) {
      clean = decodeURIComponent(clean)
    }
  } catch {}

  // 5. Strip trailing line number or range (e.g. :42, :42:5, #L42, (42))
  clean = clean.replace(/#L\d+(?:-\d+)?$/i, '')
  clean = clean.replace(/:\d+(?::\d+)?$/, '')
  clean = clean.replace(/\(\d+(?:,\s*\d+)?\)$/, '')

  return clean.trim()
}

/**
 * Extracts line number from raw path string if present (e.g. file.ts:42 or file.ts#L42)
 */
export function extractLineFromRawPath(raw) {
  if (!raw || typeof raw !== 'string') return null
  const m = raw.match(/#L(\d+)|:(\d+)(?::\d+)?$|\((\d+)(?:,\s*\d+)?\)$/)
  if (m) {
    const val = m[1] || m[2] || m[3]
    const parsed = parseInt(val, 10)
    if (!Number.isNaN(parsed) && parsed > 0) return parsed
  }
  return null
}

/**
 * Converts any Linux jail path or posix path to a valid Windows filesystem path.
 */
export function resolveToWindowsPath(rawPath) {
  const cleaned = cleanRawPath(rawPath)
  if (!cleaned) return ''

  // 1. Already a Windows path (e.g. C:\... or C:/...)
  if (/^[a-zA-Z]:[/\\]/.test(cleaned)) {
    return path.normalize(cleaned)
  }

  // 2. /mnt/c/... or /mnt/d/...
  const mntMatch = cleaned.match(/^\/mnt\/([a-zA-Z])\/(.*)$/)
  if (mntMatch) {
    return path.normalize(`${mntMatch[1].toUpperCase()}:\\${mntMatch[2]}`)
  }

  // 3. Match against known workspace roots
  for (const { jail, win } of DEFAULT_WORKSPACE_MAPPINGS) {
    if (cleaned === jail || cleaned.startsWith(jail + '/')) {
      const rel = cleaned.slice(jail.length).replace(/^\/+/, '')
      return path.normalize(rel ? path.join(win, rel) : win)
    }
  }

  // 4. Generic /home/developer/projects/<name> or /workspace/projects/<name>
  const genericMatch = cleaned.match(/^(?:\/home\/developer|\/workspace)\/projects\/([^/]+)(?:\/(.*))?$/i)
  if (genericMatch) {
    const wsName = genericMatch[1]
    const rest = genericMatch[2] || ''
    const lowerWs = wsName.toLowerCase()
    let base = `C:\\${wsName}`
    if (lowerWs === 'aispace') base = 'C:\\Godot\\AISpace'
    return path.normalize(rest ? path.join(base, rest) : base)
  }

  // 5. Relative paths: search known project workspaces
  const normalized = path.normalize(cleaned)
  if (!path.isAbsolute(normalized)) {
    const candidateWorkspaces = [
      process.cwd(),
      'C:\\APISpace',
      'C:\\AICore',
      'C:\\Godot\\AISpace',
      'C:\\ObsidianNote',
      'C:\\ObsidianDev',
    ]
    for (const ws of candidateWorkspaces) {
      const cand = path.join(ws, normalized)
      if (fs.existsSync(cand)) return path.normalize(cand)
    }
  }

  return normalized
}

/**
 * Reads cached VS Code paths if valid, otherwise auto-detects and caches both code.cmd and Code.exe.
 */
export function findVSCodeExecutable() {
  // 1. Check cached paths
  try {
    if (fs.existsSync(VSCODE_CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(VSCODE_CACHE_FILE, 'utf8'))
      if (cached?.cmd && fs.existsSync(cached.cmd)) {
        return { cmd: cached.cmd, exe: cached.executable || null }
      }
      if (cached?.executable && fs.existsSync(cached.executable)) {
        const siblingCmd = path.join(path.dirname(cached.executable), 'bin', 'code.cmd')
        const cmd = fs.existsSync(siblingCmd) ? siblingCmd : null
        return { cmd, exe: cached.executable }
      }
    }
  } catch {}

  let foundExe = null
  let foundCmd = null

  // 2. Check via `where.exe code` (returns code.cmd or code on Windows)
  try {
    const output = execSync('where.exe code', { encoding: 'utf8', timeout: 3000 })
    const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      if (/code\.cmd$/i.test(line) && fs.existsSync(line)) {
        foundCmd = line
        const siblingExe = path.resolve(path.dirname(line), '..', 'Code.exe')
        if (fs.existsSync(siblingExe)) foundExe = siblingExe
        break
      }
      if (/Code\.exe$/i.test(line) && fs.existsSync(line)) {
        foundExe = line
        const siblingCmd = path.join(path.dirname(line), 'bin', 'code.cmd')
        if (fs.existsSync(siblingCmd)) foundCmd = siblingCmd
        break
      }
    }
  } catch {}

  // 3. Candidate standard locations on Windows
  if (!foundCmd || !foundExe) {
    const candidateBases = []
    if (process.env.LOCALAPPDATA) {
      candidateBases.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code'))
      candidateBases.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code Insiders'))
    }
    if (process.env.PROGRAMFILES) {
      candidateBases.push(path.join(process.env.PROGRAMFILES, 'Microsoft VS Code'))
      candidateBases.push(path.join(process.env.PROGRAMFILES, 'Microsoft VS Code Insiders'))
    }
    if (process.env['PROGRAMFILES(X86)']) {
      candidateBases.push(path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft VS Code'))
    }

    for (const base of candidateBases) {
      const cmdPath = path.join(base, 'bin', 'code.cmd')
      const exePath = path.join(base, 'Code.exe')
      if (fs.existsSync(cmdPath)) foundCmd = foundCmd || cmdPath
      if (fs.existsSync(exePath)) foundExe = foundExe || exePath
      if (foundCmd && foundExe) break
    }
  }

  if (foundCmd || foundExe) {
    saveVSCodePath(foundExe || foundCmd, foundCmd)
    return { cmd: foundCmd, exe: foundExe }
  }

  return { cmd: null, exe: null }
}

function saveVSCodePath(exePath, cmdPath = null) {
  try {
    fs.writeFileSync(
      VSCODE_CACHE_FILE,
      JSON.stringify({ executable: exePath, cmd: cmdPath, updatedAt: Date.now() }, null, 2),
      'utf8'
    )
    console.log(`[VSCodeLauncher] Saved VS Code executable paths: exe=${exePath}, cmd=${cmdPath}`)
  } catch (err) {
    console.warn('[VSCodeLauncher] Failed to cache VS Code executable path:', err)
  }
}

/**
 * Opens the file in VS Code directly on Windows.
 * Uses official code.cmd CLI wrapper for robust singleton IPC window reuse.
 */
export function openInVSCode(rawPath, line = null) {
  const winPath = resolveToWindowsPath(rawPath)
  if (!winPath) {
    return { ok: false, error: 'Path is required' }
  }

  // Reject paths containing wildcard characters (* or ?)
  if (/[*?]/.test(winPath)) {
    return { ok: false, error: '路径包含通配符，无法在 VS Code 中直接打开 (Path contains wildcards)' }
  }

  const runner = findVSCodeExecutable()
  if (!runner.cmd && !runner.exe) {
    return { ok: false, error: '未找到 VS Code 安装路径 (VS Code not found on system)' }
  }

  // Sanitize line number: check passed line param first, then fallback to embedded line in rawPath
  let lineNum = null
  if (line != null) {
    if (typeof line === 'number') {
      lineNum = line > 0 ? line : null
    } else {
      const match = String(line).match(/\d+/)
      if (match) {
        const parsed = parseInt(match[0], 10)
        if (!Number.isNaN(parsed) && parsed > 0) {
          lineNum = parsed
        }
      }
    }
  }
  if (!lineNum) {
    lineNum = extractLineFromRawPath(rawPath)
  }

  try {
    // -r / --reuse-window forces active window reuse instead of focusing without opening file
    const args = lineNum ? ['-r', '-g', `${winPath}:${lineNum}`] : ['-r', winPath]

    if (runner.cmd && fs.existsSync(runner.cmd)) {
      // Use official VS Code CLI wrapper (handles socket IPC handshake with running editor)
      const child = spawn(runner.cmd, args, {
        shell: true,
        stdio: 'ignore',
        windowsHide: true,
        detached: true,
      })
      child.unref()
      return { ok: true, runner: 'cmd', executable: runner.cmd, path: winPath, line: lineNum }
    } else {
      // Fallback to Code.exe directly
      const child = spawn(runner.exe, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })
      child.unref()
      return { ok: true, runner: 'exe', executable: runner.exe, path: winPath, line: lineNum }
    }
  } catch (err) {
    console.error('[VSCodeLauncher] Failed to spawn VS Code:', err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Opens Windows File Explorer and highlights the file.
 */
export function openInExplorer(rawPath) {
  const winPath = resolveToWindowsPath(rawPath)
  if (!winPath) {
    return { ok: false, error: 'Path is required' }
  }

  // Reject paths containing wildcard characters (* or ?)
  if (/[*?]/.test(winPath)) {
    return { ok: false, error: '路径包含通配符，无法在资源管理器中直接定位 (Path contains wildcards)' }
  }

  try {
    let target = winPath
    let isFile = false

    if (fs.existsSync(winPath)) {
      const stat = fs.statSync(winPath)
      isFile = stat.isFile()
    } else {
      // Find nearest existing ancestor directory
      let cur = path.dirname(winPath)
      while (cur && !fs.existsSync(cur)) {
        const parent = path.dirname(cur)
        if (parent === cur) break
        cur = parent
      }
      if (cur && fs.existsSync(cur)) {
        target = cur
        isFile = false
      }
    }

    // Windows Explorer command:
    // For files: explorer.exe /select,"<path>"
    // For directories: explorer.exe "<path>"
    // Must NOT use windowsHide: true (hides the explorer GUI window)
    // Must NOT pass /select as a separate quoted argument in spawn (explorer ignores "/select,C:\...")
    const cmd = isFile
      ? `explorer.exe /select,"${target}"`
      : `explorer.exe "${target}"`

    exec(cmd, { windowsHide: false }, (err) => {
      // explorer.exe may exit with non-zero code even when successful
      if (err && err.code !== 1) {
        console.warn('[VSCodeLauncher] explorer.exe notice:', err.message)
      }
    })

    return { ok: true, path: target, isFile }
  } catch (err) {
    console.error('[VSCodeLauncher] Failed to launch explorer.exe:', err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
