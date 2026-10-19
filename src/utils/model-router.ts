// Model routing SSOT shared by the floating A1 Model Router overlay.
// Priority cascade and circuit-breaker rules match A1ModelRouter (Obsidian).

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerRecord {
  state: CircuitState
  failures: number
  cooldownUntil: string | number
  lastFailureReason?: string | null
}

export interface OverriddenGroup {
  groupName: string
  priority: number
}

export interface ModelItem {
  id: string
  name: string
  priority: number
  ttftTimeout: number
  enabled: boolean
  tags?: string[]
  circuitBreaker?: CircuitBreakerRecord
  sourceGroupName?: string
  sourceGroupId?: string
  overriddenGroups?: OverriddenGroup[]
}

export interface ModelGroup {
  id: string
  name: string
  priority: number
  enabled: boolean
  strategy: string
  models: ModelItem[]
  description?: string
}

export interface SubagentBinding {
  role: string
  name?: string
  targetModelId?: string
  targetType?: 'group' | 'model'
  targetId?: string
  readOnly: boolean
  concurrency?: number
  description?: string
}

export interface RoutingSettings {
  $schema?: string
  version: string
  revision: number
  updatedAt?: string
  selectedActiveTarget: string
  activeGroupIds: string[]
  strategy: string
  circuitBreakers: Record<string, CircuitBreakerRecord>
  groups: ModelGroup[]
  standaloneModels: ModelItem[]
  activeStandaloneModelIds: string[]
  subagents: Record<string, SubagentBinding>
}

export const STORAGE_KEY = 'opencode_model_router_settings'
export const COOLDOWN_503_MS = 60_000

const closedBreaker = (): CircuitBreakerRecord => ({
  state: 'closed',
  failures: 0,
  cooldownUntil: 0,
  lastFailureReason: null,
})

export const DEFAULT_STANDALONE_MODELS: ModelItem[] = [
  {
    id: 'obsidian/grok-4.7',
    name: 'Grok 4.7 (Paid 满血主力)',
    priority: 100,
    ttftTimeout: 75,
    enabled: true,
    tags: ['reasoning', 'paid'],
    circuitBreaker: closedBreaker(),
  },
  {
    id: 'obsidian/gpt-6-astra',
    name: 'gpt 6 astra',
    priority: 85,
    ttftTimeout: 60,
    enabled: true,
    tags: ['coding'],
    circuitBreaker: closedBreaker(),
  },
  {
    id: 'obsidian/claude-opus-5',
    name: 'Claude Opus 5',
    priority: 80,
    ttftTimeout: 60,
    enabled: false,
    tags: ['reasoning'],
    circuitBreaker: closedBreaker(),
  },
]

export const DEFAULT_SUBAGENTS: Record<string, SubagentBinding> = {
  prometheus: {
    role: 'prometheus',
    name: 'Prometheus (规划者)',
    targetType: 'model',
    targetId: 'obsidian/grok-4.7',
    targetModelId: 'obsidian/grok-4.7',
    readOnly: true,
    concurrency: 1,
    description: '只读架构规划，产出蓝图',
  },
  atlas: {
    role: 'atlas',
    name: 'Atlas (执行者)',
    targetType: 'model',
    targetId: 'obsidian/grok-4.7',
    targetModelId: 'obsidian/grok-4.7',
    readOnly: false,
    concurrency: 1,
    description: '权威编码执行与验证',
  },
  researcher: {
    role: 'researcher',
    name: 'Researcher (调查者)',
    targetType: 'model',
    targetId: 'obsidian/gpt-6-astra',
    targetModelId: 'obsidian/gpt-6-astra',
    readOnly: true,
    concurrency: 1,
    description: '只读调研，不改文件',
  },
  explore: {
    role: 'explore',
    name: 'Explore (探索者)',
    targetType: 'model',
    targetId: 'obsidian/gpt-6-astra',
    targetModelId: 'obsidian/gpt-6-astra',
    readOnly: true,
    concurrency: 1,
    description: '只读代码定位与检索',
  },
}

export function createDefaultSettings(): RoutingSettings {
  return {
    $schema: 'https://opencode.ai/routing.schema.json',
    version: '1.1.0',
    revision: 1,
    selectedActiveTarget: 'all-active',
    activeGroupIds: [],
    strategy: 'priority-fallback',
    circuitBreakers: {},
    groups: [],
    standaloneModels: DEFAULT_STANDALONE_MODELS.map((m) => ({ ...m, circuitBreaker: closedBreaker() })),
    activeStandaloneModelIds: ['obsidian/grok-4.7', 'obsidian/gpt-6-astra'],
    subagents: {
      prometheus: { ...DEFAULT_SUBAGENTS.prometheus },
      atlas: { ...DEFAULT_SUBAGENTS.atlas },
      researcher: { ...DEFAULT_SUBAGENTS.researcher },
      explore: { ...DEFAULT_SUBAGENTS.explore },
    },
  }
}

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function normalizeBreaker(raw: unknown): CircuitBreakerRecord {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const state = rec.state === 'open' || rec.state === 'half-open' || rec.state === 'closed' ? rec.state : 'closed'
  return {
    state,
    failures: asNumber(rec.failures, 0),
    cooldownUntil: typeof rec.cooldownUntil === 'string' || typeof rec.cooldownUntil === 'number' ? rec.cooldownUntil : 0,
    lastFailureReason: typeof rec.lastFailureReason === 'string' ? rec.lastFailureReason : null,
  }
}

function normalizeModel(raw: unknown, fallbackPriority = 50): ModelItem | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  const id = asString(m.id, '')
  if (!id) return null
  return {
    id,
    name: asString(m.name, id),
    priority: asNumber(m.priority, fallbackPriority),
    ttftTimeout: asNumber(m.ttftTimeout, 25),
    enabled: m.enabled !== false,
    tags: Array.isArray(m.tags) ? m.tags.filter((t): t is string => typeof t === 'string') : [],
    circuitBreaker: m.circuitBreaker ? normalizeBreaker(m.circuitBreaker) : undefined,
  }
}

function normalizeGroup(raw: unknown): ModelGroup | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as Record<string, unknown>
  const id = asString(g.id, '')
  if (!id) return null
  const models = Array.isArray(g.models)
    ? g.models.map((item) => normalizeModel(item)).filter((item): item is ModelItem => item !== null)
    : []
  return {
    id,
    name: asString(g.name, id),
    priority: asNumber(g.priority, 100),
    enabled: g.enabled !== false,
    strategy: asString(g.strategy, 'priority-fallback'),
    models,
    description: typeof g.description === 'string' ? g.description : '',
  }
}

function normalizeSubagent(role: string, raw: unknown): SubagentBinding {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const targetType = s.targetType === 'group' || s.targetType === 'model' ? s.targetType : undefined
  return {
    role: asString(s.role, role),
    name: typeof s.name === 'string' ? s.name : role,
    targetModelId: typeof s.targetModelId === 'string' ? s.targetModelId : undefined,
    targetType,
    targetId: typeof s.targetId === 'string' ? s.targetId : undefined,
    readOnly: Boolean(s.readOnly),
    concurrency: asNumber(s.concurrency, 1),
    description: typeof s.description === 'string' ? s.description : '',
  }
}

/**
 * Defensive SSOT parse. Broken JSON or a non-object body fails closed.
 */
export function parseSSOT(raw: string): { success: true; data: RoutingSettings } | { success: false; error: string } {
  try {
    const json = JSON.parse(raw) as unknown
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      return { success: false, error: 'SSOT root must be an object' }
    }
    return { success: true, data: normalizeSettings(json as Record<string, unknown>) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON syntax'
    return { success: false, error: message }
  }
}

export function normalizeSettings(raw: Partial<RoutingSettings> | Record<string, unknown>): RoutingSettings {
  const base = createDefaultSettings()
  const source = raw && typeof raw === 'object' ? raw : {}
  const groups = Array.isArray(source.groups)
    ? source.groups.map((g) => normalizeGroup(g)).filter((g): g is ModelGroup => g !== null)
    : base.groups
  const standaloneModels = Array.isArray(source.standaloneModels)
    ? source.standaloneModels.map((m) => normalizeModel(m)).filter((m): m is ModelItem => m !== null)
    : base.standaloneModels

  const activeGroupIds = Array.isArray(source.activeGroupIds)
    ? source.activeGroupIds.filter((id): id is string => typeof id === 'string')
    : groups.filter((g) => g.enabled).map((g) => g.id)

  const activeStandaloneModelIds = Array.isArray(source.activeStandaloneModelIds)
    ? source.activeStandaloneModelIds.filter((id): id is string => typeof id === 'string')
    : standaloneModels.filter((m) => m.enabled).map((m) => m.id)

  const breakersRaw = source.circuitBreakers && typeof source.circuitBreakers === 'object'
    ? (source.circuitBreakers as Record<string, unknown>)
    : {}
  const circuitBreakers: Record<string, CircuitBreakerRecord> = {}
  for (const [id, rec] of Object.entries(breakersRaw)) {
    circuitBreakers[id] = normalizeBreaker(rec)
  }

  const subRaw = source.subagents && typeof source.subagents === 'object' && !Array.isArray(source.subagents)
    ? (source.subagents as Record<string, unknown>)
    : {}
  const subagents: Record<string, SubagentBinding> = { ...base.subagents }
  if (Array.isArray(source.subagents)) {
    for (const item of source.subagents) {
      if (!item || typeof item !== 'object') continue
      const role = asString((item as Record<string, unknown>).role, '')
      if (!role) continue
      subagents[role] = normalizeSubagent(role, item)
    }
  } else {
    for (const [role, item] of Object.entries(subRaw)) {
      subagents[role] = normalizeSubagent(role, item)
    }
  }

  const selected = typeof source.selectedActiveTarget === 'string'
    ? source.selectedActiveTarget
    : typeof (source as Record<string, unknown>).selectedActiveId === 'string'
      ? String((source as Record<string, unknown>).selectedActiveId)
      : base.selectedActiveTarget

  return {
    $schema: typeof source.$schema === 'string' ? source.$schema : base.$schema,
    version: asString(source.version, base.version),
    revision: asNumber(source.revision, base.revision),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : undefined,
    selectedActiveTarget: selected,
    activeGroupIds,
    strategy: asString(source.strategy, base.strategy),
    circuitBreakers,
    groups,
    standaloneModels,
    activeStandaloneModelIds,
    subagents,
  }
}

export function cooldownEpoch(record: CircuitBreakerRecord | undefined): number {
  if (!record || !record.cooldownUntil) return 0
  if (typeof record.cooldownUntil === 'string') {
    const parsed = Date.parse(record.cooldownUntil)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return Number(record.cooldownUntil) || 0
}

/**
 * Merge the stored breaker onto a chain item and roll an elapsed open breaker to half-open.
 * Does not mutate the input settings.
 */
export function resolveBreaker(
  modelId: string,
  settings: RoutingSettings,
  now = Date.now(),
): CircuitBreakerRecord | undefined {
  const stored = settings.circuitBreakers?.[modelId]
  if (!stored) return undefined
  if (stored.state === 'open' && cooldownEpoch(stored) > 0 && now >= cooldownEpoch(stored)) {
    return { ...stored, state: 'half-open' }
  }
  return { ...stored }
}

/**
 * Union of enabled models from active groups and enabled standalone models.
 * Same id keeps the highest priority. Strict descending priority sort.
 * Active circuit-breaker records are attached (elapsed open → half-open).
 */
export function buildCompositeChain(settings: RoutingSettings, now = Date.now()): ModelItem[] {
  const modelMap = new Map<string, ModelItem>()
  const activeGroupSet = new Set(
    settings.activeGroupIds !== undefined
      ? settings.activeGroupIds
      : settings.groups.filter((g) => g.enabled).map((g) => g.id),
  )

  const registerModel = (model: ModelItem, sourceGroupName: string, sourceGroupId: string) => {
    if (model.enabled === false) return
    const existing = modelMap.get(model.id)
    if (!existing) {
      modelMap.set(model.id, {
        ...model,
        sourceGroupName,
        sourceGroupId,
        overriddenGroups: [],
        circuitBreaker: resolveBreaker(model.id, settings, now),
      })
    } else if (model.priority > existing.priority) {
      const prevOverridden = existing.overriddenGroups ? [...existing.overriddenGroups] : []
      if (existing.sourceGroupName) {
        prevOverridden.push({
          groupName: existing.sourceGroupName,
          priority: existing.priority,
        })
      }
      modelMap.set(model.id, {
        ...model,
        sourceGroupName,
        sourceGroupId,
        overriddenGroups: prevOverridden,
        circuitBreaker: resolveBreaker(model.id, settings, now),
      })
    } else {
      const overridden = existing.overriddenGroups ? [...existing.overriddenGroups] : []
      overridden.push({ groupName: sourceGroupName, priority: model.priority })
      existing.overriddenGroups = overridden
    }
  }

  for (const group of settings.groups) {
    if (!group.enabled || !activeGroupSet.has(group.id)) continue
    for (const model of group.models) {
      registerModel(model, group.name, group.id)
    }
  }

  if (settings.standaloneModels) {
    const activeSoloSet = settings.activeStandaloneModelIds !== undefined
      ? new Set(settings.activeStandaloneModelIds)
      : null
    for (const model of settings.standaloneModels) {
      if (activeSoloSet && !activeSoloSet.has(model.id)) continue
      registerModel(model, '独立模型', 'standalone')
    }
  }

  for (const item of modelMap.values()) {
    item.circuitBreaker = resolveBreaker(item.id, settings, now)
  }

  const list = Array.from(modelMap.values())
  list.sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50))
  return list
}

export function isModelCooling(model: ModelItem, now = Date.now()): boolean {
  const cb = model.circuitBreaker
  if (!cb || cb.state !== 'open') return false
  const until = cooldownEpoch(cb)
  return until > now
}

export function getModelRemainingSeconds(model: ModelItem, now = Date.now()): number {
  if (!isModelCooling(model, now)) return 0
  const until = cooldownEpoch(model.circuitBreaker)
  return Math.max(0, Math.ceil((until - now) / 1000))
}

/**
 * Record a failure and open the breaker.
 * 503 uses a 60s cooldown (the companion fault-injection contract).
 */
export function recordFailure(
  settings: RoutingSettings,
  modelId: string,
  reason: '503' | 'timeout' | 'other' = '503',
  now = Date.now(),
): RoutingSettings {
  const prev = settings.circuitBreakers[modelId]
  const failures = (prev?.failures || 0) + 1
  let base = reason === '503' ? COOLDOWN_503_MS : reason === 'timeout' ? 30_000 : 60_000
  if (failures >= 3) {
    base = Math.min(base * 2 ** (failures - 3), 300_000)
  }
  const label = reason === '503' ? '503 Service Unavailable (Simulated)' : reason
  return {
    ...settings,
    circuitBreakers: {
      ...settings.circuitBreakers,
      [modelId]: {
        state: 'open',
        failures,
        cooldownUntil: now + base,
        lastFailureReason: label,
      },
    },
  }
}

export function resetAllCircuitBreakers(settings: RoutingSettings): RoutingSettings {
  const clearModel = (model: ModelItem): ModelItem => ({
    ...model,
    circuitBreaker: closedBreaker(),
  })
  return {
    ...settings,
    circuitBreakers: {},
    groups: settings.groups.map((g) => ({ ...g, models: g.models.map(clearModel) })),
    standaloneModels: settings.standaloneModels.map(clearModel),
  }
}

export function fastHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString(36)
}

export function serializeSSOT(
  currentRaw: string | Record<string, unknown>,
  patch: Partial<RoutingSettings>,
): { jsonString: string; hash: string } {
  let base: Record<string, unknown> = {}
  if (typeof currentRaw === 'string') {
    try {
      const parsed = JSON.parse(currentRaw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>
      }
    } catch {
      base = {}
    }
  } else if (currentRaw && typeof currentRaw === 'object') {
    base = { ...currentRaw }
  }

  const prevRev = typeof base.revision === 'number' ? base.revision : 1
  const merged: Record<string, unknown> = {
    $schema: base.$schema || 'https://opencode.ai/routing.schema.json',
    ...base,
    ...patch,
    version: patch.version || base.version || '1.1.0',
    revision: prevRev + 1,
    updatedAt: new Date().toISOString(),
  }

  const jsonString = JSON.stringify(merged, null, 2)
  return { jsonString, hash: fastHash(jsonString) }
}

export function loadRouterSettings(): RoutingSettings {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = parseSSOT(raw)
        if (parsed.success) return parsed.data
      }
    }
  } catch {
    // ignore storage failures and fall back to defaults
  }
  return createDefaultSettings()
}

export function saveRouterSettings(settings: RoutingSettings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const next: RoutingSettings = {
        ...settings,
        revision: (settings.revision || 1) + 1,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }
  } catch {
    // persistence is best-effort; the in-memory panel still works
  }
}

export function clampPriority(value: number): number {
  if (!Number.isFinite(value)) return 50
  return Math.max(1, Math.min(100, Math.round(value)))
}

export function clampTimeout(value: number): number {
  if (!Number.isFinite(value)) return 25
  return Math.max(5, Math.min(300, Math.round(value)))
}

export function chainForSelection(settings: RoutingSettings, now = Date.now()): ModelItem[] {
  const selected = settings.selectedActiveTarget
  if (!selected || selected === 'all-active') {
    return buildCompositeChain(settings, now)
  }
  if (selected.startsWith('group:')) {
    const gid = selected.slice('group:'.length)
    return buildCompositeChain({ ...settings, activeGroupIds: [gid], activeStandaloneModelIds: [] }, now)
  }
  if (selected.startsWith('model:')) {
    const mid = selected.slice('model:'.length)
    return buildCompositeChain({ ...settings, activeGroupIds: [], activeStandaloneModelIds: [mid] }, now)
  }
  return buildCompositeChain(settings, now)
}
