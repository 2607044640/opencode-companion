import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatTimeAgo,
  formatAbsoluteUserTime,
  formatUserMessageTime,
  normalizeTimestampMs,
} from './time'

describe('time utility module', () => {
  const baseNow = 1700000000000 // Fixed reference timestamp

  it('normalizes timestamps in milliseconds, seconds, string or Date correctly', () => {
    assert.equal(normalizeTimestampMs(undefined), null)
    assert.equal(normalizeTimestampMs(null), null)
    assert.equal(normalizeTimestampMs(-5), null)
    assert.equal(normalizeTimestampMs(1700000000000), 1700000000000)
    // 10-digit unix seconds
    assert.equal(normalizeTimestampMs(1700000000), 1700000000000)
    assert.equal(normalizeTimestampMs(new Date(1700000000000)), 1700000000000)
    assert.equal(normalizeTimestampMs('1700000000000'), 1700000000000)
  })

  it('formats seconds difference correctly as xs ago', () => {
    // 0s ago
    assert.equal(formatTimeAgo(baseNow, baseNow), '0s ago')
    // 5s ago
    assert.equal(formatTimeAgo(baseNow - 5 * 1000, baseNow), '5s ago')
    // 59s ago
    assert.equal(formatTimeAgo(baseNow - 59 * 1000, baseNow), '59s ago')
  })

  it('formats minutes difference correctly as xm ago', () => {
    // 1m ago
    assert.equal(formatTimeAgo(baseNow - 60 * 1000, baseNow), '1m ago')
    // 23m ago
    assert.equal(formatTimeAgo(baseNow - 23 * 60 * 1000, baseNow), '23m ago')
    // 59m ago
    assert.equal(formatTimeAgo(baseNow - 59 * 60 * 1000, baseNow), '59m ago')
  })

  it('formats hours difference under 48 hours as xh ago', () => {
    // 1h ago
    assert.equal(formatTimeAgo(baseNow - 3600 * 1000, baseNow), '1h ago')
    // 24h ago
    assert.equal(formatTimeAgo(baseNow - 24 * 3600 * 1000, baseNow), '24h ago')
    // 47h ago
    assert.equal(formatTimeAgo(baseNow - 47 * 3600 * 1000, baseNow), '47h ago')
  })

  it('formats difference exceeding 48 hours as days (e.g. 2 days ago, 3 days ago)', () => {
    // Exactly 48 hours: 2 days ago
    assert.equal(formatTimeAgo(baseNow - 48 * 3600 * 1000, baseNow), '2 days ago')
    // 72 hours: 3 days ago
    assert.equal(formatTimeAgo(baseNow - 72 * 3600 * 1000, baseNow), '3 days ago')
    // 10 days ago
    assert.equal(formatTimeAgo(baseNow - 10 * 24 * 3600 * 1000, baseNow), '10 days ago')

    // With daysFormat: 'd'
    assert.equal(formatTimeAgo(baseNow - 72 * 3600 * 1000, baseNow, { daysFormat: 'd' }), '3d ago')
  })

  it('supports localized Chinese relative time', () => {
    assert.equal(formatTimeAgo(baseNow, baseNow, { isZh: true }), '刚刚')
    assert.equal(formatTimeAgo(baseNow - 15 * 1000, baseNow, { isZh: true }), '15秒前')
    assert.equal(formatTimeAgo(baseNow - 5 * 60 * 1000, baseNow, { isZh: true }), '5分钟前')
    assert.equal(formatTimeAgo(baseNow - 3 * 3600 * 1000, baseNow, { isZh: true }), '3小时前')
    assert.equal(formatTimeAgo(baseNow - 3 * 24 * 3600 * 1000, baseNow, { isZh: true }), '3天前')
  })

  it('formats absolute user time and formatUserMessageTime correctly', () => {
    // Date: 2023-11-14 22:13:20 UTC -> local formatting
    const d = new Date(baseNow)
    const formatted = formatAbsoluteUserTime(d)
    assert.match(formatted, /^\d{2}\.\d{2}\.\d{2}\s\d{2}:\d{2}$/)

    // User message bubble legacy time
    assert.equal(formatUserMessageTime(baseNow - 10 * 1000, baseNow), 'just now')
    assert.equal(formatUserMessageTime(baseNow - 5 * 60 * 1000, baseNow), '5m ago')
    assert.equal(formatUserMessageTime(baseNow - 2 * 3600 * 1000, baseNow), '2h ago')
    assert.equal(formatUserMessageTime(baseNow - 50 * 3600 * 1000, baseNow), formatAbsoluteUserTime(baseNow - 50 * 3600 * 1000))
  })
})
