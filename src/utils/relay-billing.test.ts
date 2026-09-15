import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getRelayProviders,
  saveRelayProviders,
  addRelayProvider,
  updateRelayProvider,
  deleteRelayProvider,
  parseQuotaResponse,
  fetchRelayQuota,
  formatBalance,
  aggregateBalances,
  syncRelayPresets,
  RELAY_PROVIDERS_STORAGE_KEY,
  type RelayProvider,
} from './relay-billing'

function createMockStorage(initialData: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initialData))
  return {
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    get length() {
      return store.size
    },
  }
}

describe('Relay Billing Utilities (relay-billing.ts)', () => {
  describe('Storage CRUD', () => {
    it('returns empty array when storage is empty or corrupt', () => {
      const emptyStorage = createMockStorage()
      assert.deepEqual(getRelayProviders(emptyStorage), [])

      const corruptStorage = createMockStorage({ [RELAY_PROVIDERS_STORAGE_KEY]: 'invalid json{' })
      assert.deepEqual(getRelayProviders(corruptStorage), [])

      const nonArrayStorage = createMockStorage({ [RELAY_PROVIDERS_STORAGE_KEY]: '{"foo":"bar"}' })
      assert.deepEqual(getRelayProviders(nonArrayStorage), [])
    })

    it('adds a new provider and assigns default rates', () => {
      const storage = createMockStorage()
      const p = addRelayProvider(
        {
          name: 'TokenShop',
          baseUrl: 'https://api.tokenshop.homes',
          apiKey: 'sk-test123456',
          redeemUrl: 'https://tokenshop.homes/redeem',
          currency: 'CNY',
        },
        storage
      )

      assert.ok(p.id.startsWith('relay_'))
      assert.equal(p.name, 'TokenShop')
      assert.equal(p.currency, 'CNY')
      assert.equal(p.quotaRate, 500_000)
      assert.equal(p.cnyRate, 7.2)

      const stored = getRelayProviders(storage)
      assert.equal(stored.length, 1)
      assert.equal(stored[0].id, p.id)
    })

    it('updates an existing provider', () => {
      const storage = createMockStorage()
      const p = addRelayProvider(
        {
          name: 'Old Station',
          baseUrl: 'https://api.old.com',
          apiKey: 'sk-old',
          currency: 'USD',
        },
        storage
      )

      const updated = updateRelayProvider(p.id, { name: 'New Station', balance: 52.4 }, storage)
      assert.equal(updated.length, 1)
      assert.equal(updated[0].name, 'New Station')
      assert.equal(updated[0].balance, 52.4)
    })

    it('deletes an existing provider', () => {
      const storage = createMockStorage()
      const p1 = addRelayProvider({ name: 'S1', baseUrl: 'https://s1.com', apiKey: 'k1', currency: 'USD' }, storage)
      const p2 = addRelayProvider({ name: 'S2', baseUrl: 'https://s2.com', apiKey: 'k2', currency: 'CNY' }, storage)

      const remaining = deleteRelayProvider(p1.id, storage)
      assert.equal(remaining.length, 1)
      assert.equal(remaining[0].id, p2.id)
    })
  })

  describe('Quota Response Parsing', () => {
    const baseProvider: RelayProvider = {
      id: 'test',
      name: 'Test',
      baseUrl: 'https://api.test.com',
      apiKey: 'key',
      currency: 'USD',
      quotaRate: 500_000,
      cnyRate: 7.2,
    }

    it('parses OpenAI/OneAPI subscription format in USD', () => {
      const res = parseQuotaResponse(
        {
          object: 'billing_subscription',
          hard_limit_usd: 25.5,
          total_usage: 5.5,
        },
        baseProvider
      )
      assert.equal(res.balance, 20.0)
      assert.equal(res.totalQuota, 25.5)
      assert.equal(res.usedQuota, 5.5)
    })

    it('parses OpenAI/OneAPI subscription format in CNY', () => {
      const cnyProvider: RelayProvider = { ...baseProvider, currency: 'CNY' }
      const res = parseQuotaResponse(
        {
          object: 'billing_subscription',
          hard_limit_usd: 10.0,
          total_usage: 0,
        },
        cnyProvider
      )
      // 10.0 USD * 7.2 = 72.0 CNY
      assert.equal(res.balance, 72.0)
    })

    it('parses NewAPI raw quota integer format', () => {
      // 5,000,000 quota / 500,000 = $10.00 USD
      const res = parseQuotaResponse({ quota: 5_000_000 }, baseProvider)
      assert.equal(res.balance, 10.0)
      assert.equal(res.totalQuota, 5_000_000)

      // In CNY: $10 * 7.2 = ¥72.00
      const cnyRes = parseQuotaResponse({ data: { quota: 5_000_000 } }, { ...baseProvider, currency: 'CNY' })
      assert.equal(cnyRes.balance, 72.0)
    })

    it('parses direct balance field', () => {
      const res = parseQuotaResponse({ balance: 88.5 }, baseProvider)
      assert.equal(res.balance, 88.5)

      const nested = parseQuotaResponse({ data: { balance: 99.9 } }, baseProvider)
      assert.equal(nested.balance, 99.9)
    })

    it('handles invalid or empty payload gracefully', () => {
      const res = parseQuotaResponse(null, baseProvider)
      assert.equal(res.balance, 0)

      const empty = parseQuotaResponse({}, baseProvider)
      assert.equal(empty.balance, 0)
    })

    it('parses TokenShop and GGUU /v1/usage balance responses', () => {
      // TokenShop positive balance
      const tsUsage = {
        balance: 11.09801688,
        daily_usage: [{ date: '2026-09-04', requests: 7, total_tokens: 4360, cost: 0.018412 }],
      }
      const res1 = parseQuotaResponse(tsUsage, baseProvider)
      assert.equal(res1.balance, 11.10)
      assert.equal(res1.isUnmetered, false)

      // GGUU negative / overdraft balance
      const gguuUsage = {
        balance: -0.01303133,
        daily_usage: [{ date: '2026-09-07', requests: 93, cost: 1.16866 }],
      }
      const res2 = parseQuotaResponse(gguuUsage, baseProvider)
      assert.equal(res2.balance, -0.01)
      assert.equal(res2.isUnmetered, false)
    })

    it('parses model catalog probe response as connected $0.00 station', () => {
      const modelsData = {
        object: 'list',
        data: [{ id: 'grok-4.5', object: 'model' }, { id: 'grok-4.6', object: 'model' }],
      }
      const res = parseQuotaResponse(modelsData, baseProvider)
      assert.equal(res.balance, 0)
      assert.equal(res.isUnmetered, false)
      assert.equal(res.note, '已连接 ($0.00)')
    })
  })

  describe('fetchRelayQuota Mock Tests', () => {
    it('returns error when base URL is empty', async () => {
      const res = await fetchRelayQuota({
        id: 'p1',
        name: 'Empty',
        baseUrl: '   ',
        apiKey: 'sk',
        currency: 'CNY',
      })
      assert.equal(res.ok, false)
      assert.equal(res.error, 'Base URL is empty')
    })

    it('fetches quota successfully with mock fetch', async () => {
      const mockFetch = (async (url: string | URL | Request) => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            hard_limit_usd: 15.0,
            total_usage: 0,
          }),
        } as unknown as Response
      }) as typeof fetch

      const res = await fetchRelayQuota(
        {
          id: 'p1',
          name: 'Mock',
          baseUrl: 'https://relay.example.com',
          apiKey: 'sk-secret',
          currency: 'USD',
        },
        mockFetch
      )

      assert.equal(res.ok, true)
      assert.equal(res.balance, 15.0)
      assert.equal(res.currency, 'USD')
    })

    it('handles HTTP error failure gracefully', async () => {
      const mockFetch = (async () => {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        } as unknown as Response
      }) as typeof fetch

      const res = await fetchRelayQuota(
        {
          id: 'p1',
          name: 'Mock Fail',
          baseUrl: 'https://relay.example.com',
          apiKey: 'bad-key',
          currency: 'CNY',
        },
        mockFetch
      )

      assert.equal(res.ok, false)
      assert.ok(res.error?.includes('401'))
    })
  })

  describe('Formatting & Aggregation', () => {
    it('formats USD and CNY balances', () => {
      assert.equal(formatBalance(12.345, 'USD'), '$12.35')
      assert.equal(formatBalance(86.5, 'CNY'), '¥86.50')
      assert.equal(formatBalance(undefined, 'CNY'), '--')
      assert.equal(formatBalance(NaN, 'USD'), '--')
    })

    it('aggregates balances across providers', () => {
      // Empty list
      const empty = aggregateBalances([])
      assert.equal(empty.hasProviders, false)
      assert.equal(empty.totalFormatted, 'Relay Hub')

      // Single CNY
      const cnyOnly = aggregateBalances([
        { id: '1', name: 'TS', baseUrl: 'b', apiKey: 'k', currency: 'CNY', balance: 86.5 },
      ])
      assert.equal(cnyOnly.hasProviders, true)
      assert.equal(cnyOnly.totalFormatted, '¥86.50')

      // Mixed CNY and USD
      const mixed = aggregateBalances([
        { id: '1', name: 'TS', baseUrl: 'b', apiKey: 'k', currency: 'CNY', balance: 86.5 },
        { id: '2', name: 'OA', baseUrl: 'b', apiKey: 'k', currency: 'USD', balance: 12.3 },
      ])
      assert.equal(mixed.hasProviders, true)
      assert.equal(mixed.cny, 86.5)
      assert.equal(mixed.usd, 12.3)
      assert.equal(mixed.totalFormatted, '¥86.5 + $12.3')

      // Error / loading status propagation
      const statusCheck = aggregateBalances([
        { id: '1', name: 'TS', baseUrl: 'b', apiKey: 'k', currency: 'CNY', status: 'error' },
        { id: '2', name: 'OA', baseUrl: 'b', apiKey: 'k', currency: 'USD', status: 'loading' },
      ])
      assert.equal(statusCheck.hasError, true)
      assert.equal(statusCheck.isLoading, true)
    })
  })

  describe('syncRelayPresets', () => {
    it('populates empty storage with preset stations and purges NovAI', async () => {
      // Storage has stale NovAI entry
      const storage = createMockStorage({
        [RELAY_PROVIDERS_STORAGE_KEY]: JSON.stringify([
          {
            id: 'relay_novai',
            name: 'NovAI (Once)',
            baseUrl: 'https://once-cf.novai.su',
            apiKey: 'sk-old-nova',
            currency: 'USD',
          },
        ]),
      })
      const mockFetch = (async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            presets: [
              {
                id: 'relay_tokenshop',
                name: 'TokenShop (Grok)',
                baseUrl: 'https://tokenshop.homes',
                apiKey: 'sk-token',
                redeemUrl: 'https://tokenshop.homes/redeem',
                currency: 'USD',
              },
              {
                id: 'relay_gguu',
                name: 'GGUU (Flash 3.8)',
                baseUrl: 'https://gguuai.com',
                apiKey: 'sk-gguu',
                redeemUrl: 'https://gguuai.com/redeem',
                currency: 'USD',
              },
            ],
          }),
        } as unknown as Response
      }) as typeof fetch

      const res = await syncRelayPresets(storage, mockFetch)
      // Stale NovAI must be purged! Only TokenShop and GGUU remain
      assert.equal(res.length, 2)
      assert.equal(res[0].id, 'relay_tokenshop')
      assert.equal(res[1].id, 'relay_gguu')
      assert.equal(res.some((p) => p.baseUrl.includes('novai')), false)
      assert.equal(getRelayProviders(storage).length, 2)
    })

    it('merges presets into existing storage without duplicating', async () => {
      const storage = createMockStorage()
      addRelayProvider(
        {
          name: 'TokenShop',
          baseUrl: 'https://tokenshop.homes',
          apiKey: '',
          currency: 'USD',
        },
        storage
      )

      const mockFetch = (async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            presets: [
              {
                id: 'relay_tokenshop',
                name: 'TokenShop (Grok)',
                baseUrl: 'https://tokenshop.homes',
                apiKey: 'sk-updated',
                redeemUrl: 'https://tokenshop.homes/redeem',
                currency: 'USD',
              },
              {
                id: 'relay_gguu',
                name: 'GGUU (Flash 3.8)',
                baseUrl: 'https://gguuai.com',
                apiKey: 'sk-gguu',
                currency: 'USD',
              },
            ],
          }),
        } as unknown as Response
      }) as typeof fetch

      const res = await syncRelayPresets(storage, mockFetch)
      assert.equal(res.length, 2)
      // Existing TokenShop had empty key, updated with preset key and name
      const ts = res.find((p) => p.baseUrl.includes('tokenshop.homes'))
      assert.equal(ts?.apiKey, 'sk-updated')
      assert.equal(ts?.name, 'TokenShop (Grok)')
      assert.equal(ts?.redeemUrl, 'https://tokenshop.homes/redeem')
    })
  })
})
