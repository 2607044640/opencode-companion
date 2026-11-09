import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getRelayHistory,
  saveRelayHistory,
  clearRelayHistory,
  recordRelaySnapshot,
  formatDelta,
  computeTotalSpent,
  resetRelayAccumulatedSpent,
  sanitizeRelayHistory,
  filterHistoryByRange,
  MAX_RELAY_HISTORY_ITEMS,
  type RelayBalanceSnapshot,
} from './relay-history'
import type { RelayProvider } from './relay-billing'

class MockStorage {
  private store: Record<string, string> = {}
  getItem(k: string): string | null {
    return this.store[k] ?? null
  }
  setItem(k: string, v: string): void {
    this.store[k] = v
  }
  removeItem(k: string): void {
    delete this.store[k]
  }
  clear(): void {
    this.store = {}
  }
}

describe('relay-history utility', () => {
  let mockStorage: MockStorage

  beforeEach(() => {
    mockStorage = new MockStorage()
  })

  it('records initial snapshot with zero delta and formats delta as -$0.00', () => {
    const providers: RelayProvider[] = [
      { id: 'p1', name: 'RelayA', baseUrl: 'https://a.com', apiKey: 'sk-1', currency: 'USD', balance: 10.5 },
      { id: 'p2', name: 'RelayB', baseUrl: 'https://b.com', apiKey: 'sk-2', currency: 'USD', balance: 5.0 },
    ]

    const res = recordRelaySnapshot(providers, 'initial_load', mockStorage as any)
    assert.equal(res.delta, 0)
    assert.equal(res.deltaFormatted, '-$0.00')
    assert.equal(res.snapshot.totalBalanceUsd, 15.5)

    const history = getRelayHistory(mockStorage as any)
    assert.equal(history.length, 1)
    assert.equal(history[0].totalNormalizedUsd, 15.5)
  })

  it('calculates negative delta when balance decreases (cost spent)', () => {
    const p1: RelayProvider[] = [
      { id: 'p1', name: 'RelayA', baseUrl: 'https://a.com', apiKey: 'sk-1', currency: 'USD', balance: 10.5 },
    ]
    recordRelaySnapshot(p1, 'manual_click', mockStorage as any)

    // Balance decreased by $0.04
    const p2: RelayProvider[] = [
      { id: 'p1', name: 'RelayA', baseUrl: 'https://a.com', apiKey: 'sk-1', currency: 'USD', balance: 10.46 },
    ]
    const res2 = recordRelaySnapshot(p2, 'manual_click', mockStorage as any)

    assert.equal(res2.delta, -0.04)
    assert.equal(res2.deltaFormatted, '-$0.04')

    const history = getRelayHistory(mockStorage as any)
    assert.equal(history.length, 2)
    assert.equal(computeTotalSpent(history), 0.04)
  })

  it('formats positive delta when balance increases (recharge)', () => {
    assert.equal(formatDelta(5.0), '+$5.00')
    assert.equal(formatDelta(-0.02), '-$0.02')
    assert.equal(formatDelta(-0.0012), '-$0.0012')
    assert.equal(formatDelta(0), '-$0.00')
  })

  it('trims history beyond MAX_RELAY_HISTORY_ITEMS', () => {
    const list: RelayBalanceSnapshot[] = []
    for (let i = 0; i < MAX_RELAY_HISTORY_ITEMS + 50; i++) {
      list.push({
        id: `s_${i}`,
        timestamp: 1000 + i,
        totalBalanceUsd: 10,
        totalBalanceCny: 0,
        totalNormalizedUsd: 10,
        delta: 0,
        trigger: 'manual_click',
        providers: {},
      })
    }
    saveRelayHistory(list, mockStorage as any)

    const loaded = getRelayHistory(mockStorage as any)
    assert.equal(loaded.length, MAX_RELAY_HISTORY_ITEMS)
    assert.equal(loaded[loaded.length - 1].id, `s_${MAX_RELAY_HISTORY_ITEMS + 49}`)
  })

  it('filters snapshots by range', () => {
    const now = Date.now()
    const history: RelayBalanceSnapshot[] = [
      {
        id: 'old',
        timestamp: now - 30 * 24 * 3600 * 1000,
        totalBalanceUsd: 10,
        totalBalanceCny: 0,
        totalNormalizedUsd: 10,
        delta: 0,
        trigger: 'auto_interval',
        providers: {},
      },
      {
        id: 'recent',
        timestamp: now - 5 * 60 * 1000,
        totalBalanceUsd: 9.8,
        totalBalanceCny: 0,
        totalNormalizedUsd: 9.8,
        delta: -0.2,
        trigger: 'manual_click',
        providers: {},
      },
    ]

    const filtered24h = filterHistoryByRange(history, '24h')
    assert.equal(filtered24h.length, 1)
    assert.equal(filtered24h[0].id, 'recent')

    const filteredAll = filterHistoryByRange(history, 'all')
    assert.equal(filteredAll.length, 2)
  })

  it('clears history completely', () => {
    saveRelayHistory(
      [
        {
          id: 's_1',
          timestamp: 1000,
          totalBalanceUsd: 10,
          totalBalanceCny: 0,
          totalNormalizedUsd: 10,
          delta: 0,
          trigger: 'manual_click',
          providers: {},
        },
      ],
      mockStorage as any
    )
    assert.equal(getRelayHistory(mockStorage as any).length, 1)
    clearRelayHistory(mockStorage as any)
    assert.equal(getRelayHistory(mockStorage as any).length, 0)
  })

  it('sanitizes abnormal balance spikes and recalculates deltas without 100M cliff', () => {
    // Simulates the exact bug from the user screenshot:
    // Snapshot 1: normal balance $16.98
    // Snapshot 2: upstream glitch returns 100 million
    // Snapshot 3: fixed balance $16.77
    const dirtyHistory: RelayBalanceSnapshot[] = [
      {
        id: 's_normal_1',
        timestamp: 1000,
        totalBalanceUsd: 16.98,
        totalBalanceCny: 0,
        totalNormalizedUsd: 16.98,
        delta: 0,
        trigger: 'manual_click',
        providers: {
          p1: { id: 'p1', name: 'RelayA', balance: 16.98, currency: 'USD' },
        },
      },
      {
        id: 's_glitch',
        timestamp: 2000,
        totalBalanceUsd: 100000000,
        totalBalanceCny: 0,
        totalNormalizedUsd: 100000000,
        delta: 99999983.02,
        trigger: 'manual_click',
        providers: {
          p1: { id: 'p1', name: 'RelayA', balance: 100000000, currency: 'USD' },
        },
      },
      {
        id: 's_normal_2',
        timestamp: 3000,
        totalBalanceUsd: 16.77,
        totalBalanceCny: 0,
        totalNormalizedUsd: 16.77,
        delta: -99999983.23, // The fake $100M cliff deduction!
        trigger: 'manual_click',
        providers: {
          p1: { id: 'p1', name: 'RelayA', balance: 16.77, currency: 'USD' },
        },
      },
    ]

    const { sanitized, changed } = sanitizeRelayHistory(dirtyHistory)
    assert.equal(changed, true)
    // s_glitch should be completely eliminated
    assert.equal(sanitized.length, 2)
    assert.equal(sanitized[0].id, 's_normal_1')
    assert.equal(sanitized[1].id, 's_normal_2')
    // Delta between 16.98 and 16.77 should be cleanly recalculated to -0.21!
    assert.equal(sanitized[1].delta, -0.21)

    // Total spent should be exactly $0.21, never 100 million!
    const spent = computeTotalSpent(sanitized)
    assert.equal(spent, 0.21)
  })

  it('getRelayHistory automatically heals and persists corrupted localStorage data', () => {
    // Put corrupted 100M data directly in storage
    const corrupted = [
      {
        id: 'bad',
        timestamp: 1000,
        totalBalanceUsd: 100000000,
        totalBalanceCny: 0,
        totalNormalizedUsd: 100000000,
        delta: 0,
        trigger: 'manual_click',
        providers: {},
      },
      {
        id: 'good',
        timestamp: 2000,
        totalBalanceUsd: 15.5,
        totalBalanceCny: 0,
        totalNormalizedUsd: 15.5,
        delta: -99999984.5,
        trigger: 'manual_click',
        providers: {},
      },
    ]
    mockStorage.setItem('opencode_relay_balance_history', JSON.stringify(corrupted))

    // Reading history should automatically heal it
    const healed = getRelayHistory(mockStorage as any)
    assert.equal(healed.length, 1)
    assert.equal(healed[0].id, 'good')
    assert.equal(healed[0].delta, 0)
    assert.equal(computeTotalSpent(healed), 0)

    // Storage should now contain the healed version
    const persisted = JSON.parse(mockStorage.getItem('opencode_relay_balance_history') || '[]')
    assert.equal(persisted.length, 1)
    assert.equal(persisted[0].id, 'good')
  })

  it('resetRelayAccumulatedSpent zeroes out deltas while preserving balance points', () => {
    const list: RelayBalanceSnapshot[] = [
      {
        id: 's_1',
        timestamp: 1000,
        totalBalanceUsd: 20,
        totalBalanceCny: 0,
        totalNormalizedUsd: 20,
        delta: 0,
        trigger: 'manual_click',
        providers: {},
      },
      {
        id: 's_2',
        timestamp: 2000,
        totalBalanceUsd: 15,
        totalBalanceCny: 0,
        totalNormalizedUsd: 15,
        delta: -5,
        trigger: 'manual_click',
        providers: {},
      },
    ]
    saveRelayHistory(list, mockStorage as any)

    assert.equal(computeTotalSpent(getRelayHistory(mockStorage as any)), 5)

    const resetResult = resetRelayAccumulatedSpent(mockStorage as any)
    assert.equal(resetResult.length, 2)
    assert.equal(resetResult[0].delta, 0)
    assert.equal(resetResult[1].delta, 0)
    assert.equal(resetResult[1].totalNormalizedUsd, 15) // Balance curve preserved

    // Now total spent is 0
    assert.equal(computeTotalSpent(getRelayHistory(mockStorage as any)), 0)
  })
})
