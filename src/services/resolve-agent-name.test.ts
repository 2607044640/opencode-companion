import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveAgentName } from './api'

describe('resolveAgentName mapping tests', () => {
  it('maps legacy OMO atlas aliases to build', () => {
    assert.equal(resolveAgentName('atlas'), 'build')
    assert.equal(resolveAgentName('Atlas'), 'build')
    assert.equal(resolveAgentName('Atlas - Plan Executor'), 'build')
    assert.equal(resolveAgentName('  atlas - plan executor  '), 'build')
  })

  it('maps legacy OMO sisyphus aliases to build', () => {
    assert.equal(resolveAgentName('sisyphus'), 'build')
    assert.equal(resolveAgentName('Sisyphus'), 'build')
    assert.equal(resolveAgentName('Sisyphus - ultraworker'), 'build')
    assert.equal(resolveAgentName('SISYPHUS - ULTRAWORKER'), 'build')
  })

  it('maps legacy OMO prometheus and momus aliases to plan', () => {
    assert.equal(resolveAgentName('prometheus'), 'plan')
    assert.equal(resolveAgentName('Prometheus'), 'plan')
    assert.equal(resolveAgentName('Prometheus - Plan Builder'), 'plan')
    assert.equal(resolveAgentName('momus'), 'plan')
    assert.equal(resolveAgentName('Momus - Plan Critic'), 'plan')
  })

  it('preserves native daemon primary and subagent keys', () => {
    assert.equal(resolveAgentName('build'), 'build')
    assert.equal(resolveAgentName('plan'), 'plan')
    assert.equal(resolveAgentName('scout'), 'scout')
    assert.equal(resolveAgentName('explore'), 'explore')
    assert.equal(resolveAgentName('general'), 'general')
    assert.equal(resolveAgentName('atlas-executor'), 'atlas-executor')
    assert.equal(resolveAgentName('prometheus-planner'), 'prometheus-planner')
    assert.equal(resolveAgentName('researcher'), 'researcher')
    assert.equal(resolveAgentName('worker'), 'worker')
  })

  it('handles empty and default placeholders by returning undefined', () => {
    assert.equal(resolveAgentName(undefined), undefined)
    assert.equal(resolveAgentName(''), undefined)
    assert.equal(resolveAgentName('Default Agent'), undefined)
  })

  it('falls back to lowercased key for unknown agents', () => {
    assert.equal(resolveAgentName('custom-agent'), 'custom-agent')
    assert.equal(resolveAgentName('SomeNewAgent'), 'somenewagent')
  })
})
