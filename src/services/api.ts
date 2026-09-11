// REST API Service connecting to OpenCode backend daemon
// Includes Centralized Defensive Schema Normalization Layer and Auth Token Support

import type {
  Project,
  Session,
  Message,
  MessagePart,
  MessageInfo,
  AgentInfo,
  ProviderInfo,
  FilePart,
  MessagePartInput,
  DaemonConfig,
  CommandItem,
} from '../types/opencode'

// Base URL: strictly 127.0.0.1:5001 loopback
export const BASE_URL = 'http://127.0.0.1:5001'

// --- Defensive Normalization Layer (Schema-Safety Boundary) ---
// Adopts extra="allow" + safe default fallbacks to prevent React TypeError crashes

export function normalizeProject(raw: any): Project {
  if (!raw || typeof raw !== 'object') {
    return {
      id: 'unknown',
      worktree: '',
      time: { created: 0, updated: 0 },
    }
  }
  return {
    ...raw,
    id: String(raw.id || 'unknown'),
    worktree: String(raw.worktree || ''),
    name: raw.name ? String(raw.name) : undefined,
    vcs: raw.vcs ? String(raw.vcs) : undefined,
    icon: raw.icon && typeof raw.icon === 'object' ? { color: raw.icon.color } : undefined,
    time: {
      created: Number(raw.time?.created || 0),
      updated: Number(raw.time?.updated || raw.time?.created || 0),
    },
  }
}

export interface CanonicalProjectMeta {
  readonly name: string
  readonly defaultWorktree: string
  readonly defaultColor: string
  readonly fallbackId: string
}

export const CANONICAL_PROJECTS: readonly CanonicalProjectMeta[] = [
  {
    name: 'APISpace',
    defaultWorktree: '/home/developer/projects/APISpace',
    defaultColor: 'blue',
    fallbackId: '53aa51360d45a83713b344d0fec6eb07e226c45b',
  },
  {
    name: 'ObsidianDev',
    defaultWorktree: '/home/developer/projects/ObsidianDev',
    defaultColor: 'magenta',
    fallbackId: 'e2502d34ac60eb75b1dc17feed238fddebf26c12',
  },
  {
    name: 'ObsidianNote',
    defaultWorktree: '/home/developer/projects/ObsidianNote',
    defaultColor: 'purple',
    fallbackId: '28409f34b07f22051233c7be93e4dffc8034e88e',
  },
  {
    name: 'AISpace',
    defaultWorktree: '/home/developer/projects/AISpace',
    defaultColor: 'cyan',
    fallbackId: 'af780317cdbe4ad0e34fd43acd12b34ac3093bed',
  },
  {
    name: 'NullSpace',
    defaultWorktree: '/home/developer/projects/NullSpace',
    defaultColor: 'amber',
    fallbackId: '568bc3678fd5edb9259a1ba82dd71bfac38a8c54',
  },
] as const

export function matchCanonicalWorkspace(worktree?: string, name?: string): CanonicalProjectMeta | null {
  const normPath = (worktree || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const normName = (name || '').trim().toLowerCase()
  const baseName = normPath.split('/').filter(Boolean).pop() || ''

  for (const meta of CANONICAL_PROJECTS) {
    const metaLower = meta.name.toLowerCase()
    if (normName === metaLower) return meta
    if (baseName === metaLower) return meta
    if (normPath.endsWith('/' + metaLower)) return meta
  }
  return null
}

export function canonicalizeDirectory(dir?: string): string | undefined {
  if (!dir) return undefined
  const normalized = dir.replace(/\\/g, '/').replace(/\/+$/, '').trim()
  if (!normalized || normalized === '/') return undefined

  // If already a canonical Linux project path, return it directly
  for (const meta of CANONICAL_PROJECTS) {
    if (normalized === meta.defaultWorktree) {
      return meta.defaultWorktree
    }
  }

  // Match against canonical workspaces (e.g. C:/Godot/AISpace, /projects/AISpace, etc.)
  const matched = matchCanonicalWorkspace(normalized)
  if (matched) {
    return matched.defaultWorktree
  }

  // If already starts with Linux root / (e.g. /home/developer/projects/...)
  if (normalized.startsWith('/') && !normalized.includes(':')) {
    return normalized
  }

  // If Windows drive path (e.g. C:/... or D:\...)
  const winMatch = normalized.match(/^[a-zA-Z]:(?:\/[^/]+)*\/([^/]+)$/)
  if (winMatch) {
    const endMatch = matchCanonicalWorkspace(undefined, winMatch[1])
    if (endMatch) return endMatch.defaultWorktree
  }

  return normalized
}

export function resolveAgentName(agentName?: string): string | undefined {
  if (!agentName || agentName === 'Default Agent') return undefined
  const map: Record<string, string> = {
    'atlas': 'Atlas - Plan Executor',
    'Atlas': 'Atlas - Plan Executor',
    'Atlas - Plan Executor': 'Atlas - Plan Executor',
    'prometheus': 'Prometheus - Plan Builder',
    'Prometheus': 'Prometheus - Plan Builder',
    'Prometheus - Plan Builder': 'Prometheus - Plan Builder',
    'sisyphus': 'Sisyphus - ultraworker',
    'Sisyphus': 'Sisyphus - ultraworker',
    'Sisyphus - ultraworker': 'Sisyphus - ultraworker',
    'build': 'build',
    'plan': 'plan',
  }
  return map[agentName] || agentName
}

export function deduplicateAndFilterProjects(rawProjects: Project[]): Project[] {
  const matchedMap = new Map<string, Project[]>()
  for (const meta of CANONICAL_PROJECTS) {
    matchedMap.set(meta.name, [])
  }

  let globalProject: Project | null = null

  for (const raw of rawProjects) {
    if (raw.id === 'global' || raw.worktree === '/') {
      globalProject = raw
      continue
    }

    const matched = matchCanonicalWorkspace(raw.worktree, raw.name)
    if (matched) {
      const list = matchedMap.get(matched.name)!
      list.push(raw)
    }
  }

  const canonicalList: Project[] = CANONICAL_PROJECTS.map((meta) => {
    const matches = matchedMap.get(meta.name) || []

    if (matches.length === 0) {
      return {
        id: meta.fallbackId,
        worktree: meta.defaultWorktree,
        name: meta.name,
        vcs: 'git',
        icon: { color: meta.defaultColor },
        time: { created: Date.now(), updated: Date.now() },
        associatedIds: [meta.fallbackId],
      }
    }

    const allIds = Array.from(new Set(matches.map((m) => m.id).filter(Boolean)))
    const primary =
      matches.find((m) => m.id === meta.fallbackId) ||
      matches.find((m) => m.name && m.name.toLowerCase() === meta.name.toLowerCase()) ||
      matches[0]

    const chosenColor =
      matches.find((m) => m.icon?.color)?.icon?.color || meta.defaultColor

    // Strictly enforce canonical Linux worktree root so OpenCode daemon never gets Windows drive mangling
    const chosenWorktree = meta.defaultWorktree

    return {
      ...primary,
      id: primary.id || meta.fallbackId,
      name: meta.name,
      worktree: chosenWorktree,
      icon: { color: chosenColor },
      associatedIds: allIds,
    }
  })

  if (globalProject) {
    canonicalList.push(globalProject)
  }

  return canonicalList
}

export function normalizeSession(raw: any): Session {
  if (!raw || typeof raw !== 'object') {
    return {
      id: 'unknown',
      slug: 'unknown',
      projectID: 'global',
      directory: '',
      title: 'Untitled Session',
      agent: 'Default Agent',
      model: { id: '', providerID: '' },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      cost: 0,
      time: { created: 0, updated: 0 },
    }
  }
  return {
    ...raw,
    id: String(raw.id || ''),
    slug: String(raw.slug || raw.id || ''),
    projectID: String(raw.projectID || raw.project_id || 'global'),
    directory: String(
      raw.directory ||
      raw.location?.directory ||
      (typeof raw.path === 'string' && raw.path.startsWith('/') ? raw.path : '') ||
      (typeof raw.subpath === 'string' ? '/' + raw.subpath.replace(/^\/+/, '') : '') ||
      ''
    ),
    title: String(raw.title || 'Untitled Session'),
    agent: raw.agent === 'Atlas'
      ? 'Atlas - Plan Executor'
      : (raw.agent && raw.agent !== 'Default Agent' ? String(raw.agent) : ''),
    model: {
      id: String(raw.model?.id || raw.model?.modelID || ''),
      providerID: String(raw.model?.providerID || ''),
      variant: raw.model?.variant ? String(raw.model.variant) : undefined,
    },
    tokens: {
      input: Number(raw.tokens?.input || 0),
      output: Number(raw.tokens?.output || 0),
      reasoning: Number(raw.tokens?.reasoning || 0),
      cache: {
        read: Number(raw.tokens?.cache?.read || 0),
        write: Number(raw.tokens?.cache?.write || 0),
      },
    },
    cost: Number(raw.cost || 0),
    summary: raw.summary && typeof raw.summary === 'object'
      ? {
          additions: Number(raw.summary.additions || 0),
          deletions: Number(raw.summary.deletions || 0),
          files: Number(raw.summary.files || 0),
        }
      : undefined,
    time: {
      created: Number(raw.time?.created || 0),
      updated: Number(raw.time?.updated || raw.time?.created || 0),
    },
  }
}

export function normalizeMessageInfo(raw: any): MessageInfo {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `msg_${Date.now()}`,
      sessionID: '',
      role: 'assistant',
      time: { created: Date.now() },
    }
  }

  const modelID = raw.modelID || raw.model?.modelID || (typeof raw.model === 'string' ? raw.model : undefined)
  const providerID = raw.providerID || raw.model?.providerID || undefined

  return {
    ...raw,
    id: String(raw.id || `msg_${Date.now()}`),
    sessionID: String(raw.sessionID || ''),
    role: raw.role === 'user' ? 'user' : raw.role === 'system' ? 'system' : 'assistant',
    time: {
      created: Number(raw.time?.created || Date.now()),
      completed: raw.time?.completed ? Number(raw.time.completed) : undefined,
    },
    agent: raw.agent ? String(raw.agent) : (raw.mode ? String(raw.mode) : undefined),
    mode: raw.mode ? String(raw.mode) : undefined,
    modelID: modelID ? String(modelID) : undefined,
    providerID: providerID ? String(providerID) : undefined,
    model: (modelID || providerID) ? {
      modelID: String(modelID || ''),
      providerID: String(providerID || ''),
    } : undefined,
    tokens: raw.tokens && typeof raw.tokens === 'object'
      ? {
          input: Number(raw.tokens.input || 0),
          output: Number(raw.tokens.output || 0),
          reasoning: Number(raw.tokens.reasoning || 0),
          cache: {
            read: Number(raw.tokens.cache?.read || 0),
            write: Number(raw.tokens.cache?.write || 0),
          },
        }
      : undefined,
    cost: raw.cost !== undefined ? Number(raw.cost) : undefined,
    finish: raw.finish ? String(raw.finish) : undefined,
  }
}

export function normalizeMessagePart(raw: any): MessagePart {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `prt_${Date.now()}`,
      sessionID: '',
      messageID: '',
      type: 'text',
      text: '',
    } as any
  }

  const type = String(raw.type || 'text')

  if (type === 'text') {
    return {
      ...raw,
      id: String(raw.id || `prt_${Date.now()}`),
      sessionID: String(raw.sessionID || ''),
      messageID: String(raw.messageID || ''),
      type: 'text',
      text: String(raw.text || ''),
    }
  }

  if (type === 'reasoning') {
    return {
      ...raw,
      id: String(raw.id || `prt_${Date.now()}`),
      sessionID: String(raw.sessionID || ''),
      messageID: String(raw.messageID || ''),
      type: 'reasoning',
      text: String(raw.text || ''),
      time: raw.time && typeof raw.time === 'object'
        ? {
            start: raw.time.start ? Number(raw.time.start) : undefined,
            end: raw.time.end ? Number(raw.time.end) : undefined,
          }
        : undefined,
    }
  }

  if (type === 'tool') {
    return {
      ...raw,
      id: String(raw.id || `prt_${Date.now()}`),
      sessionID: String(raw.sessionID || ''),
      messageID: String(raw.messageID || ''),
      type: 'tool',
      tool: String(raw.tool || ''),
      callID: raw.callID ? String(raw.callID) : undefined,
      state: {
        status: raw.state?.status || 'pending',
        input: raw.state?.input || {},
        output: raw.state?.output !== undefined ? String(raw.state.output) : undefined,
        error: raw.state?.error !== undefined ? String(raw.state.error) : undefined,
        title: raw.state?.title ? String(raw.state.title) : undefined,
        metadata: raw.state?.metadata || undefined,
        time: raw.state?.time || undefined,
      },
    }
  }

  if (type === 'file') {
    return {
      ...raw,
      id: String(raw.id || `prt_${Date.now()}`),
      sessionID: String(raw.sessionID || ''),
      messageID: String(raw.messageID || ''),
      type: 'file',
      mime: String(raw.mime || 'image/png'),
      filename: raw.filename ? String(raw.filename) : undefined,
      url: String(raw.url || ''),
    } as FilePart
  }

  return {
    ...raw,
    id: String(raw.id || `prt_${Date.now()}`),
    sessionID: String(raw.sessionID || ''),
    messageID: String(raw.messageID || ''),
    type,
  }
}

export function normalizeMessage(raw: any): Message {
  if (!raw || typeof raw !== 'object') {
    return {
      info: normalizeMessageInfo(null),
      parts: [],
    }
  }
  return {
    info: normalizeMessageInfo(raw.info),
    parts: Array.isArray(raw.parts) ? raw.parts.map(normalizeMessagePart) : [],
  }
}

// --- Auth Token Helpers for Proxy / Ingress Protection ---
export function getAuthToken(): string {
  try {
    return localStorage.getItem('opencode_auth_token') || ''
  } catch {
    return ''
  }
}

export function setAuthToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem('opencode_auth_token', token)
    } else {
      localStorage.removeItem('opencode_auth_token')
    }
  } catch {
    // ignore
  }
}

class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`
  const token = getAuthToken()
  const authHeaders: Record<string, string> = token
    ? {
        'Authorization': `Bearer ${token}`,
        'X-OpenCode-Token': token,
      }
    : {}

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(url, {
      ...options,
      signal: options?.signal || controller.signal,
      headers: {
        'Accept': 'application/json',
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders,
        ...options?.headers,
      },
    })

    if (!res.ok) {
      let errText = ''
      try {
        errText = await res.text()
      } catch {
        // ignore
      }
      throw new ApiError(res.status, `HTTP ${res.status}: ${errText || res.statusText}`)
    }

    if (res.status === 204) {
      return {} as T
    }

    return await res.json()
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new Error(`Network request failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timeoutId)
  }
}

export const api = {
  /**
   * Fetch daemon configuration (e.g. default_agent, models)
   */
  async getConfig(): Promise<DaemonConfig> {
    try {
      return await request<DaemonConfig>('/config')
    } catch (err) {
      console.warn('Failed to load daemon config:', err)
      return {}
    }
  },

  /**
   * Fetch all registered projects with defensive normalization,
   * worktree path deduplication, and strictly canonical 5-folder filtering.
   */
  async getProjects(): Promise<Project[]> {
    const raw = await request<any[]>('/project')
    if (!Array.isArray(raw)) return deduplicateAndFilterProjects([])
    const normalized = raw.map(normalizeProject)
    return deduplicateAndFilterProjects(normalized)
  },

  /**
   * Fetch all sessions across global and canonical workspaces with defensive normalization.
   * If directory is specified, fetches sessions scoped to that directory.
   */
  async getSessions(directory?: string): Promise<Session[]> {
    if (directory) {
      try {
        const resp = await request<any>(`/api/session?directory=${encodeURIComponent(directory)}&limit=500`)
        const items = Array.isArray(resp) ? resp : (Array.isArray(resp?.data) ? resp.data : [])
        if (items.length > 0) {
          return items.map(normalizeSession)
        }
      } catch {
        // fallback
      }
      try {
        const raw = await request<any[]>(`/session?directory=${encodeURIComponent(directory)}&limit=500`)
        if (Array.isArray(raw)) return raw.map(normalizeSession)
      } catch {
        return []
      }
      return []
    }

    // Comprehensive session retrieval: query global + each canonical workspace in parallel
    const sessionMap = new Map<string, Session>()

    const queries: Promise<any>[] = [
      request<any[]>('/session?limit=500').catch(() => []),
      ...CANONICAL_PROJECTS.map((meta) =>
        request<any>(`/api/session?directory=${encodeURIComponent(meta.defaultWorktree)}&limit=500`).catch(() => [])
      ),
    ]

    const results = await Promise.allSettled(queries)
    for (const res of results) {
      if (res.status === 'fulfilled') {
        const rawData = res.value
        const items = Array.isArray(rawData) ? rawData : (Array.isArray(rawData?.data) ? rawData.data : [])
        for (const item of items) {
          if (item && item.id && !sessionMap.has(item.id)) {
            sessionMap.set(item.id, normalizeSession(item))
          }
        }
      }
    }

    const allSessions = Array.from(sessionMap.values())
    // Sort descending by time
    allSessions.sort((a, b) => {
      const timeA = a.time?.updated || a.time?.created || 0
      const timeB = b.time?.updated || b.time?.created || 0
      return timeB - timeA
    })

    return allSessions
  },

  /**
   * Get single session details
   */
  async getSession(sessionID: string): Promise<Session> {
    const raw = await request<any>(`/session/${sessionID}`)
    return normalizeSession(raw)
  },

  /**
   * Create a new session with optional directory binding
   */
  /**
   * Switch the active primary agent for a session via dedicated v2 endpoint
   */
  async switchSessionAgent(sessionID: string, agentName: string): Promise<void> {
    const resolved = resolveAgentName(agentName)
    if (!resolved) return
    try {
      await request<void>(`/api/session/${sessionID}/agent`, {
        method: 'POST',
        body: JSON.stringify({ agent: resolved }),
      })
    } catch (err) {
      console.warn(`Failed to switch agent to ${resolved} for session ${sessionID}:`, err)
    }
  },

  /**
   * Create a new session with canonical directory and initial agent binding
   */
  async createSession(params?: {
    title?: string
    agent?: string
    directory?: string
    model?: { id: string; providerID: string; variant?: string }
  }): Promise<Session> {
    const { directory, agent, ...bodyParams } = params || {}
    const canonicalDir = canonicalizeDirectory(directory)
    const resolvedAgent = resolveAgentName(agent)
    const query = canonicalDir ? `?directory=${encodeURIComponent(canonicalDir)}` : ''
    const raw = await request<any>(`/session${query}`, {
      method: 'POST',
      body: JSON.stringify({
        ...bodyParams,
        ...(resolvedAgent ? { agent: resolvedAgent } : {}),
      }),
    })
    const normalized = normalizeSession(raw)
    if (canonicalDir && !normalized.directory) {
      normalized.directory = canonicalDir
    }
    if (resolvedAgent && normalized.id) {
      await this.switchSessionAgent(normalized.id, resolvedAgent).catch(() => {})
      normalized.agent = resolvedAgent
    }
    return normalized
  },

  /**
   * Delete a session
   */
  async deleteSession(sessionID: string): Promise<void> {
    await request<void>(`/session/${sessionID}`, {
      method: 'DELETE',
    })
  },

  /**
   * Delete a specific message from a session (revert last exchange).
   * Pass the messageID of the assistant turn; call again for the paired user turn if desired.
   */
  async deleteMessage(sessionID: string, messageID: string): Promise<void> {
    await request<void>(`/session/${sessionID}/message/${messageID}`, {
      method: 'DELETE',
    })
  },

  /**
   * Rename a session
   */
  async renameSession(sessionID: string, title: string): Promise<Session> {
    const raw = await request<any>(`/session/${sessionID}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    })
    return normalizeSession(raw)
  },

  /**
   * Get all messages for a session with defensive normalization
   */
  async getMessages(sessionID: string): Promise<Message[]> {
    const raw = await request<any[]>(`/session/${sessionID}/message`)
    if (!Array.isArray(raw)) return []
    return raw.map(normalizeMessage)
  },

  /**
   * Fetch the complete raw message array for export (no normalization, no limit cap).
   * Returns the raw JSON string directly for clipboard / file export.
   */
  async getAllMessagesRaw(sessionID: string): Promise<string> {
    const raw = await request<any>(`/session/${sessionID}/message`)
    return JSON.stringify(raw, null, 2)
  },

  /**
   * Send prompt asynchronously supporting multimodal parts (text, image files)
   * Ensures the session's active agent is durably committed via switchSessionAgent
   */
  async sendPrompt(
    sessionID: string,
    input: string | MessagePartInput[],
    options?: {
      agent?: string
      model?: { providerID: string; modelID: string }
    }
  ): Promise<void> {
    const parts: MessagePartInput[] = typeof input === 'string'
      ? [{ type: 'text', text: input }]
      : input

    const resolvedAgent = resolveAgentName(options?.agent)

    // Durable agent switch before prompt dispatch
    if (resolvedAgent) {
      await this.switchSessionAgent(sessionID, resolvedAgent).catch(() => {})
    }

    await request<void>(`/session/${sessionID}/prompt_async`, {
      method: 'POST',
      body: JSON.stringify({
        parts,
        ...(resolvedAgent ? { agent: resolvedAgent } : {}),
        ...(options?.model ? { model: options.model } : {}),
      }),
    })
  },

  /**
   * Abort running generation in a session
   */
  async abortSession(sessionID: string): Promise<void> {
    await request<void>(`/session/${sessionID}/abort`, {
      method: 'POST',
    })
  },

  /**
   * Get session todos
   */
  async getTodos(sessionID: string): Promise<any[]> {
    try {
      const data = await request<any[]>(`/session/${sessionID}/todo`)
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  },

  /**
   * Fetch available agents
   */
  async getAgents(): Promise<AgentInfo[]> {
    try {
      const raw = await request<any[]>('/agent')
      if (!Array.isArray(raw)) return []
      return raw.map((a) => ({
        name: String(a.name || 'Agent'),
        description: a.description ? String(a.description) : undefined,
        mode: a.mode ? String(a.mode) : undefined,
        native: Boolean(a.native),
      }))
    } catch {
      return []
    }
  },

  /**
   * Fetch configured providers & models
   */
  async getProviders(): Promise<ProviderInfo[]> {
    try {
      const data = await request<Record<string, any>>('/config/providers')
      if (data && data.providers && Array.isArray(data.providers)) {
        return data.providers
      }
      return []
    } catch {
      return []
    }
  },

  /**
   * Switch the active session in the running OpenCode Desktop via TUI control route
   */
  async selectSessionInDesktop(sessionID: string): Promise<boolean> {
    try {
      await request<boolean>('/tui/select-session', {
        method: 'POST',
        body: JSON.stringify({ sessionID }),
      })
      return true
    } catch (e) {
      console.warn('Failed to select session via TUI API, attempting protocol link fallback', e)
      return false
    }
  },

  /**
   * Dual-mode desktop opener: first calls TUI switch, fallback to opencode:// URI scheme
   */
  async openInDesktop(sessionID: string): Promise<void> {
    const switched = await this.selectSessionInDesktop(sessionID)
    if (!switched) {
      window.location.href = `opencode://session?id=${encodeURIComponent(sessionID)}`
    }
  },

  /**
   * Fetch available slash commands from daemon
   */
  async getCommands(): Promise<CommandItem[]> {
    try {
      const data = await request<any[]>('/command')
      if (!Array.isArray(data)) return []
      return data.map((cmd) => ({
        name: String(cmd.name || ''),
        description: cmd.description ? String(cmd.description) : undefined,
      }))
    } catch (err) {
      console.warn('Failed to fetch commands:', err)
      return []
    }
  },

  /**
   * Search for files or directories by name or pattern in the project directory
   */
  async findFiles(query: string, directory?: string): Promise<string[]> {
    try {
      const dirParam = directory ? `&directory=${encodeURIComponent(directory)}` : ''
      const data = await request<string[]>(`/find/file?query=${encodeURIComponent(query)}${dirParam}`)
      return Array.isArray(data) ? data : []
    } catch (err) {
      console.warn('Failed to find files:', err)
      return []
    }
  },

  /**
   * Health check probe with explicit timeout and fail-fast handling
   */
  async checkHealth(timeoutMs: number = 5000): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      const res = await fetch(`${BASE_URL}/global/health`, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return res.ok
    } catch {
      return false
    }
  },
}
