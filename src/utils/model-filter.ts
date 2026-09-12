// Curated Model Filter Engine
// Strictly enforces allowed models (grok4.6, flash3.8, and the 2 free models connected to OpenCode)
// while hiding unwanted models and all OpenCode Zen bloat.

export const ALLOWED_CANONICAL_MODEL_IDS = new Set([
  'grok-4.6',
  'gemini-3.8-flash',
  'free-auto-cascade',
  'gemini-3.7-flash',
])

/**
 * Returns true if the model matches the user's curated whitelist:
 * - grok-4.6
 * - gemini-3.8-flash
 * - free-auto-cascade (Free Cascade connected to OpenCode)
 * - gemini-3.7-flash (Free Flash connected to OpenCode)
 * Explicitly rejects OpenCode Zen provider and all unlisted models.
 */
export function isCuratedModel(providerId?: string, modelId?: string, modelName?: string): boolean {
  if (!modelId) return false

  // Strictly block OpenCode Zen provider models
  if (providerId === 'opencode') return false

  const id = modelId.toLowerCase().trim()
  const name = (modelName || '').toLowerCase().trim()

  // 1. Direct canonical match
  if (ALLOWED_CANONICAL_MODEL_IDS.has(id)) return true

  // 2. Grok 4.6
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

  // 4. Two Free Models connected to OpenCode:
  // (a) free-auto-cascade
  if (
    id === 'free-auto-cascade' ||
    id.includes('auto-cascade') ||
    id.includes('free-cascade') ||
    name.includes('智能级联') ||
    name.includes('free cascade')
  ) {
    return true
  }

  // (b) gemini-3.7-flash (Free)
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
