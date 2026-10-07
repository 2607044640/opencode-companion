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
  SkillItem,
  SnapshotFileDiff,
  RevertSessionOptions,
  RoutingConfigResponse,
  ModelProfilesResponse,
  SendPromptOptions,
  SessionStatusPayload,
} from '../types/opencode'
import { sessionStatusFromTable } from '../utils/session-run-state'
import { buildPromptParts } from '../utils/prompt-parts'
import {
  nextSessionListLimit,
  SESSION_LIST_CAP,
  SESSION_LIST_START,
  sessionListExhausted,
  sessionListPath,
} from './session-pages'

export const DAEMON_LOOPBACK_URL = 'http://127.0.0.1:5001'

// Base URL: resolves dynamically to same-origin /opencode-proxy when served on companion port 5173, fallback to loopback
export function resolveDaemonBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.port === '5173') {
      return `${window.location.origin}/opencode-proxy`
    }
  }
  return DAEMON_LOOPBACK_URL
}

export const BASE_URL = resolveDaemonBaseUrl()

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

const JAIL_PROJECT_ROOTS: Readonly<Record<string, string>> = {
  apispace: '/home/developer/projects/APISpace',
  obsidiannote: '/home/developer/projects/ObsidianNote',
  obsidiandev: '/home/developer/projects/ObsidianDev',
  aispace: '/home/developer/projects/AISpace',
}

const WINDOWS_PROJECT_ROOTS: Readonly<Record<string, string>> = {
  'c:/apispace': JAIL_PROJECT_ROOTS.apispace,
  'c:/obsidiannote': JAIL_PROJECT_ROOTS.obsidiannote,
  'c:/obsidiandev': JAIL_PROJECT_ROOTS.obsidiandev,
  'c:/godot/aispace': JAIL_PROJECT_ROOTS.aispace,
}

export function canonicalizeDirectory(dir?: string): string | undefined {
  if (!dir) return undefined
  const normalized = dir.replace(/\\/g, '/').replace(/\/+$/, '').trim()
  if (!normalized || normalized === '/') return undefined

  const lower = normalized.toLowerCase()
  if (Object.prototype.hasOwnProperty.call(JAIL_PROJECT_ROOTS, lower)) {
    return JAIL_PROJECT_ROOTS[lower]
  }
  if (Object.values(JAIL_PROJECT_ROOTS).some((root) => root.toLowerCase() === lower)) {
    return Object.values(JAIL_PROJECT_ROOTS).find((root) => root.toLowerCase() === lower)
  }
  if (Object.prototype.hasOwnProperty.call(WINDOWS_PROJECT_ROOTS, lower)) {
    return WINDOWS_PROJECT_ROOTS[lower]
  }

  const legacy = normalized.match(/^\/workspace\/projects\/(APISpace|ObsidianNote|ObsidianDev|AISpace)$/i)
  if (legacy) {
    return JAIL_PROJECT_ROOTS[legacy[1].toLowerCase()]
  }

  throw new Error(
    `directory must be one of the 4 project roots (APISpace, ObsidianNote, ObsidianDev, AISpace); got ${dir}`,
  )
}

export function resolveAgentName(agentName?: string): string | undefined {
  if (!agentName || agentName === 'Default Agent') return undefined
  const key = agentName.trim().toLowerCase()
  const map: Record<string, string> = {
    atlas: 'build',
    'atlas - plan executor': 'build',
    sisyphus: 'build',
    'sisyphus - ultraworker': 'build',
    prometheus: 'plan',
    'prometheus - plan builder': 'plan',
    momus: 'plan',
    'momus - plan critic': 'plan',
    plan: 'plan',
    build: 'build',
    scout: 'scout',
    explore: 'explore',
    general: 'general',
    'atlas-executor': 'atlas-executor',
    'prometheus-planner': 'prometheus-planner',
    researcher: 'researcher',
    worker: 'worker',
  }
  return map[key] || key
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

    // AICore is an internal skill/rule directory, strictly not an OpenCode project
    const normName = (raw.name || '').trim().toLowerCase()
    const normWorktree = (raw.worktree || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    if (normName === 'aicore' || normWorktree.endsWith('/aicore') || normWorktree === 'c:/aicore') {
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

    // Use the worktree provided by the daemon, fallback to default worktree
    const chosenWorktree = primary.worktree || meta.defaultWorktree

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

export function sanitizeSessionTitle(rawTitle: unknown, defaultFallback = 'Untitled Session'): string {
  const coerced = String(rawTitle ?? '').trim()
  return coerced || defaultFallback
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
    parentID: raw.parentID ? String(raw.parentID) : undefined,
    directory: String(
      raw.directory ||
      raw.location?.directory ||
      (typeof raw.path === 'string' && raw.path.startsWith('/') ? raw.path : '') ||
      (typeof raw.subpath === 'string' ? '/' + raw.subpath.replace(/^\/+/, '') : '') ||
      ''
    ),
    title: sanitizeSessionTitle(raw.title, 'Untitled Session'),
    agent: raw.agent && raw.agent !== 'Default Agent'
      ? (resolveAgentName(String(raw.agent)) || String(raw.agent))
      : '',
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
    revert: raw.revert && typeof raw.revert === 'object' && raw.revert.messageID
      ? {
          messageID: String(raw.revert.messageID),
          partID: raw.revert.partID ? String(raw.revert.partID) : undefined,
          snapshot: raw.revert.snapshot ? String(raw.revert.snapshot) : undefined,
          diff: raw.revert.diff ? String(raw.revert.diff) : undefined,
        }
      : undefined,
  }
}

/** A message.updated frame often arrives before tokens are filled. Do not let that zero wipe a real count. */
export function mergeMessageInfo(prev: MessageInfo, next: MessageInfo): MessageInfo {
  const prevSum =
    (prev.tokens?.input || 0) +
    (prev.tokens?.output || 0) +
    (prev.tokens?.reasoning || 0) +
    (prev.tokens?.cache?.read || 0) +
    (prev.tokens?.cache?.write || 0)
  const nextSum =
    (next.tokens?.input || 0) +
    (next.tokens?.output || 0) +
    (next.tokens?.reasoning || 0) +
    (next.tokens?.cache?.read || 0) +
    (next.tokens?.cache?.write || 0)
  return {
    ...prev,
    ...next,
    tokens: nextSum > 0 || prevSum === 0 ? next.tokens : prev.tokens,
    cost: next.cost || prev.cost,
    finish: next.finish || prev.finish,
    error: next.error || prev.error,
    time: {
      created: next.time?.created || prev.time.created,
      completed: next.time?.completed || prev.time.completed,
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
    error: raw.error && typeof raw.error === 'object'
      ? {
          name: String(raw.error.name || 'Error'),
          message: raw.error.message ? String(raw.error.message) : undefined,
          statusCode: raw.error.statusCode !== undefined ? Number(raw.error.statusCode) : undefined,
          data: raw.error.data && typeof raw.error.data === 'object' ? raw.error.data : {},
        }
      : undefined,
  }
}

export function isAbortError(err: any): boolean {
  if (!err) return false
  if (typeof err === 'string') {
    const s = err.trim().toLowerCase()
    return (
      s === 'aborted' ||
      s === 'abort' ||
      s === 'user abort' ||
      s === 'user aborted' ||
      s.includes('aborted by user') ||
      s === 'the operation was aborted'
    )
  }
  const name = String(err.name || '').toLowerCase()
  const msg = String(err.message || '').trim().toLowerCase()
  const dataMsg = String(err.data?.message || err.data?.error || '').trim().toLowerCase()
  if (
    name === 'aborterror' ||
    name === 'messageabortederror' ||
    name === 'useraborterror'
  ) {
    return true
  }
  if (
    msg === 'aborted' ||
    msg === 'abort' ||
    msg === 'user abort' ||
    msg === 'user aborted' ||
    msg.includes('aborted by user') ||
    msg === 'the operation was aborted'
  ) {
    return true
  }
  if (dataMsg === 'aborted' || dataMsg === 'abort') {
    return true
  }
  return false
}

/**
 * Robustly extract human-readable error details from LLM relay / upstream gateways
 */
export function extractRelayErrorMessage(err: any): string {
  if (!err) return ''
  if (isAbortError(err)) return ''
  if (typeof err === 'string') return err

  const data = err.data || err
  let relayMsg = ''

  if (data.responseBody) {
    if (typeof data.responseBody === 'string') {
      try {
        const parsed = JSON.parse(data.responseBody)
        if (parsed.error?.message) {
          relayMsg = parsed.error.message
        } else if (parsed.message) {
          relayMsg = parsed.message
        } else if (typeof parsed.error === 'string') {
          relayMsg = parsed.error
        } else {
          relayMsg = data.responseBody
        }
      } catch {
        relayMsg = data.responseBody
      }
    } else if (typeof data.responseBody === 'object') {
      relayMsg =
        data.responseBody.error?.message ||
        data.responseBody.message ||
        (typeof data.responseBody.error === 'string' ? data.responseBody.error : '') ||
        JSON.stringify(data.responseBody)
    }
  }

  if (!relayMsg && data.message) {
    relayMsg = String(data.message)
  }

  if (!relayMsg && err.message) {
    relayMsg = String(err.message)
  }

  const statusCode = data.statusCode || err.statusCode
  if (statusCode && relayMsg) {
    return `[HTTP ${statusCode}] ${relayMsg}`
  } else if (statusCode) {
    return `[HTTP ${statusCode}] ${err.name || 'API Error'}`
  }

  if (relayMsg) {
    return relayMsg
  }

  return err.name || '中转服务响应异常 (Relay response error)'
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

const MESSAGE_CACHE_MS = 20_000

interface MessageCacheEntry {
  at: number
  promise: Promise<Message[]>
  value?: Message[]
}

const messageCache = new Map<string, MessageCacheEntry>()

function sessionRows(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: any[] }).data
  }
  return []
}

async function collectSessionPages(directory?: string): Promise<any[]> {
  let limit = SESSION_LIST_START
  let rows: any[] = []

  for (;;) {
    let payload: unknown
    try {
      payload = await request<unknown>(sessionListPath(limit, directory))
    } catch {
      if (rows.length > 0) return rows
      if (!directory) return []
      try {
        payload = await request<unknown>(
          `/api/session?directory=${encodeURIComponent(directory)}&limit=${limit}`
        )
      } catch {
        return rows
      }
    }

    rows = sessionRows(payload)
    if (sessionListExhausted(rows.length, limit) || limit >= SESSION_LIST_CAP) return rows
    const grown = nextSessionListLimit(limit)
    if (grown === limit) return rows
    limit = grown
  }
}

async function fetchNormalizedMessages(sessionID: string): Promise<Message[]> {
  const raw = await request<any[]>(`/session/${sessionID}/message`)
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeMessage)
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

let cachedRoutingConfig: RoutingConfigResponse | null = null
let cachedModelProfiles: ModelProfilesResponse | null = null
let cachedAgents: AgentInfo[] | null = null

export function getCachedRoutingConfig(): RoutingConfigResponse | null {
  return cachedRoutingConfig
}

export function getCachedModelProfiles(): ModelProfilesResponse | null {
  return cachedModelProfiles
}

export function getCachedAgents(): AgentInfo[] | null {
  return cachedAgents
}

export const api = {
  /**
   * Fetch live model context limits and profiles from Companion host server
   * Reads from C:\AICore\skills\OpenCodeDataControl\scripts\data\model_profiles.json
   */
  async getModelProfiles(): Promise<ModelProfilesResponse | null> {
    try {
      const res = await fetch('/api/model-profiles', {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) return null
      const data = await res.json()
      if (data && data.ok) {
        cachedModelProfiles = data as ModelProfilesResponse
        return cachedModelProfiles
      }
      return null
    } catch (err) {
      console.warn('Failed to load model profiles:', err)
      return null
    }
  },

  /**
   * Fetch live routing configuration & senior model from Companion host server
   */
  async getRoutingConfig(): Promise<RoutingConfigResponse | null> {
    try {
      const res = await fetch('/api/routing-config', {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) return null
      const data = await res.json()
      if (data && data.ok) {
        cachedRoutingConfig = data as RoutingConfigResponse
        if (data.modelProfiles && data.modelProfiles.ok) {
          cachedModelProfiles = data.modelProfiles
        }
        return cachedRoutingConfig
      }
      return null
    } catch (err) {
      console.warn('Failed to load routing config:', err)
      return null
    }
  },

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
   * Fetch every session the daemon will return.
   * `limit` is a ceiling, not a page. 500 used to hide every older row
   * from the sidebar and from Ctrl+K. The limit grows until a short page.
   */
  async getSessions(directory?: string): Promise<Session[]> {
    const collected = await collectSessionPages(directory)
    const sessionMap = new Map<string, Session>()
    for (const item of collected) {
      if (item && item.id && !sessionMap.has(item.id)) {
        sessionMap.set(item.id, normalizeSession(item))
      }
    }

    const allSessions = Array.from(sessionMap.values())
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
   * Update session properties (e.g. title) via OpenCode daemon PATCH /session/:id
   */
  async updateSession(
    sessionID: string,
    updates: { title?: string; directory?: string }
  ): Promise<Session> {
    const query = updates.directory
      ? `?directory=${encodeURIComponent(canonicalizeDirectory(updates.directory) || updates.directory)}`
      : ''
    const raw = await request<any>(`/session/${sessionID}${query}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(updates.title !== undefined ? { title: updates.title } : {}),
      }),
    })
    return normalizeSession(raw)
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
   * Revert a specific message in a session, atomically undoing its effects,
   * restoring filesystem snapshots, and setting session revert boundary.
   */
  async revertSession(
    sessionID: string,
    messageID: string,
    options?: RevertSessionOptions | string
  ): Promise<Session> {
    const opts: RevertSessionOptions = typeof options === 'string' ? { partID: options } : options || {}

    // When files: false is specified, try modern v2 stage endpoint first to avoid touching disk files
    if (opts.files === false) {
      try {
        const rawV2 = await request<any>(`/api/session/${sessionID}/revert/stage`, {
          method: 'POST',
          body: JSON.stringify({ messageID, files: false }),
        })
        const data = rawV2?.data || rawV2
        if (data?.revert) {
          return normalizeSession(data)
        }
      } catch (err) {
        console.warn('v2 revert/stage failed, falling back to standard revert:', err)
      }
    }

    const raw = await request<any>(`/session/${sessionID}/revert`, {
      method: 'POST',
      body: JSON.stringify({ messageID, ...(opts.partID ? { partID: opts.partID } : {}) }),
    })
    return normalizeSession(raw)
  },

  /**
   * Restore all previously reverted messages and file state in a session.
   */
  async unrevertSession(sessionID: string): Promise<Session> {
    const raw = await request<any>(`/session/${sessionID}/unrevert`, {
      method: 'POST',
    })
    return normalizeSession(raw)
  },

  /**
   * Summarize conversation context
   */
  async summarizeSession(sessionID: string): Promise<void> {
    await request<any>(`/session/${sessionID}/summarize`, {
      method: 'POST',
      body: JSON.stringify({}),
    }).catch((err) => {
      console.warn('summarizeSession failed or not implemented:', err)
    })
  },

  /**
   * Get the file changes (diff) resulting from a specific user message or session state.
   */
  async getSessionDiff(sessionID: string, messageID?: string): Promise<SnapshotFileDiff[]> {
    const query = messageID ? `?messageID=${encodeURIComponent(messageID)}` : ''
    const raw = await request<SnapshotFileDiff[]>(`/session/${sessionID}/diff${query}`)
    if (!Array.isArray(raw)) return []
    return raw
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
   * Get all messages for a session with defensive normalization.
   * Repeat callers within a short window share one in-flight request so
   * startup can overlap the session list with the active transcript.
   */
  async getMessages(sessionID: string, opts?: { fresh?: boolean }): Promise<Message[]> {
    const now = Date.now()
    const hit = messageCache.get(sessionID)
    if (!opts?.fresh && hit && now - hit.at < MESSAGE_CACHE_MS) {
      return hit.promise
    }
    const promise = fetchNormalizedMessages(sessionID)
    const entry: MessageCacheEntry = { at: now, promise }
    messageCache.set(sessionID, entry)
    promise.then(
      (value) => {
        entry.value = value
      },
      () => {
        if (messageCache.get(sessionID)?.promise === promise) {
          messageCache.delete(sessionID)
        }
      }
    )
    return promise
  },

  /** Resolved transcript, if a recent fetch already finished. */
  peekMessages(sessionID: string): Message[] | null {
    const hit = messageCache.get(sessionID)
    if (!hit || Date.now() - hit.at >= MESSAGE_CACHE_MS) return null
    return hit.value ?? null
  },

  /** Start a transcript fetch without waiting. Safe to call before the session list returns. */
  prefetchMessages(sessionID: string): void {
    if (!sessionID) return
    void this.getMessages(sessionID).catch(() => {})
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
    options?: SendPromptOptions
  ): Promise<void> {
    const parts = buildPromptParts(input, options?.attachments)

    const resolvedAgent = resolveAgentName(options?.agent)

    // Durable agent switch before prompt dispatch
    if (resolvedAgent) {
      await this.switchSessionAgent(sessionID, resolvedAgent).catch(() => {})
    }

    const modelPayload = options?.model
      ? {
          providerID: options.model.providerID,
          modelID: (options.model as any).modelID || (options.model as any).id,
        }
      : undefined

    // Fire background physical disk materialization for all file parts
    for (const p of parts) {
      if (p.type === 'file' && (p as any).url && (p as any).url.startsWith('data:')) {
        void this.materializeAttachment({
          filename: (p as any).filename || 'image.png',
          mime: (p as any).mime || 'image/png',
          dataUrl: (p as any).url,
        })
      }
    }

    await request<void>(`/session/${sessionID}/prompt_async`, {
      method: 'POST',
      body: JSON.stringify({
        parts,
        ...(resolvedAgent ? { agent: resolvedAgent } : {}),
        ...(modelPayload ? { model: modelPayload } : {}),
      }),
    })
  },

  /**
   * Materialize an attachment to disk in the container (/home/workdir/attachments & workspace)
   */
  async materializeAttachment(att: { filename?: string; mime?: string; dataUrl: string }): Promise<void> {
    try {
      await fetch('/api/materialize-attachment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: att.filename || 'image.png',
          mime: att.mime || 'image/png',
          dataUrl: att.dataUrl,
        }),
      })
    } catch (err) {
      console.warn('[API] materializeAttachment non-blocking warning:', err)
    }
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
   * Live run map. Busy/retry means the daemon is still generating.
   * A missing id is idle (process died, reboot, or the session is not running).
   * Null means the status call itself failed — caller must not invent busy.
   */
  async getSessionStatus(sessionID: string): Promise<SessionStatusPayload | null> {
    try {
      const raw = await request<unknown>('/session/status', { cache: 'no-store' })
      return sessionStatusFromTable(raw, sessionID)
    } catch {
      return null
    }
  },

  /**
   * Fetch available agents
   */
  async getAgents(): Promise<AgentInfo[]> {
    try {
      const raw = await request<any[]>('/agent')
      if (!Array.isArray(raw)) return []
      const list = raw.map((a) => ({
        name: String(a.name || 'Agent'),
        description: a.description ? String(a.description) : undefined,
        mode: a.mode ? String(a.mode) : undefined,
        native: Boolean(a.native),
        hidden: Boolean(a.hidden),
        model: a.model ? {
          providerID: a.model.providerID ? String(a.model.providerID) : undefined,
          modelID: a.model.modelID ? String(a.model.modelID) : undefined,
        } : undefined,
      }))
      cachedAgents = list
      return list
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
  /**
   * Discover skill packages from the workspace and the shared skills catalog.
   * The companion server scans SKILL.md; this client does not know the names.
   */
  async getSkills(directory?: string): Promise<SkillItem[]> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)
    try {
      const query = directory ? `?directory=${encodeURIComponent(directory)}` : ''
      const res = await fetch(`/api/skills${query}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
      if (!res.ok) return []
      const data = await res.json()
      if (!data || !Array.isArray(data.skills)) return []
      return data.skills
        .map((skill: any) => ({
          name: String(skill?.name || '').trim(),
          description: skill?.description ? String(skill.description) : undefined,
        }))
        .filter((skill: SkillItem) => skill.name.length > 0)
    } catch (err) {
      console.warn('Failed to discover skills:', err)
      return []
    } finally {
      clearTimeout(timeoutId)
    }
  },

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
  async checkHealth(timeoutMs: number = 4000): Promise<boolean> {
    const start = Date.now()
    const targetUrl = `${resolveDaemonBaseUrl()}/global/health`
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      const res = await fetch(targetUrl, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const duration = Date.now() - start
      if (res.ok) {
        return true
      }
      console.warn(`[daemon-health] Probe returned HTTP ${res.status} in ${duration}ms [url: ${targetUrl}]`)
      return false
    } catch (err: any) {
      const duration = Date.now() - start
      console.warn(`[daemon-health] Probe failed in ${duration}ms (${err?.name || 'Error'}: ${err?.message || err}) [url: ${targetUrl}]`)
      return false
    }
  },
}
