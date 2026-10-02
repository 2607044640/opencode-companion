// Curated Model Filter Engine
// Strictly enforces allowed models (grok-4.6, grok-4.5, gemini-3.8-flash, gemini-3.7-flash)
// while hiding unwanted models, legacy free cascade, and all OpenCode Zen bloat.

export const ALLOWED_CANONICAL_MODEL_IDS = new Set([
  'grok-4.7',
  'grok-4.6',
  'grok-4.5',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
])

/**
 * Returns true if the model matches the user's curated whitelist:
 * - grok-4.6
 * - grok-4.5
 * - gemini-3.8-flash
 * - gemini-3.7-flash (Our Flash 3.7 connected to OpenCode)
 * Explicitly rejects OpenCode Zen provider, free cascade, and all unlisted models.
 */
export function isCuratedModel(providerId?: string, modelId?: string, modelName?: string): boolean {
  if (!modelId) return false

  // Strictly block OpenCode Zen provider models
  if (providerId === 'opencode') return false

  const id = modelId.toLowerCase().trim()
  const name = (modelName || '').toLowerCase().trim()

  // 1. Direct canonical match
  if (ALLOWED_CANONICAL_MODEL_IDS.has(id)) return true

  // 2. Grok 4.7, Grok 4.6 & Grok 4.5
  if (
    id === 'grok-4.7' ||
    id === 'grok4.7' ||
    id.includes('grok-4.7') ||
    id.includes('grok4.7') ||
    name.includes('grok 4.7') ||
    name.includes('grok-4.7')
  ) {
    return true
  }

  if (
    id === 'grok-4.6' ||
    id === 'grok4.6' ||
    id.includes('grok-4.6') ||
    id.includes('grok4.6') ||
    name.includes('grok 4.6') ||
    name.includes('grok-4.6')
  ) {
    return true
  }

  if (
    id === 'grok-4.5' ||
    id === 'grok4.5' ||
    id.includes('grok-4.5') ||
    id.includes('grok4.5') ||
    name.includes('grok 4.5') ||
    name.includes('grok-4.5')
  ) {
    return true
  }

  // 3. Flash 3.8 (gemini-3.8-flash)
  if (
    id === 'gemini-3.8-flash' ||
    id.includes('3.8-flash') ||
    id.includes('flash-3.8') ||
    id.includes('flash3.8') ||
    (id.includes('gemini') && id.includes('3.8')) ||
    name.includes('3.8 flash') ||
    name.includes('flash 3.8')
  ) {
    return true
  }

  // 4. Flash 3.7 (gemini-3.7-flash)
  if (
    id === 'gemini-3.7-flash' ||
    id.includes('3.7-flash') ||
    id.includes('flash-3.7') ||
    id.includes('flash3.7') ||
    (id.includes('gemini') && id.includes('3.7')) ||
    name.includes('3.7 flash') ||
    name.includes('flash 3.7')
  ) {
    return true
  }

  return false
}

/**
 * Checks whether a model is visible in the model selector dropdown.
 * Checks user custom modelVisibility map first.
 * If not explicitly overridden, falls back to the curated whitelist.
 */
export function isModelVisible(
  providerId: string,
  modelId: string,
  modelName?: string,
  modelVisibility?: Record<string, boolean>,
  providerVisibility?: Record<string, boolean>
): boolean {
  if (providerVisibility && providerVisibility[providerId] === false) {
    return false
  }

  const key = `${providerId}/${modelId}`
  if (modelVisibility && typeof modelVisibility[key] === 'boolean') {
    return modelVisibility[key]
  }

  return isCuratedModel(providerId, modelId, modelName)
}

export interface ResolveSeniorModelOptions {
  routingConfig?: {
    seniorModel?: { providerID: string; modelID: string; name?: string } | null
  } | null
  daemonConfig?: {
    model?: string
    agent?: Record<string, { model?: string }>
  } | null
  curatedModels: Array<{ providerID: string; modelID: string; name?: string }>
}

/**
 * Calculates priority score for graceful fallback when routing SSOT is absent.
 * Hierarchy:
 * - Grok senior tier: 4.7 (1000) > 4.6 (900) > 4.5 (800) > other grok (750)
 * - Reasoning / Claude / GPT tier: Claude 3.7 Sonnet / Opus (700) > GPT-4o/o1/o3 (650)
 * - Fast workhorse tier: Gemini 3.8 Flash (500) > 3.7 Flash (400)
 * - General fallback (100)
 */
export function getModelPriorityScore(_providerId?: string, modelId?: string, modelName?: string): number {
  const id = (modelId || '').toLowerCase().trim()
  const name = (modelName || '').toLowerCase().trim()

  if (id.includes('grok-4.7') || id.includes('grok4.7') || name.includes('grok 4.7')) return 1000
  if (id.includes('grok-4.6') || id.includes('grok4.6') || name.includes('grok 4.6')) return 900
  if (id.includes('grok-4.5') || id.includes('grok4.5') || name.includes('grok 4.5')) return 800
  if (id.includes('grok') || name.includes('grok')) return 750

  if (id.includes('claude-3-7') || id.includes('opus') || name.includes('opus')) return 700
  if (id.includes('gpt-4') || id.includes('o1') || id.includes('o3') || name.includes('gpt-4')) return 650

  if (id.includes('3.8-flash') || id.includes('flash-3.8') || name.includes('3.8')) return 500
  if (id.includes('3.7-flash') || id.includes('flash-3.7') || name.includes('3.7')) return 400

  return 100
}

export function sortModelsByPriority(models: Array<{ providerID: string; modelID: string; name?: string }>) {
  return [...models].sort((a, b) => {
    const scoreA = getModelPriorityScore(a.providerID, a.modelID, a.name)
    const scoreB = getModelPriorityScore(b.providerID, b.modelID, b.name)
    return scoreB - scoreA
  })
}

/**
 * Dynamically resolves the Senior Model following strict tiered precedence:
 * 1. Central All-In-One JSON SSOT (opencode-routing.json) via companion routing config
 * 2. OpenCode daemon agent bindings (build / plan / executor / model)
 * 3. Graceful fallback: Priority-ranked selection from all available curated models
 */
export function resolveSeniorModel(options: ResolveSeniorModelOptions): { providerID: string; modelID: string; name?: string } | null {
  const { routingConfig, daemonConfig, curatedModels } = options

  // 1. First priority: Central SSOT JSON (opencode-routing.json)
  if (routingConfig?.seniorModel?.modelID && routingConfig?.seniorModel?.providerID) {
    const rProv = routingConfig.seniorModel.providerID
    const rMod = routingConfig.seniorModel.modelID
    const matched = curatedModels.find(
      (m) => m.providerID === rProv && m.modelID.toLowerCase() === rMod.toLowerCase()
    )
    return matched || {
      providerID: rProv,
      modelID: rMod,
      name: routingConfig.seniorModel.name || rMod,
    }
  }

  // 2. Second priority: OpenCode daemon config agent bindings
  const candidateAgentModels = [
    daemonConfig?.agent?.build?.model,
    daemonConfig?.agent?.plan?.model,
    daemonConfig?.agent?.executor?.model,
    daemonConfig?.agent?.planner?.model,
    daemonConfig?.model,
  ].filter(Boolean) as string[]

  for (const rawModel of candidateAgentModels) {
    if (typeof rawModel === 'string' && rawModel.includes('/')) {
      const [prov, ...rest] = rawModel.split('/')
      const mod = rest.join('/')
      if (prov && mod && isCuratedModel(prov, mod)) {
        const matched = curatedModels.find(
          (m) => m.providerID === prov && m.modelID.toLowerCase() === mod.toLowerCase()
        )
        return matched || { providerID: prov, modelID: mod }
      }
    }
  }

  // 3. Fallback priority ranking for general users
  if (curatedModels.length > 0) {
    const sorted = sortModelsByPriority(curatedModels)
    return sorted[0]
  }

  return null
}

