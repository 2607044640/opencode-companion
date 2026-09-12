import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateNextBackoff,
  determineDaemonState,
  getDaemonStateTooltip,
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

  describe('Tooltip Text Generation', () => {
    it('generates accurate Chinese tooltips for all states', () => {
      const connectedTip = getDaemonStateTooltip('connected', 0, true)
      assert.ok(connectedTip.includes('已连接'))
      assert.ok(connectedTip.includes('127.0.0.1:5001'))

      const reconnectingTip = getDaemonStateTooltip('reconnecting', 2, true)
      assert.ok(reconnectingTip.includes('重连中'))
      assert.ok(reconnectingTip.includes('第 2 次'))

      const offlineTip = getDaemonStateTooltip('offline', 5, true)
      assert.ok(offlineTip.includes('离线'))
    })

    it('generates accurate English tooltips for all states', () => {
      const connectedTip = getDaemonStateTooltip('connected', 0, false)
      assert.ok(connectedTip.includes('Connected'))

      const reconnectingTip = getDaemonStateTooltip('reconnecting', 1, false)
      assert.ok(reconnectingTip.includes('Reconnecting'))

      const offlineTip = getDaemonStateTooltip('offline', 5, false)
      assert.ok(offlineTip.includes('Offline'))
    })
  })
})
