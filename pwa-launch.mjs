/**
 * Edge installed-app launch for OpenCode5173.
 * Prioritizes Edge's native pwahelper.exe which activates the installed PWA
 * via Edge App UserModelID without encountering ProcessSingleton lock conflicts (error 21).
 */
export const OPENCODE5173_APP_ID = 'gdgheecefcmlccfepljfcjakkdblfgmm'

const PWAHELPER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\pwahelper.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\pwahelper.exe',
]

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

export function companionSessionUrl(sessionId) {
  const id = String(sessionId || '').trim()
  if (!id || !/^[\w.-]+$/.test(id)) return 'http://127.0.0.1:5173/'
  return `http://127.0.0.1:5173/?session=${encodeURIComponent(id)}`
}

export function edgeLaunchArgs(sessionId, appId = OPENCODE5173_APP_ID, executable = '') {
  const target = companionSessionUrl(sessionId)
  const isHelper = executable.toLowerCase().includes('pwahelper')
  if (isHelper) {
    return [
      `--app-id=${appId}`,
      '--ip-edge-aumid=Microsoft.MicrosoftEdge.Stable_8wekyb3d8bbwe!MSEDGE',
      `--ip-override-url=${target}`,
      '--profile-directory=Default',
      '--app-launch-source=4',
    ]
  }
  return [
    `--app-id=${appId}`,
    `--app-launch-url-for-shortcuts-menu-item=${target}`,
    '--profile-directory=Default',
  ]
}

export function resolveEdgeExecutable(exists = () => false) {
  const helper = PWAHELPER_CANDIDATES.find((candidate) => exists(candidate))
  if (helper) return helper
  return EDGE_CANDIDATES.find((candidate) => exists(candidate)) || 'pwahelper.exe'
}
