import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_TOOLTIP_HIDE_DELAY_MS } from './DelayedTooltip'

describe('DelayedTooltip Specification', () => {
  it('defaults to 200ms (0.2s) hide delay for screenshot retention', () => {
    assert.equal(DEFAULT_TOOLTIP_HIDE_DELAY_MS, 200)
  })
})
