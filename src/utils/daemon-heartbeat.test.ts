import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateNextBackoff,
  determineDaemonState,
  getDaemonStateTooltip,
  reduceDaemonProbe,
  OFFLINE_AFTER_MS,
  BASE_RETRY_DELAY,
  MAX_RETRY_DELAY,
} from './daemon-heartbeat'

describe('Daemon Live Status & Heartbeat Utilities (daemon-heartbeat.ts)', () => {
  describe('Exponential Backoff Calculation', () => {
    it('returns BASE_RETRY_DELAY for attempt 0 and 1', () => {
      assert.equal(calculateNextBackoff(0), BASE_RETRY_DELAY)
      assert.equal(calculateNextBackoff(1), BASE_RETRY_DELAY)
    })

    it('doubles delay on consecutive attempts', () => {
      assert.equal(calculateNextBackoff(2), 4000)
      assert.equal(calculateNextBackoff(3), 8000)
    })

    it('caps delay at MAX_RETRY_DELAY', () => {
      assert.equal(calculateNextBackoff(4), MAX_RETRY_DELAY)
      assert.equal(calculateNextBackoff(5), MAX_RETRY_DELAY)
      assert.equal(calculateNextBackoff(10), MAX_RETRY_DELAY)
    })

    it('honors custom base and max delay parameters', () => {
      assert.equal(calculateNextBackoff(1, 1000, 5000), 1000)
      assert.equal(calculateNextBackoff(2, 1000, 5000), 2000)
      assert.equal(calculateNextBackoff(3, 1000, 5000), 4000)
      assert.equal(calculateNextBackoff(4, 1000, 5000), 5000)
    })
  })

  describe('Daemon Connection State Transitions', () => {
    it('returns connected when health check succeeds', () => {
      assert.equal(determineDaemonState(true, 0), 'connected')
      assert.equal(determineDaemonState(true, 5), 'connected')
    })

    it('returns reconnecting when failure attempt is within threshold', () => {
      assert.equal(determineDaemonState(false, 1, 3), 'reconnecting')
      assert.equal(determineDaemonState(false, 2, 3), 'reconnecting')
      assert.equal(determineDaemonState(false, 3, 3), 'reconnecting')
    })

    it('returns offline when failure attempts exceed threshold', () => {
      assert.equal(determineDaemonState(false, 4, 3), 'offline')
      assert.equal(determineDaemonState(false, 10, 3), 'offline')
    })
  })

  describe('Deep-link URL Generation', () => {
    it('ensures sessionUrl uses raw loopback daemon origin and never opencode-proxy', async () => {
      const { sessionUrl } = await import('../components/map/opencode/deep-link')
      const url = sessionUrl('ses_test_123')
      assert.ok(url.startsWith('http://127.0.0.1:5001/server/'))
      assert.ok(!url.includes('/opencode-proxy'))
    })
  })

  describe('reduceDaemonProbe Pure State Reducer', () => {
    it('stays reconnecting without notifyLost on initial failure before ever connecting', () => {
      const res = reduceDaemonProbe({
        prev: 'reconnecting',
        everConnected: false,
        consecutiveFailures: 0,
        unhealthySince: null,
        healthy: false,
        now: 1000,
      })
      assert.equal(res.state, 'reconnecting')
      assert.equal(res.consecutiveFailures, 1)
      assert.equal(res.unhealthySince, 1000)
      assert.equal(res.notifyLost, false)
      assert.equal(res.notifyRestored, false)
    })

    it('sets notifyLost=true on first departure from connected state', () => {
      const res = reduceDaemonProbe({
        prev: 'connected',
        everConnected: true,
        consecutiveFailures: 0,
        unhealthySince: null,
        healthy: false,
        now: 5000,
      })
      assert.equal(res.state, 'reconnecting')
      assert.equal(res.consecutiveFailures, 1)
      assert.equal(res.unhealthySince, 5000)
      assert.equal(res.notifyLost, true)
      assert.equal(res.notifyRestored, false)
    })

    it('keeps state reconnecting within 30s of unhealthy duration', () => {
      const res = reduceDaemonProbe({
        prev: 'reconnecting',
        everConnected: true,
        consecutiveFailures: 5,
        unhealthySince: 5000,
        healthy: false,
        now: 5000 + 29_999,
      })
      assert.equal(res.state, 'reconnecting')
      assert.equal(res.consecutiveFailures, 6)
      assert.equal(res.unhealthySince, 5000)
      assert.equal(res.notifyLost, false)
      assert.equal(res.notifyRestored, false)
    })

    it('transitions to offline only after OFFLINE_AFTER_MS (30s) continuous failure', () => {
      const res = reduceDaemonProbe({
        prev: 'reconnecting',
        everConnected: true,
        consecutiveFailures: 6,
        unhealthySince: 5000,
        healthy: false,
        now: 5000 + OFFLINE_AFTER_MS,
      })
      assert.equal(res.state, 'offline')
      assert.equal(res.consecutiveFailures, 7)
      assert.equal(res.notifyLost, false)
      assert.equal(res.notifyRestored, false)
    })

    it('restores connected state, resets failures, and triggers notifyRestored on healthy probe', () => {
      const res = reduceDaemonProbe({
        prev: 'reconnecting',
        everConnected: true,
        consecutiveFailures: 7,
        unhealthySince: 5000,
        healthy: true,
        now: 45_000,
      })
      assert.equal(res.state, 'connected')
      assert.equal(res.consecutiveFailures, 0)
      assert.equal(res.unhealthySince, null)
      assert.equal(res.notifyRestored, true)
      assert.equal(res.notifyLost, false)
    })

    it('does not trigger notifyRestored if previous state was already connected', () => {
      const res = reduceDaemonProbe({
        prev: 'connected',
        everConnected: true,
        consecutiveFailures: 0,
        unhealthySince: null,
        healthy: true,
        now: 50_000,
      })
      assert.equal(res.state, 'connected')
      assert.equal(res.notifyRestored, false)
    })
  })
})
