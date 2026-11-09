import type { RelayProvider } from './relay-billing'

export interface RelaySnapshotProvider {
  id: string
  name: string
  balance: number
  currency: 'USD' | 'CNY'
  status?: string
}

export interface RelayBalanceSnapshot {
  id: string
  timestamp: number // ms epoch
  totalBalanceUsd: number
  totalBalanceCny: number
  totalNormalizedUsd: number // unified USD (CNY / 7.2)
  delta: number // change since previous snapshot (negative means spent, e.g. -0.04)
  trigger: 'manual_click' | 'auto_interval' | 'initial_load'
  providers: Record<string, RelaySnapshotProvider>
}

export const RELAY_HISTORY_STORAGE_KEY = 'opencode_relay_balance_history'
export const MAX_RELAY_HISTORY_ITEMS = 500
export const DEFAULT_CNY_RATE = 7.2
export const MAX_PLAUSIBLE_BALANCE_USD = 10_000
export const MAX_PLAUSIBLE_DELTA_USD = 500

/**
 * Sanitizes relay balance history by dropping sentinel/abnormal balance spikes
 * (e.g. upstream 100M glitches) and recalculating continuous deltas.
 */
export function sanitizeRelayHistory(history: RelayBalanceSnapshot[]): {
  sanitized: RelayBalanceSnapshot[]
  changed: boolean
} {
  let changed = false
  const valid: RelayBalanceSnapshot[] = []

  for (const item of history) {
    if (
      typeof item.totalNormalizedUsd !== 'number' ||
      !Number.isFinite(item.totalNormalizedUsd) ||
      item.totalNormalizedUsd < 0 ||
      item.totalNormalizedUsd > MAX_PLAUSIBLE_BALANCE_USD
    ) {
      changed = true
      continue
    }

    let providerAbnormal = false
    if (item.providers && typeof item.providers === 'object') {
      for (const prov of Object.values(item.providers)) {
        if (
          typeof prov.balance === 'number' &&
          (prov.balance > MAX_PLAUSIBLE_BALANCE_USD || prov.balance < 0)
        ) {
          providerAbnormal = true
          break
        }
      }
    }
    if (providerAbnormal) {
      changed = true
      continue
    }

    valid.push(item)
  }

  const hadPruning = valid.length !== history.length

  for (let i = 0; i < valid.length; i++) {
    const cur = valid[i]

    if (i === 0) {
      if (cur.delta !== 0) {
        changed = true
        valid[i] = { ...cur, delta: 0 }
      }
      continue
    }

    const prev = valid[i - 1]
    const deltaAbsurd =
      typeof cur.delta !== 'number' ||
      !Number.isFinite(cur.delta) ||
      Math.abs(cur.delta) > MAX_PLAUSIBLE_DELTA_USD

    const originalIdx = history.indexOf(cur)
    const prevInOriginal = originalIdx > 0 ? history[originalIdx - 1] : null
    const neighborWasPruned = hadPruning && prevInOriginal && prevInOriginal.id !== prev.id

    if (deltaAbsurd || neighborWasPruned) {
      let expectedDelta = Number((cur.totalNormalizedUsd - prev.totalNormalizedUsd).toFixed(4))
      if (Math.abs(expectedDelta) > MAX_PLAUSIBLE_DELTA_USD) {
        expectedDelta = 0
      }
      if (cur.delta !== expectedDelta) {
        changed = true
        valid[i] = {
          ...cur,
          delta: expectedDelta,
        }
      }
    }
  }

  return { sanitized: valid, changed }
}

export function getRelayHistory(storage?: Storage): RelayBalanceSnapshot[] {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
  if (!target) return []

  try {
    const raw = target.getItem(RELAY_HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const valid = parsed.filter(
      (item): item is RelayBalanceSnapshot =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.timestamp === 'number' &&
        typeof item.totalNormalizedUsd === 'number'
    )
    const { sanitized, changed } = sanitizeRelayHistory(valid)
    if (changed) {
      saveRelayHistory(sanitized, storage)
    }
    return sanitized
  } catch {
    return []
  }
}

export function saveRelayHistory(history: RelayBalanceSnapshot[], storage?: Storage): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
  if (!target) return

  const trimmed = history.slice(-MAX_RELAY_HISTORY_ITEMS)
  try {
    target.setItem(RELAY_HISTORY_STORAGE_KEY, JSON.stringify(trimmed))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('opencode-relay-history-updated', { detail: trimmed }))
    }
  } catch {
    // ignore
  }
}

export function clearRelayHistory(storage?: Storage): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
  if (!target) return

  try {
    target.removeItem(RELAY_HISTORY_STORAGE_KEY)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('opencode-relay-history-updated', { detail: [] }))
    }
  } catch {
    // ignore
  }
}

export function formatDelta(delta: number): string {
  // delta is (newTotal - oldTotal). If negative, money was spent.
  if (Math.abs(delta) < 0.0001) {
    return '-$0.00'
  }
  if (delta < 0) {
    const abs = Math.abs(delta)
    const decimals = abs < 0.01 ? 4 : 2
    return `-$${abs.toFixed(decimals)}`
  }
  return `+$${delta.toFixed(2)}`
}

export function recordRelaySnapshot(
  providers: RelayProvider[],
  trigger: 'manual_click' | 'auto_interval' | 'initial_load' = 'manual_click',
  storage?: Storage
): { snapshot: RelayBalanceSnapshot; delta: number; deltaFormatted: string } {
  let totalUsd = 0
  let totalCny = 0
  const provMap: Record<string, RelaySnapshotProvider> = {}

  for (const p of providers) {
    const bal = typeof p.balance === 'number' && !Number.isNaN(p.balance) ? p.balance : 0
    provMap[p.id] = {
      id: p.id,
      name: p.name || p.id,
      balance: bal,
      currency: p.currency,
      status: p.status,
    }

    if (p.currency === 'USD') {
      totalUsd += bal
    } else {
      totalCny += bal
    }
  }

  const normalizedTotal = Number((totalUsd + totalCny / DEFAULT_CNY_RATE).toFixed(4))
  const history = getRelayHistory(storage)
  const lastSnapshot = history.length > 0 ? history[history.length - 1] : null

  // Delta: new - old (negative means balance dropped / spent)
  let delta = 0
  if (lastSnapshot) {
    delta = Number((normalizedTotal - lastSnapshot.totalNormalizedUsd).toFixed(4))
    if (Math.abs(delta) > MAX_PLAUSIBLE_DELTA_USD) {
      delta = 0
    }
  }

  // Guard against upstream sentinel values corrupting balance tracking
  if (normalizedTotal > MAX_PLAUSIBLE_BALANCE_USD) {
    return {
      snapshot: lastSnapshot ?? {
        id: `snap_${Date.now()}`,
        timestamp: Date.now(),
        totalBalanceUsd: 0,
        totalBalanceCny: 0,
        totalNormalizedUsd: 0,
        delta: 0,
        trigger,
        providers: provMap,
      },
      delta: 0,
      deltaFormatted: '-$0.00',
    }
  }

  const snapshot: RelayBalanceSnapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    totalBalanceUsd: Number(totalUsd.toFixed(2)),
    totalBalanceCny: Number(totalCny.toFixed(2)),
    totalNormalizedUsd: normalizedTotal,
    delta,
    trigger,
    providers: provMap,
  }

  history.push(snapshot)
  saveRelayHistory(history, storage)

  return {
    snapshot,
    delta,
    deltaFormatted: formatDelta(delta),
  }
}

export function computeTotalSpent(history: RelayBalanceSnapshot[]): number {
  let spent = 0
  for (const item of history) {
    if (
      typeof item.delta === 'number' &&
      item.delta < 0 &&
      Math.abs(item.delta) <= MAX_PLAUSIBLE_DELTA_USD
    ) {
      spent += Math.abs(item.delta)
    }
  }
  return Number(spent.toFixed(4))
}

/**
 * Resets the accumulated deduction counter while keeping historical balance trend data intact.
 * Sets all historical deltas to 0 and writes back to storage.
 */
export function resetRelayAccumulatedSpent(storage?: Storage): RelayBalanceSnapshot[] {
  const history = getRelayHistory(storage)
  if (history.length === 0) return []

  const updated = history.map((snap) => ({
    ...snap,
    delta: 0,
  }))

  saveRelayHistory(updated, storage)
  return updated
}

export function filterHistoryByRange(
  history: RelayBalanceSnapshot[],
  range: '1h' | '24h' | '7d' | 'all'
): RelayBalanceSnapshot[] {
  if (range === 'all') return history
  const now = Date.now()
  const cutoff =
    range === '1h'
      ? now - 3600 * 1000
      : range === '24h'
      ? now - 24 * 3600 * 1000
      : now - 7 * 24 * 3600 * 1000

  return history.filter((item) => item.timestamp >= cutoff)
}
