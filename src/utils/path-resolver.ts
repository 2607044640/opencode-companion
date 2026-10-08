/**
 * Path conversion and external tool launcher utilities
 * Supports mapping Linux jail paths to Windows paths and opening files in VS Code / File Explorer
 */

export const WORKSPACE_PATH_MAPPINGS = [
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
export function cleanRawPath(raw: string): string {
  if (!raw) return ''
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
 * Converts Linux jail path or POSIX path to native Windows filesystem path.
 */
export function toWindowsPath(posixPath: string): string {
  const cleaned = cleanRawPath(posixPath)
  if (!cleaned) return ''

  // 1. Already a Windows path (e.g. C:\... or C:/...)
  if (/^[a-zA-Z]:[/\\]/.test(cleaned)) {
    return cleaned.replace(/\//g, '\\')
  }

  // 2. /mnt/c/... or /mnt/d/...
  const mntMatch = cleaned.match(/^\/mnt\/([a-zA-Z])\/(.*)$/)
  if (mntMatch) {
    return `${mntMatch[1].toUpperCase()}:\\${mntMatch[2].replace(/\//g, '\\')}`
  }

  // 3. Known workspace roots (case-insensitive)
  const cleanedLower = cleaned.toLowerCase()
  for (const { jail, win } of WORKSPACE_PATH_MAPPINGS) {
    const jailLower = jail.toLowerCase()
    if (cleanedLower === jailLower || cleanedLower.startsWith(jailLower + '/')) {
      const rel = cleaned.slice(jail.length).replace(/^\/+/, '')
      return rel ? `${win}\\${rel.replace(/\//g, '\\')}` : win
    }
  }

  // 4. Generic /home/developer/projects/<name>, /workspace/projects/<name>, or /projects/<name>
  const genericMatch = cleaned.match(/^(?:(?:\/home\/developer|\/workspace)\/projects|\/projects)\/([^/]+)(?:\/(.*))?$/i)
  if (genericMatch) {
    const wsName = genericMatch[1]
    const rest = genericMatch[2] ? '\\' + genericMatch[2].replace(/\//g, '\\') : ''
    const lowerWs = wsName.toLowerCase()
    let base = `C:\\${wsName}`
    if (lowerWs === 'aispace') base = 'C:\\Godot\\AISpace'
    else if (lowerWs === 'apispace') base = 'C:\\APISpace'
    else if (lowerWs === 'aicore') base = 'C:\\AICore'
    else if (lowerWs === 'obsidiannote') base = 'C:\\ObsidianNote'
    else if (lowerWs === 'obsidiandev') base = 'C:\\ObsidianDev'
    return `${base}${rest}`
  }

  return cleaned.replace(/\//g, '\\')
}

/**
 * Converts Windows or POSIX path to Linux jail path.
 */
export function toLinuxPath(rawPath: string): string {
  const cleaned = cleanRawPath(rawPath)
  if (!cleaned) return ''
  const trimmed = cleaned.replace(/\\/g, '/')

  if (trimmed.startsWith('/home/developer/projects/') || trimmed.startsWith('/workspace/projects/')) {
    return trimmed
  }

  const winMatch = trimmed.match(/^([a-zA-Z]):\/(.*)$/)
  if (winMatch) {
    const drive = winMatch[1].toLowerCase()
    const rest = winMatch[2]
    if (/^apispace(?:\/|$)/i.test(rest)) {
      return `/home/developer/projects/APISpace${rest.slice('apispace'.length)}`
    }
    if (/^aicore(?:\/|$)/i.test(rest)) {
      return `/home/developer/projects/AICore${rest.slice('aicore'.length)}`
    }
    if (/^godot\/aispace(?:\/|$)/i.test(rest)) {
      return `/home/developer/projects/AISpace${rest.slice('godot/aispace'.length)}`
    }
    if (/^aispace(?:\/|$)/i.test(rest)) {
      return `/home/developer/projects/AISpace${rest.slice('aispace'.length)}`
    }
    if (/^obsidiannote(?:\/|$)/i.test(rest)) {
      return `/home/developer/projects/ObsidianNote${rest.slice('obsidiannote'.length)}`
    }
    if (/^obsidiandev(?:\/|$)/i.test(rest)) {
      return `/home/developer/projects/ObsidianDev${rest.slice('obsidiandev'.length)}`
    }
    return `/mnt/${drive}/${rest}`
  }

  return trimmed
}

export interface OpenExternalResult {
  ok: boolean
  error?: string
  path?: string
  executable?: string
}

export async function openFileInVSCode(filePath: string, line?: number): Promise<OpenExternalResult> {
  try {
    const res = await fetch('/api/open-external', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, target: 'vscode', line }),
    })
    const data = await res.json()
    return data
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function openFileInExplorer(filePath: string): Promise<OpenExternalResult> {
  try {
    const res = await fetch('/api/open-external', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, target: 'explorer' }),
    })
    const data = await res.json()
    return data
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
