import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCompositeChain,
  chainForSelection,
  createDefaultSettings,
  getModelRemainingSeconds,
  isModelCooling,
  parseSSOT,
  recordFailure,
  resetAllCircuitBreakers,
  serializeSSOT,
  COOLDOWN_503_MS,
  type RoutingSettings,
} from './model-router'
import { DEFAULT_SHORTCUTS, matchesShortcut } from './shortcuts'

function settings(partial: Partial<RoutingSettings> = {}): RoutingSettings {
  return { ...createDefaultSettings(), ...partial }
}

describe('model router composite chain', () => {
  it('unions enabled groups and enabled standalone models, dedupes by id, keeps the highest priority, and sorts descending', () => {
    const now = 1_700_000_000_000
    const cfg = settings({
      activeGroupIds: ['paid', 'spare'],
      groups: [
        {
          id: 'paid',
          name: '付费组',
          priority: 90,
          enabled: true,
          strategy: 'priority-fallback',
          models: [
            { id: 'obsidian/gpt-6.1-sol', name: 'GPT-6.1 Sol from group', priority: 70, ttftTimeout: 40, enabled: true },
            { id: 'obsidian/kimi-3', name: 'Kimi 3', priority: 60, ttftTimeout: 20, enabled: true },
            { id: 'obsidian/disabled', name: 'Off', priority: 99, ttftTimeout: 10, enabled: false },
          ],
        },
        {
          id: 'spare',
          name: '备用组',
          priority: 40,
          enabled: false,
          strategy: 'priority-fallback',
          models: [
            { id: 'obsidian/should-skip', name: 'Skipped group', priority: 100, ttftTimeout: 10, enabled: true },
          ],
        },
        {
          id: 'idle',
          name: '未勾选',
          priority: 80,
          enabled: true,
          strategy: 'priority-fallback',
          models: [
            { id: 'obsidian/not-active', name: 'Not in activeGroupIds', priority: 95, ttftTimeout: 10, enabled: true },
          ],
        },
      ],
      standaloneModels: [
        { id: 'obsidian/gpt-6.1-sol', name: 'GPT-6.1 Sol (Paid 满血主力)', priority: 100, ttftTimeout: 75, enabled: true },
        { id: 'obsidian/gpt-6-astra', name: 'gpt 6 astra', priority: 85, ttftTimeout: 60, enabled: true },
        { id: 'obsidian/claude-opus-5', name: 'Claude Opus 5', priority: 80, ttftTimeout: 60, enabled: true },
      ],
      activeStandaloneModelIds: ['obsidian/gpt-6.1-sol', 'obsidian/claude-opus-5'],
    })

    const chain = buildCompositeChain(cfg, now)
    assert.deepEqual(chain.map((m) => m.id), [
      'obsidian/gpt-6.1-sol',
      'obsidian/claude-opus-5',
      'obsidian/kimi-3',
    ])
    const top = chain[0]
    assert.equal(top.priority, 100)
    assert.equal(top.sourceGroupName, '独立模型')
    assert.equal(top.overriddenGroups?.[0]?.groupName, '付费组')
    assert.equal(top.overriddenGroups?.[0]?.priority, 70)
    assert.ok(!chain.some((m) => m.id === 'obsidian/gpt-6-astra'))
    assert.ok(!chain.some((m) => m.id === 'obsidian/should-skip'))
    assert.ok(!chain.some((m) => m.id === 'obsidian/disabled'))
    assert.ok(!chain.some((m) => m.id === 'obsidian/not-active'))
  })

  it('single-target selection narrows the workflow chain without changing the global queue inputs', () => {
    const cfg = settings({
      selectedActiveTarget: 'model:obsidian/gpt-6-astra',
      activeStandaloneModelIds: ['obsidian/gpt-6.1-sol', 'obsidian/gpt-6-astra'],
    })
    const focused = chainForSelection(cfg)
    assert.deepEqual(focused.map((m) => m.id), ['obsidian/gpt-6-astra'])
    const global = buildCompositeChain(cfg)
    assert.deepEqual(global.map((m) => m.id), ['obsidian/gpt-6.1-sol', 'obsidian/gpt-6-astra'])
  })
})

describe('model router circuit breaker', () => {
  it('opens a 60s cooldown on simulated 503 and clears every breaker on reset', () => {
    const now = 1_700_000_000_000
    const opened = recordFailure(createDefaultSettings(), 'obsidian/gpt-6.1-sol', '503', now)
    const rec = opened.circuitBreakers['obsidian/gpt-6.1-sol']
    assert.equal(rec.state, 'open')
    assert.equal(rec.failures, 1)
    assert.equal(rec.cooldownUntil, now + COOLDOWN_503_MS)
    assert.equal(COOLDOWN_503_MS, 60_000)

    const chain = buildCompositeChain(opened, now + 1000)
    const topModel = chain.find((m) => m.id === 'obsidian/gpt-6.1-sol')
    assert.ok(topModel)
    assert.equal(isModelCooling(topModel, now + 1000), true)
    assert.equal(getModelRemainingSeconds(topModel, now + 1000), 59)

    const elapsed = buildCompositeChain(opened, now + COOLDOWN_503_MS)
    const probed = elapsed.find((m) => m.id === 'obsidian/gpt-6.1-sol')
    assert.equal(probed?.circuitBreaker?.state, 'half-open')
    assert.equal(isModelCooling(probed!, now + COOLDOWN_503_MS), false)

    const reset = resetAllCircuitBreakers(opened)
    assert.deepEqual(reset.circuitBreakers, {})
    const healthy = buildCompositeChain(reset, now)
    assert.equal(healthy.every((m) => !isModelCooling(m, now)), true)
  })

  it('rejects broken SSOT and round-trips a valid document with an incremented revision', () => {
    const bad = parseSSOT('{')
    assert.equal(bad.success, false)

    const good = parseSSOT(JSON.stringify(createDefaultSettings()))
    assert.equal(good.success, true)
    if (!good.success) return
    assert.equal(good.data.standaloneModels[0]?.id, 'obsidian/gpt-6.1-sol')

    const { jsonString } = serializeSSOT('{"revision":4,"extra":true}', { version: '1.1.0' })
    const again = JSON.parse(jsonString) as { revision: number; extra: boolean }
    assert.equal(again.revision, 5)
    assert.equal(again.extra, true)
  })
})

describe('model router hotkey', () => {
  it('binds Ctrl+Shift+3 (and Cmd+Shift+3) as the default floating router shortcut', () => {
    const shortcut = DEFAULT_SHORTCUTS.openModelRouter
    assert.equal(shortcut.key, '3')
    assert.equal(shortcut.ctrlKey, true)
    assert.equal(shortcut.shiftKey, true)
    assert.equal(shortcut.altKey, undefined)
    assert.equal(shortcut.label, 'Ctrl + Shift + 3')

    const ctrlShift3 = { key: '3', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false } as KeyboardEvent
    const metaShift3 = { key: '3', ctrlKey: false, shiftKey: true, altKey: false, metaKey: true } as KeyboardEvent
    const ctrl3 = { key: '3', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false } as KeyboardEvent
    const plain3 = { key: '3', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false } as KeyboardEvent

    assert.equal(matchesShortcut(ctrlShift3, shortcut), true)
    assert.equal(matchesShortcut(metaShift3, shortcut), true)
    assert.equal(matchesShortcut(ctrl3, shortcut), false)
    assert.equal(matchesShortcut(plain3, shortcut), false)
  })
})
