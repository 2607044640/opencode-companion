import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveCanonicalModelId,
  getTokenLimit,
  getTokenThreshold,
  formatTokenLimit,
  getTokenColorClasses,
  calculateOpenCodeContextUsage,
  DEFAULT_MODEL_PROFILES,
} from './token-limit'

describe('Token Limit & Model Profile Resolution', () => {
  test('resolveCanonicalModelId maps aliases, provider prefixes, and variations to canonical keys', () => {
    assert.equal(resolveCanonicalModelId('obsidian/grok-4.7'), 'grok-4.7')
    assert.equal(resolveCanonicalModelId('grok-4-7'), 'grok-4.7')
    assert.equal(resolveCanonicalModelId('grok4.7'), 'grok-4.7')
    assert.equal(resolveCanonicalModelId('newapi/grok-4.7'), 'grok-4.7')
    assert.equal(resolveCanonicalModelId('obsidian/grok-4.6'), 'grok-4.6')
    assert.equal(resolveCanonicalModelId('claude-3.5-sonnet'), 'claude-3.5-sonnet')
    assert.equal(resolveCanonicalModelId('claude-3-5-sonnet'), 'claude-3.5-sonnet')
    assert.equal(resolveCanonicalModelId('obsidian/gemini-3.7-flash'), 'gemini-3.7-flash')
    assert.equal(resolveCanonicalModelId(null), 'unknown')
    assert.equal(resolveCanonicalModelId(''), 'unknown')
  })

  test('getTokenLimit retrieves effective context ceiling (Grok 4.7 strictly 500k)', () => {
    // Grok 4.7 physical/effective ceiling is 500k (500000)
    assert.equal(getTokenLimit('grok-4.7'), 500000)
    assert.equal(getTokenLimit('obsidian/grok-4.7'), 500000)
    assert.equal(getTokenLimit('grok-4-7'), 500000)
    assert.equal(getTokenLimit('newapi/grok-4.7'), 500000)

    // Grok 4.6
    assert.equal(getTokenLimit('grok-4.6'), 500000)

    // Claude 3.5 Sonnet is 200k
    assert.equal(getTokenLimit('claude-3.5-sonnet'), 200000)

    // Gemini 3.7 Flash is 800k
    assert.equal(getTokenLimit('gemini-3.7-flash'), 800000)
  })

  test('getTokenThreshold enforces strict color rules: >=80% Red, >=50% Yellow, other Green', () => {
    // Green (< 50%)
    assert.equal(getTokenThreshold(0), 'green')
    assert.equal(getTokenThreshold(10), 'green')
    assert.equal(getTokenThreshold(29.98), 'green')
    assert.equal(getTokenThreshold(49.99), 'green')

    // Yellow (>= 50% and < 80%)
    assert.equal(getTokenThreshold(50), 'yellow')
    assert.equal(getTokenThreshold(50.01), 'yellow')
    assert.equal(getTokenThreshold(75), 'yellow')
    assert.equal(getTokenThreshold(79.99), 'yellow')

    // Red (>= 80%)
    assert.equal(getTokenThreshold(80), 'red')
    assert.equal(getTokenThreshold(80.01), 'red')
    assert.equal(getTokenThreshold(95), 'red')
    assert.equal(getTokenThreshold(100), 'red')
    assert.equal(getTokenThreshold(120), 'red')
  })

  test('formatTokenLimit formats token ceilings cleanly without noisy decimals', () => {
    assert.equal(formatTokenLimit(500000), '500k')
    assert.equal(formatTokenLimit(1000000), '1M')
    assert.equal(formatTokenLimit(200000), '200k')
    assert.equal(formatTokenLimit(800000), '800k')
    assert.equal(formatTokenLimit(1048576), '1.0M')
    assert.equal(formatTokenLimit(0), '500k')
    assert.equal(formatTokenLimit(undefined), '500k')
  })

  test('getTokenColorClasses returns appropriate styles for each threshold', () => {
    const green = getTokenColorClasses('green')
    assert.equal(green.stroke, '#22c55e')
    assert.match(green.text, /text-emerald/)

    const yellow = getTokenColorClasses('yellow')
    assert.equal(yellow.stroke, '#eab308')
    assert.match(yellow.text, /text-amber/)

    const red = getTokenColorClasses('red')
    assert.equal(red.stroke, '#ef4444')
    assert.match(red.text, /text-rose/)
  })

  test('calculateOpenCodeContextUsage uses the largest prompt in the latest user turn, not the lifetime sum', () => {
    const messages = [
      { info: { id: 'msg-1', role: 'user' } },
      {
        info: {
          id: 'msg-2',
          role: 'assistant',
          tokens: { input: 10000, output: 2000, reasoning: 500, cache: { read: 30000, write: 200 } },
        },
      },
      { info: { id: 'msg-3', role: 'user' } },
      {
        info: {
          id: 'msg-4',
          role: 'assistant',
          tokens: { input: 12000, output: 100, reasoning: 0, cache: { read: 4000, write: 0 } },
        },
      },
      {
        info: {
          id: 'msg-5',
          role: 'assistant',
          tokens: { input: 18000, output: 200, reasoning: 50, cache: { read: 6000, write: 0 } },
        },
      },
    ]

    const usage = calculateOpenCodeContextUsage(messages, 500000)
    // Desktop figure is the last assistant with tokens > 0, all five dimensions.
    // msg-5: 18000 + 200 + 50 + 6000 = 24250. msg-2 must not be summed in.
    assert.equal(usage.total, 24250)
    assert.equal(usage.input, 18000)
    assert.equal(usage.output, 200)
    assert.equal(usage.reasoning, 50)
    assert.equal(usage.cacheRead, 6000)
    assert.equal(usage.messageId, 'msg-5')
    assert.equal(usage.usagePercent, 5)
  })

  test('calculateOpenCodeContextUsage skips 0-token aborted assistant messages (matching OpenCode nY > 0)', () => {
    const messages = [
      {
        info: {
          id: 'msg-16',
          role: 'assistant',
          tokens: {
            input: 10000,
            output: 2000,
            reasoning: 500,
            cache: {
              read: 30000,
              write: 200,
            },
          },
        },
      },
      {
        info: {
          id: 'msg-17',
          role: 'assistant',
          // Aborted/error turn with 0 tokens
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
      },
    ]

    const usage = calculateOpenCodeContextUsage(messages, 500000)
    // 10000 + 2000 + 500 + 30000 + 200. The trailing 0-token reply is skipped.
    assert.equal(usage.total, 42700)
    assert.equal(usage.messageId, 'msg-16')
  })

  test('calculateOpenCodeContextUsage handles message revert boundary by dropping back to prior turn tokens', () => {
    const messages = [
      {
        info: { id: 'msg-1', role: 'user' },
      },
      {
        info: {
          id: 'msg-2',
          role: 'assistant',
          tokens: { input: 15000, output: 1000, reasoning: 0, cache: { read: 5000, write: 0 } },
        },
      },
      {
        info: { id: 'msg-3', role: 'user' },
      },
      {
        info: {
          id: 'msg-4',
          role: 'assistant',
          tokens: { input: 50000, output: 5000, reasoning: 1000, cache: { read: 20000, write: 0 } },
        },
      },
    ]

    // Without revert, last assistant msg-4: 50000 + 5000 + 1000 + 20000
    const usageBefore = calculateOpenCodeContextUsage(messages, 500000)
    assert.equal(usageBefore.total, 76000)
    assert.equal(usageBefore.messageId, 'msg-4')

    // Revert boundary at msg-3 drops that reply. Previous reply: 15000 + 1000 + 5000
    const usageAfterRevert = calculateOpenCodeContextUsage(messages, 500000, 'msg-3')
    assert.equal(usageAfterRevert.total, 21000)
    assert.equal(usageAfterRevert.messageId, 'msg-2')
  })

  test('calculateOpenCodeContextUsage falls back to step-finish tokens if info.tokens is missing', () => {
    const messages = [
      {
        info: {
          id: 'msg-step',
          role: 'assistant',
        },
        parts: [
          {
            type: 'step-finish',
            tokens: {
              input: 8000,
              output: 1500,
              reasoning: 0,
              cache: { read: 2000, write: 0 },
            },
          },
        ],
      },
    ]

    const usage = calculateOpenCodeContextUsage(messages, 500000)
    // 8000 + 1500 + 2000
    assert.equal(usage.total, 11500)
    assert.equal(usage.messageId, 'msg-step')
  })

  test('info.tokens wins over step-finish and includes output plus reasoning', () => {
    const messages = [
      {
        info: {
          id: 'a',
          role: 'assistant',
          tokens: { input: 14811, output: 387, reasoning: 0, cache: { read: 104704, write: 0 } },
        },
        parts: [
          { type: 'step-finish', tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } } },
        ],
      },
    ]
    const usage = calculateOpenCodeContextUsage(messages, 500000)
    assert.equal(usage.total, 119902)
    assert.equal(usage.output, 387)
  })
})
