export interface RelayProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  redeemUrl?: string
  currency: 'USD' | 'CNY'
  quotaRate?: number // Quota units per 1 USD (default: 500,000 for OneAPI/NewAPI)
  cnyRate?: number // USD to CNY conversion rate (default: 7.2)
  balance?: number // Computed currency balance
  totalQuota?: number // Raw quota/limit from upstream
  usedQuota?: number // Raw used quota from upstream
  isUnmetered?: boolean // True if relay operates without token-level balance or uses direct catalog
  note?: string // Status note (e.g. '可用 (点卡直连)')
  lastUpdated?: number // Timestamp ms of last successful fetch
  status?: 'ok' | 'error' | 'loading'
  error?: string
}

export interface RelayQuotaResult {
  ok: boolean
  balance: number
  totalQuota?: number
  usedQuota?: number
  isUnmetered?: boolean
  note?: string
  currency: 'USD' | 'CNY'
  error?: string
  raw?: unknown
}

export const RELAY_PROVIDERS_STORAGE_KEY = 'opencode_relay_providers'
export const RELAY_REFRESH_INTERVAL_KEY = 'opencode_relay_refresh_interval'

export const DEFAULT_QUOTA_RATE = 500_000 // NewAPI/OneAPI standard: 500k quota = $1 USD
export const DEFAULT_CNY_RATE = 7.2

/**
 * Reads configured relay providers from storage.
 */
export function getRelayProviders(storage?: Storage): RelayProvider[] {
  const targetStorage = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
  if (!targetStorage) return []

  try {
    const raw = targetStorage.getItem(RELAY_PROVIDERS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is RelayProvider =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.baseUrl === 'string'
    )
  } catch {
    return []
  }
}

/**
 * Saves relay providers to storage.
 */
export function saveRelayProviders(providers: RelayProvider[], storage?: Storage): void {
  const targetStorage = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
  if (!targetStorage) return

  targetStorage.setItem(RELAY_PROVIDERS_STORAGE_KEY, JSON.stringify(providers))
}

/**
 * Adds a new relay provider.
 */
export function addRelayProvider(
  provider: Omit<RelayProvider, 'id'>,
  storage?: Storage
): RelayProvider {
  const providers = getRelayProviders(storage)
  const newProvider: RelayProvider = {
    ...provider,
    id: `relay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    quotaRate: provider.quotaRate ?? DEFAULT_QUOTA_RATE,
    cnyRate: provider.cnyRate ?? DEFAULT_CNY_RATE,
  }
  providers.push(newProvider)
  saveRelayProviders(providers, storage)
  return newProvider
}

/**
 * Updates an existing relay provider.
 */
export function updateRelayProvider(
  id: string,
  updates: Partial<RelayProvider>,
  storage?: Storage
): RelayProvider[] {
  const providers = getRelayProviders(storage)
  const index = providers.findIndex((p) => p.id === id)
  if (index === -1) return providers

  providers[index] = {
    ...providers[index],
    ...updates,
  }
  saveRelayProviders(providers, storage)
  return providers
}

/**
 * Deletes a relay provider by ID.
 */
export function deleteRelayProvider(id: string, storage?: Storage): RelayProvider[] {
  const providers = getRelayProviders(storage).filter((p) => p.id !== id)
  saveRelayProviders(providers, storage)
  return providers
}

/**
 * Parses raw quota response from OneAPI/NewAPI or OpenAI-compatible endpoints.
 */
export function parseQuotaResponse(
  data: unknown,
  provider: RelayProvider
): { balance: number; totalQuota?: number; usedQuota?: number; isUnmetered?: boolean; note?: string } {
  const quotaRate = provider.quotaRate && provider.quotaRate > 0 ? provider.quotaRate : DEFAULT_QUOTA_RATE
  const cnyRate = provider.cnyRate && provider.cnyRate > 0 ? provider.cnyRate : DEFAULT_CNY_RATE

  if (typeof data === 'number') {
    return { balance: Number(data.toFixed(2)) }
  }

  if (typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>

    // 1. OpenAI / OneAPI subscription endpoint: { hard_limit_usd, total_usage, ... }
    if (typeof record.hard_limit_usd !== 'undefined' || typeof record.system_hard_limit_usd !== 'undefined') {
      const hardLimit = Number(record.hard_limit_usd ?? record.system_hard_limit_usd ?? 0)
      const totalUsage = Number(record.total_usage ?? 0)

      // In NewAPI, hard_limit_usd is directly remaining balance if total_usage is 0.
      // If total_usage is present and positive, remaining = hardLimit - totalUsage.
      let remainingUsd = hardLimit
      if (totalUsage > 0 && totalUsage <= hardLimit) {
        remainingUsd = hardLimit - totalUsage
      }

      const balance = provider.currency === 'CNY' ? remainingUsd * cnyRate : remainingUsd
      return {
        balance: Math.max(0, Number(balance.toFixed(2))),
        totalQuota: hardLimit,
        usedQuota: totalUsage,
      }
    }

    // 2. Direct balance field: { balance: 12.34 } or { data: { balance: 12.34 } }
    // TokenShop & GGUU /v1/usage return: { "balance": 11.098, "daily_usage": [...] }
    const nestedData = (typeof record.data === 'object' && record.data !== null ? record.data : record) as Record<string, unknown>

    if (typeof nestedData.balance === 'number' || typeof nestedData.balance === 'string') {
      const bal = Number(nestedData.balance)
      return {
        balance: Number(bal.toFixed(2)),
        isUnmetered: false,
      }
    }

    // 3. NewAPI /api/user/self or custom endpoint returning { quota } or { data: { quota } }
    if (typeof nestedData.quota === 'number' || typeof nestedData.quota === 'string') {
      const rawQuota = Number(nestedData.quota)
      const usd = rawQuota / quotaRate
      const balance = provider.currency === 'CNY' ? usd * cnyRate : usd
      return {
        balance: Math.max(0, Number(balance.toFixed(2))),
        totalQuota: rawQuota,
        isUnmetered: false,
      }
    }

    // 4. total_available field
    if (typeof nestedData.total_available === 'number' || typeof nestedData.total_available === 'string') {
      const bal = Number(nestedData.total_available)
      return {
        balance: Math.max(0, Number(bal.toFixed(2))),
        isUnmetered: false,
      }
    }

    // 5. Model catalog probe response: { object: 'list', data: [...] } -> Key verified & active
    if (record.object === 'list' && Array.isArray(record.data)) {
      return {
        balance: 0,
        isUnmetered: false,
        note: '已连接 ($0.00)',
      }
    }
  }

  return { balance: 0 }
}

/**
 * Fetches balance for a given provider, trying direct query and proxy fallback.
 */
export async function fetchRelayQuota(
  provider: RelayProvider,
  fetchImpl: typeof fetch = fetch
): Promise<RelayQuotaResult> {
  const base = provider.baseUrl.trim().replace(/\/+$/, '')
  if (!base) {
    return {
      ok: false,
      balance: 0,
      currency: provider.currency,
      error: 'Base URL is empty',
    }
  }

  // Determine potential probe URLs
  const urls: string[] = []
  if (
    base.includes('/billing') ||
    base.includes('/subscription') ||
    base.includes('/user/self') ||
    base.includes('/models') ||
    base.includes('/usage')
  ) {
    urls.push(base)
  } else {
    // Modern relays (TokenShop, GGUU, NewAPI v3) return exact { balance: number } on /v1/usage
    urls.push(`${base}/v1/usage`)
    urls.push(`${base}/v1/dashboard/billing/subscription`)
    urls.push(`${base}/dashboard/billing/subscription`)
    urls.push(`${base}/api/user/self`)
    urls.push(`${base}/v1/models`)
  }

  let lastError = 'Failed to fetch quota from provider'

  for (const url of urls) {
    try {
      let resp: Response
      const headers: Record<string, string> = {
        Accept: 'application/json',
      }
      if (provider.apiKey) {
        headers.Authorization = provider.apiKey.startsWith('Bearer ')
          ? provider.apiKey
          : `Bearer ${provider.apiKey}`
      }

      // Try direct fetch first
      try {
        resp = await fetchImpl(url, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(8000),
        })
      } catch {
        // Fallback to local CORS bypass proxy in Companion server
        const proxyUrl = `/api/proxy/relay-quota?target=${encodeURIComponent(url)}&token=${encodeURIComponent(provider.apiKey || '')}`
        resp = await fetchImpl(proxyUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        })
      }

      if (resp.ok) {
        const json = await resp.json()
        const parsed = parseQuotaResponse(json, provider)
        return {
          ok: true,
          balance: parsed.balance,
          totalQuota: parsed.totalQuota,
          usedQuota: parsed.usedQuota,
          isUnmetered: parsed.isUnmetered,
          note: parsed.note,
          currency: provider.currency,
          raw: json,
        }
      } else {
        lastError = `HTTP ${resp.status}: ${resp.statusText}`
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  return {
    ok: false,
    balance: 0,
    currency: provider.currency,
    error: lastError,
  }
}

/**
 * Synchronizes relay presets from local Companion server (/api/relays/presets).
 */
export async function syncRelayPresets(
  storage?: Storage,
  fetchImpl: typeof fetch = fetch
): Promise<RelayProvider[]> {
  try {
    const resp = await fetchImpl('/api/relays/presets', {
      method: 'GET',
      signal: AbortSignal.timeout(6000),
    })
    if (!resp.ok) return getRelayProviders(storage)
    const json = (await resp.json()) as { ok?: boolean; presets?: RelayProvider[] }
    if (!json || !Array.isArray(json.presets) || json.presets.length === 0) {
      return getRelayProviders(storage)
    }

    let current = getRelayProviders(storage)
    let modified = false

    // 1. Purge outdated or invalid presets (e.g. NovAI, dead GGUU)
    const cleaned = current.filter(
      (p) => !p.baseUrl.includes('once-cf.novai.su') && !p.baseUrl.includes('gguuai.com') && p.id !== 'relay_novai' && p.id !== 'relay_gguu'
    )
    if (cleaned.length !== current.length) {
      current = cleaned
      modified = true
    }

    // 2. Merge latest presets from server
    for (const preset of json.presets) {
      const pBase = (preset.baseUrl || '').trim().replace(/\/+$/, '')
      const existingIndex = current.findIndex(
        (p) => p.id === preset.id || (p.baseUrl && p.baseUrl.trim().replace(/\/+$/, '') === pBase)
      )

      if (existingIndex === -1) {
        current.push({
          ...preset,
          quotaRate: preset.quotaRate ?? DEFAULT_QUOTA_RATE,
          cnyRate: preset.cnyRate ?? DEFAULT_CNY_RATE,
        })
        modified = true
      } else {
        if (preset.name && current[existingIndex].name !== preset.name) {
          current[existingIndex].name = preset.name
          modified = true
        }
        if (preset.apiKey && current[existingIndex].apiKey !== preset.apiKey) {
          current[existingIndex].apiKey = preset.apiKey
          modified = true
        }
        if (preset.redeemUrl && current[existingIndex].redeemUrl !== preset.redeemUrl) {
          current[existingIndex].redeemUrl = preset.redeemUrl
          modified = true
        }
      }
    }

    if (modified || current.length === 0) {
      saveRelayProviders(current, storage)
    }
    return current
  } catch {
    return getRelayProviders(storage)
  }
}

/**
 * Formats a currency balance nicely with currency symbol.
 */
export function formatBalance(amount?: number, currency: 'USD' | 'CNY' = 'USD'): string {
  if (amount === undefined || isNaN(amount)) return '--'
  const symbol = currency === 'CNY' ? '¥' : '$'
  if (amount < 0) {
    return `-${symbol}${Math.abs(amount).toFixed(2)}`
  }
  return `${symbol}${amount.toFixed(2)}`
}

export interface BalanceSummary {
  cny: number
  usd: number
  totalFormatted: string
  hasProviders: boolean
  hasError: boolean
  isLoading: boolean
}

/**
 * Aggregates all provider balances into a single display summary.
 */
export function aggregateBalances(providers: RelayProvider[]): BalanceSummary {
  if (!providers || providers.length === 0) {
    return {
      cny: 0,
      usd: 0,
      totalFormatted: 'Relay Hub',
      hasProviders: false,
      hasError: false,
      isLoading: false,
    }
  }

  let totalCny = 0
  let totalUsd = 0
  let hasCny = false
  let hasUsd = false
  let hasError = false
  let isLoading = false

  for (const p of providers) {
    if (p.status === 'loading') isLoading = true
    if (p.status === 'error') hasError = true

    const val = typeof p.balance === 'number' && !isNaN(p.balance) ? p.balance : 0
    if (p.currency === 'USD') {
      totalUsd += val
      hasUsd = true
    } else {
      totalCny += val
      hasCny = true
    }
  }

  const formatAmount = (val: number, symbol: string) => {
    if (val < 0) return `-${symbol}${Math.abs(val).toFixed(2)}`
    return `${symbol}${val.toFixed(2)}`
  }

  let totalFormatted = ''
  if (hasCny && hasUsd) {
    totalFormatted = `¥${totalCny.toFixed(1)} + $${totalUsd.toFixed(1)}`
  } else if (hasUsd) {
    totalFormatted = formatAmount(totalUsd, '$')
  } else if (hasCny) {
    totalFormatted = formatAmount(totalCny, '¥')
  } else {
    totalFormatted = '$0.00'
  }

  return {
    cny: totalCny,
    usd: totalUsd,
    totalFormatted,
    hasProviders: true,
    hasError,
    isLoading,
  }
}
