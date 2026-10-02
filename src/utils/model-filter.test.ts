import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  isCuratedModel,
  isModelVisible,
  ALLOWED_CANONICAL_MODEL_IDS,
  sortModelsByPriority,
  resolveSeniorModel,
} from './model-filter'

describe('Curated Model Filter Engine', () => {
  test('ALLOWS canonical approved models', () => {
    // 0. grok-4.7
    assert.equal(isCuratedModel('obsidian', 'grok-4.7'), true)
    assert.equal(isCuratedModel('obsidian', 'grok4.7'), true)
    assert.equal(isCuratedModel('custom', 'grok-4.7', 'Grok 4.7 (Official)'), true)

    // 1. grok-4.6
    assert.equal(isCuratedModel('obsidian', 'grok-4.6'), true)
    assert.equal(isCuratedModel('obsidian', 'grok4.6'), true)
    assert.equal(isCuratedModel('custom', 'grok-4.6', 'Grok 4.6 (Official)'), true)

    // 2. grok-4.5
    assert.equal(isCuratedModel('obsidian', 'grok-4.5'), true)
    assert.equal(isCuratedModel('obsidian', 'grok4.5'), true)
    assert.equal(isCuratedModel('custom', 'grok-4.5', 'Grok 4.5 (Official)'), true)

    // 3. gemini-3.8-flash
    assert.equal(isCuratedModel('obsidian', 'gemini-3.8-flash'), true)
    assert.equal(isCuratedModel('obsidian', 'flash-3.8'), true)
    assert.equal(isCuratedModel('obsidian', 'flash3.8'), true)
    assert.equal(isCuratedModel('custom', 'gemini-3.8-flash', 'Gemini 3.8 Flash'), true)

    // 4. gemini-3.7-flash (Our Flash 3.7 connected to OpenCode)
    assert.equal(isCuratedModel('obsidian', 'gemini-3.7-flash'), true)
    assert.equal(isCuratedModel('obsidian', 'flash-3.7'), true)
    assert.equal(isCuratedModel('obsidian', 'flash3.7'), true)
  })

  test('BLOCKS all OpenCode Zen provider models', () => {
    const zenModels = [
      'nemotron-3-ultra-free',
      'muse-spark-1.3-contributor-free',
      'muse-spark-1.2-contributor-free',
      'nemotron-3.5-lightning-free',
      'mimo-v2.5-free',
      'big-pickle',
      'ling-3.0-flash-fin-free',
    ]

    for (const zenModel of zenModels) {
      assert.equal(
        isCuratedModel('opencode', zenModel),
        false,
        `Expected ${zenModel} from opencode provider to be blocked`
      )
    }
  })

  test('BLOCKS unapproved models under obsidian provider', () => {
    const unapproved = [
      'free-auto-cascade',
      'free-cascade',
      'claude-opus-5',
      'qwen3.8-max',
      'kimi-k3',
      'gpt-4o',
      'deepseek-v3',
      'claude-3-5-sonnet',
    ]

    for (const model of unapproved) {
      assert.equal(
        isCuratedModel('obsidian', model),
        false,
        `Expected ${model} to be blocked`
      )
    }
  })

  test('handles empty or missing model identifiers safely', () => {
    assert.equal(isCuratedModel('obsidian', ''), false)
    assert.equal(isCuratedModel('obsidian', undefined), false)
    assert.equal(isCuratedModel(undefined, undefined), false)
  })

  test('canonical model IDs set contains the expected 5 IDs', () => {
    assert.equal(ALLOWED_CANONICAL_MODEL_IDS.size, 5)
    assert.ok(ALLOWED_CANONICAL_MODEL_IDS.has('grok-4.7'))
    assert.ok(ALLOWED_CANONICAL_MODEL_IDS.has('grok-4.6'))
    assert.ok(ALLOWED_CANONICAL_MODEL_IDS.has('grok-4.5'))
    assert.ok(ALLOWED_CANONICAL_MODEL_IDS.has('gemini-3.8-flash'))
    assert.ok(ALLOWED_CANONICAL_MODEL_IDS.has('gemini-3.7-flash'))
  })

  test('isModelVisible respects custom modelVisibility preferences and provider toggles', () => {
    // Default fallback without overrides
    assert.equal(isModelVisible('obsidian', 'grok-4.6'), true)
    assert.equal(isModelVisible('obsidian', 'grok-4.5'), true)
    assert.equal(isModelVisible('opencode', 'big-pickle'), false)
    assert.equal(isModelVisible('obsidian', 'free-auto-cascade'), false)

    // User explicitly turns ON an uncurated model
    const customVis = {
      'opencode/big-pickle': true,
      'obsidian/free-auto-cascade': true,
      'obsidian/grok-4.6': false, // user turns off grok-4.6
    }
    assert.equal(isModelVisible('opencode', 'big-pickle', 'Big Pickle', customVis), true)
    assert.equal(isModelVisible('obsidian', 'free-auto-cascade', 'Free Auto Cascade', customVis), true)
    assert.equal(isModelVisible('obsidian', 'grok-4.6', 'Grok 4.6', customVis), false)

    // Provider disabled master toggle
    const providerVis = {
      'obsidian': false,
    }
    assert.equal(isModelVisible('obsidian', 'gemini-3.8-flash', 'Gemini 3.8 Flash', {}, providerVis), false)
  })

  test('getModelPriorityScore and sortModelsByPriority enforce Senior model hierarchy', () => {
    const rawList = [
      { providerID: 'obsidian', modelID: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
      { providerID: 'obsidian', modelID: 'grok-4.6', name: 'Grok 4.6 (Paid)' },
      { providerID: 'obsidian', modelID: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
      { providerID: 'obsidian', modelID: 'grok-4.7', name: 'Grok 4.7 (Paid 满血主力)' },
      { providerID: 'custom', modelID: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet' },
    ]

    const sorted = sortModelsByPriority(rawList)
    assert.equal(sorted[0].modelID, 'grok-4.7')
    assert.equal(sorted[1].modelID, 'grok-4.6')
    assert.equal(sorted[2].modelID, 'claude-3-7-sonnet')
    assert.equal(sorted[3].modelID, 'gemini-3.8-flash')
    assert.equal(sorted[4].modelID, 'gemini-3.7-flash')
  })

  test('resolveSeniorModel picks senior model from routingConfig SSOT first', () => {
    const curated = [
      { providerID: 'obsidian', modelID: 'grok-4.6', name: 'Grok 4.6' },
      { providerID: 'obsidian', modelID: 'grok-4.7', name: 'Grok 4.7' },
    ]

    const resolved = resolveSeniorModel({
      routingConfig: {
        seniorModel: { providerID: 'obsidian', modelID: 'grok-4.7', name: 'Grok 4.7 (Paid 满血主力)' },
      },
      daemonConfig: {
        model: 'obsidian/grok-4.6',
      },
      curatedModels: curated,
    })

    assert.ok(resolved)
    assert.equal(resolved.modelID, 'grok-4.7')
    assert.equal(resolved.providerID, 'obsidian')
  })

  test('resolveSeniorModel falls back to daemon agent bindings when routingConfig is missing', () => {
    const curated = [
      { providerID: 'obsidian', modelID: 'gemini-3.8-flash', name: 'Flash 3.8' },
      { providerID: 'obsidian', modelID: 'grok-4.7', name: 'Grok 4.7' },
    ]

    const resolved = resolveSeniorModel({
      routingConfig: null,
      daemonConfig: {
        agent: {
          build: { model: 'obsidian/grok-4.7' },
        },
      },
      curatedModels: curated,
    })

    assert.ok(resolved)
    assert.equal(resolved.modelID, 'grok-4.7')
  })

  test('resolveSeniorModel gracefully falls back to priority ranking for general users', () => {
    const generalUserModels = [
      { providerID: 'anthropic', modelID: 'gemini-3.8-flash', name: 'Flash 3.8' },
      { providerID: 'anthropic', modelID: 'grok-4.6', name: 'Grok 4.6' },
      { providerID: 'anthropic', modelID: 'gemini-3.7-flash', name: 'Flash 3.7' },
    ]

    const resolved = resolveSeniorModel({
      routingConfig: null,
      daemonConfig: null,
      curatedModels: generalUserModels,
    })

    assert.ok(resolved)
    assert.equal(resolved.modelID, 'grok-4.6')
  })
})
