/**
 * Model Context Limit & Dynamic Threshold Resolution Utility
 * 
 * SSOT Reference: C:\AICore\skills\OpenCodeDataControl\scripts\data\model_profiles.json
 * Context thresholds:
 * - >= 80%: Red ('red')
 * - >= 50%: Yellow ('yellow')
 * - < 50%: Green ('green')
 */

export interface ModelProfile {
  display_name?: string
  family?: string
  api_context_tokens?: number
  effective_context_tokens?: number
  warn_tokens?: number
  human_gate_tokens?: number
  reset_tokens?: number
  source?: string
  notes?: string
}

export interface ModelProfilesData {
  version?: number
  default_model_id?: string
  aliases?: Record<string, string>
  profiles?: Record<string, ModelProfile>
}

export type TokenThreshold = 'green' | 'yellow' | 'red'

/**
 * Built-in fallback baseline if server request is pending or disconnected.
 * Grok 4.7 is strictly 500k (500,000) effective operational ceiling.
 */
export const DEFAULT_MODEL_PROFILES: ModelProfilesData = {
  version: 1,
  default_model_id: 'unknown',
  aliases: {
    'obsidian/grok-4.7': 'grok-4.7',
    'grok-4-7': 'grok-4.7',
    'grok4.7': 'grok-4.7',
    'newapi/grok-4.7': 'grok-4.7',
    'obsidian/grok-4.6': 'grok-4.6',
    'grok-4-6': 'grok-4.6',
    'grok4.6': 'grok-4.6',
    'newapi/grok-4.6': 'grok-4.6',
    'obsidian/gemini-3.8-flash': 'gemini-3.8-flash',
    'obsidian/gemini-3.7-flash': 'gemini-3.7-flash',
    'gemini-3-7-flash': 'gemini-3.7-flash',
    'claude-3.5-sonnet': 'claude-3.5-sonnet',
    'claude-35-sonnet': 'claude-3.5-sonnet',
    'claude-3-5-sonnet': 'claude-3.5-sonnet',
    'claude-3.7-sonnet': 'claude-3.7-sonnet',
    'claude-3-7-sonnet': 'claude-3.7-sonnet',
    'obsidian/claude-opus-5': 'claude-opus-5',
    'obsidian/kimi-k3': 'kimi-k3',
    'obsidian/qwen3.8-max': 'qwen3.8-max',
    'unknown': 'unknown',
  },
  profiles: {
    'grok-4.7': {
      display_name: 'Grok 4.7',
      family: 'grok',
      api_context_tokens: 1000000,
      effective_context_tokens: 500000,
      warn_tokens: 200000,
      human_gate_tokens: 300000,
      reset_tokens: 500000,
    },
    'grok-4.6': {
      display_name: 'Grok 4.6',
      family: 'grok',
      api_context_tokens: 1000000,
      effective_context_tokens: 500000,
      warn_tokens: 200000,
      human_gate_tokens: 300000,
      reset_tokens: 500000,
    },
    'claude-3.5-sonnet': {
      display_name: 'Claude 3.5 Sonnet',
      family: 'claude',
      api_context_tokens: 200000,
      effective_context_tokens: 200000,
      warn_tokens: 120000,
      human_gate_tokens: 160000,
      reset_tokens: 180000,
    },
    'claude-3.7-sonnet': {
      display_name: 'Claude 3.7 Sonnet',
      family: 'claude',
      api_context_tokens: 200000,
      effective_context_tokens: 200000,
      warn_tokens: 120000,
      human_gate_tokens: 160000,
      reset_tokens: 180000,
    },
    'gemini-3.7-flash': {
      display_name: 'Gemini 3.7 Flash',
      family: 'gemini',
      api_context_tokens: 1000000,
      effective_context_tokens: 800000,
      warn_tokens: 400000,
      human_gate_tokens: 600000,
      reset_tokens: 800000,
    },
    'gemini-3.8-flash': {
      display_name: 'Gemini 3.8 Flash',
      family: 'gemini',
      api_context_tokens: 1000000,
      effective_context_tokens: 800000,
      warn_tokens: 400000,
      human_gate_tokens: 600000,
      reset_tokens: 800000,
    },
    'kimi-k3': {
      display_name: 'Kimi K3',
      family: 'kimi',
      api_context_tokens: 1048576,
      effective_context_tokens: 800000,
      warn_tokens: 400000,
      human_gate_tokens: 600000,
      reset_tokens: 800000,
    },
    'qwen3.8-max': {
      display_name: 'Qwen 3.8 Max',
      family: 'qwen',
      api_context_tokens: 1000000,
      effective_context_tokens: 800000,
      warn_tokens: 400000,
      human_gate_tokens: 600000,
      reset_tokens: 800000,
    },
    'unknown': {
      display_name: 'Unknown / unlisted model',
      family: 'unknown',
      api_context_tokens: 200000,
      effective_context_tokens: 180000,
      warn_tokens: 120000,
      human_gate_tokens: 160000,
      reset_tokens: 180000,
    },
  },
}

/**
 * Normalizes and resolves any input model ID string to a canonical profile key.
 */
export function resolveCanonicalModelId(
  rawId: string | undefined | null,
  aliases?: Record<string, string>
): string {
  if (!rawId || typeof rawId !== 'string') return 'unknown'
  const trimmed = rawId.trim()
  if (!trimmed) return 'unknown'

  const mergedAliases = { ...DEFAULT_MODEL_PROFILES.aliases, ...aliases }

  // 1. Direct match in aliases
  if (mergedAliases[trimmed]) {
    return mergedAliases[trimmed]
  }

  // 2. Case-insensitive match in aliases
  const lower = trimmed.toLowerCase()
  if (mergedAliases[lower]) {
    return mergedAliases[lower]
  }

  // 3. Strip provider prefix (e.g. 'obsidian/grok-4.7' -> 'grok-4.7')
  if (lower.includes('/')) {
    const afterSlash = lower.split('/').pop() || ''
    if (mergedAliases[afterSlash]) {
      return mergedAliases[afterSlash]
    }
    if (afterSlash) {
      // Check if afterSlash directly exists as a profile key
      return afterSlash
    }
  }

  // 4. Dot/dash normalization (e.g. 'grok-4-7' <-> 'grok-4.7' <-> 'grok4.7')
  const dashNormalized = lower.replace(/\./g, '-')
  if (mergedAliases[dashNormalized]) {
    return mergedAliases[dashNormalized]
  }

  // 5. Check if string includes grok-4.7
  if (lower.includes('grok-4.7') || lower.includes('grok-4-7') || lower.includes('grok4.7')) {
    return 'grok-4.7'
  }
  if (lower.includes('grok-4.6') || lower.includes('grok-4-6') || lower.includes('grok4.6')) {
    return 'grok-4.6'
  }
  if (lower.includes('gemini-3.7') || lower.includes('gemini-3-7')) {
    return 'gemini-3.7-flash'
  }
  if (lower.includes('claude-3.5') || lower.includes('claude-3-5')) {
    return 'claude-3.5-sonnet'
  }

  return lower
}

/**
 * Retrieves the operational token context ceiling for a given model ID.
 * Returns effective_context_tokens or reset_tokens or api_context_tokens.
 * Grok 4.7 strictly returns 500,000 (500k).
 */
export function getTokenLimit(
  modelId: string | undefined | null,
  data?: ModelProfilesData | null
): number {
  const canonicalId = resolveCanonicalModelId(modelId, data?.aliases)
  const profiles = { ...DEFAULT_MODEL_PROFILES.profiles, ...(data?.profiles || {}) }
  const profile = profiles[canonicalId] || profiles['unknown']

  if (profile) {
    return (
      profile.effective_context_tokens ||
      profile.reset_tokens ||
      profile.api_context_tokens ||
      500000
    )
  }

  // Safe fallback: grok models default to 500k, others 200k
  if (canonicalId.includes('grok')) {
    return 500000
  }
  return 500000
}

/**
 * Calculates threshold status based on active window token usage percentage:
 * - >= 80%: 'red' (红色)
 * - >= 50%: 'yellow' (黄色)
 * - < 50%: 'green' (绿色)
 */
export function getTokenThreshold(percent: number): TokenThreshold {
  if (percent >= 80) return 'red'
  if (percent >= 50) return 'yellow'
  return 'green'
}

/**
 * Cleanly formats token limit numbers:
 * 500000 -> '500k'
 * 1000000 -> '1M'
 * 200000 -> '200k'
 * 800000 -> '800k'
 */
export function formatTokenLimit(tokens: number | undefined | null): string {
  if (!tokens || tokens <= 0) return '500k'
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`
  }
  if (tokens >= 1_000) {
    const k = tokens / 1_000
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`
  }
  return tokens.toLocaleString()
}

/**
 * Returns Tailwind CSS styling classes corresponding to the threshold.
 */
export function getTokenColorClasses(threshold: TokenThreshold) {
  switch (threshold) {
    case 'red':
      return {
        text: 'text-rose-500',
        stroke: '#ef4444',
        bg: 'bg-rose-500',
        border: 'border-rose-500/40',
        badgeBg: 'bg-rose-950/60',
        badgeBorder: 'border-rose-800/50',
        badgeText: 'text-rose-300',
      }
    case 'yellow':
      return {
        text: 'text-amber-400',
        stroke: '#eab308',
        bg: 'bg-amber-400',
        border: 'border-amber-400/40',
        badgeBg: 'bg-amber-950/60',
        badgeBorder: 'border-amber-800/50',
        badgeText: 'text-amber-300',
      }
    case 'green':
    default:
      return {
        text: 'text-emerald-400',
        stroke: '#22c55e',
        bg: 'bg-emerald-400',
        border: 'border-emerald-400/40',
        badgeBg: 'bg-emerald-950/60',
        badgeBorder: 'border-emerald-800/50',
        badgeText: 'text-emerald-300',
      }
  }
}

/**
 * Active context window. Not session.tokens.
 *
 * session.tokens is the lifetime API bill (every turn, including reverted ones).
 * It only grows. The header must not display it as "current context".
 *
 * The OpenCode desktop "Tokens" figure is the last assistant message whose
 * info.tokens sum is > 0: input + output + reasoning + cache.read + cache.write.
 * Skill text is already inside input. Do not drop output or reasoning.
 * A trailing 0-token reply (in flight or aborted) is skipped, same as the desktop app.
 *
 * Revert: session.revert.messageID is a boundary, not a refund. Messages after that
 * boundary are dropped unless a newer user message exists past it (the revert was
 * already followed by a new turn).
 */
export interface OpenCodeContextUsage {
  total: number
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  usagePercent: number
  limit: number
  messageId?: string
}

export interface MessageTokenSource {
  info?: {
    id?: string
    role?: string
    tokens?: {
      total?: number
      input?: number
      output?: number
      reasoning?: number
      cache?: {
        read?: number
        write?: number
      }
    }
  }
  parts?: Array<{
    type?: string
    tokens?: {
      total?: number
      input?: number
      output?: number
      reasoning?: number
      cache?: {
        read?: number
        write?: number
      }
    }
  }>
}

interface TokenFields {
  input?: number
  output?: number
  reasoning?: number
  cache?: { read?: number; write?: number }
}

interface StepTokenReading {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  /** Official desktop total: input + output + reasoning + cache. */
  total: number
}

function readTokenFields(toks: TokenFields | undefined): StepTokenReading {
  const input = Number(toks?.input || 0)
  const output = Number(toks?.output || 0)
  const reasoning = Number(toks?.reasoning || 0)
  const cacheRead = Number(toks?.cache?.read || 0)
  const cacheWrite = Number(toks?.cache?.write || 0)
  return {
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    total: input + output + reasoning + cacheRead + cacheWrite,
  }
}

function stepReadings(message: MessageTokenSource): StepTokenReading[] {
  const fromParts = (message.parts || [])
    .filter((p) => p.type === 'step-finish' && p.tokens)
    .map((p) => readTokenFields(p.tokens))
    .filter((r) => r.total > 0)
  if (message.info?.tokens) {
    const fromInfo = readTokenFields(message.info.tokens)
    if (fromInfo.total > 0) return [fromInfo]
  }
  return fromParts
}

function emptyUsage(limit: number): OpenCodeContextUsage {
  return {
    total: 0,
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    usagePercent: 0,
    limit,
  }
}

export function calculateOpenCodeContextUsage(
  messages: MessageTokenSource[] | undefined | null,
  limit: number,
  revertMessageId?: string
): OpenCodeContextUsage {
  if (!messages || messages.length === 0) return emptyUsage(limit)

  let visible = messages
  if (revertMessageId) {
    const revertIdx = messages.findIndex((m) => m.info?.id === revertMessageId)
    if (revertIdx !== -1) {
      const continued = messages.slice(revertIdx + 1).some((m) => m.info?.role === 'user')
      if (!continued) visible = messages.slice(0, revertIdx)
    }
  }

  // Last assistant with a non-zero official total. Skips an in-flight 0-token reply.
  for (let i = visible.length - 1; i >= 0; i--) {
    const message = visible[i]
    if (message.info?.role !== 'assistant') continue
    const reading = stepReadings(message)[0]
    if (!reading || reading.total <= 0) continue
    const usagePercent = limit > 0 ? Math.round((reading.total / limit) * 100) : 0
    return {
      total: reading.total,
      input: reading.input,
      output: reading.output,
      reasoning: reading.reasoning,
      cacheRead: reading.cacheRead,
      cacheWrite: reading.cacheWrite,
      usagePercent,
      limit,
      messageId: message.info?.id,
    }
  }

  return emptyUsage(limit)
}

