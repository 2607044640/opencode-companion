import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculatePreviewPosition } from './session-preview-position'

describe('calculatePreviewPosition', () => {
  it('places preview on the right when mouse is on the left side', () => {
    const pos = calculatePreviewPosition({
      mouseX: 180,
      mouseY: 260,
      previewWidth: 500,
      previewHeight: 520,
      viewportWidth: 1920,
      viewportHeight: 1080,
      margin: 16,
      cursorOffset: 20,
    })

    assert.equal(pos.placement, 'right')
    assert.equal(pos.x, 200) // mouseX (180) + cursorOffset (20)
    assert.equal(pos.y, 212) // mouseY (260) - 48
    assert.equal(pos.maxWidth, 500)
    assert.ok(pos.x + pos.maxWidth <= 1920)
  })

  it('flips preview to the left when mouse is near the right edge of viewport', () => {
    const pos = calculatePreviewPosition({
      mouseX: 1800,
      mouseY: 300,
      previewWidth: 500,
      previewHeight: 520,
      viewportWidth: 1920,
      viewportHeight: 1080,
      margin: 16,
      cursorOffset: 20,
    })

    assert.equal(pos.placement, 'left')
    assert.equal(pos.x, 1280) // 1800 - 20 - 500
    assert.ok(pos.x >= 16)
    assert.ok(pos.x + pos.maxWidth <= 1920)
  })

  it('clamps vertical position to margin when mouse is near the top', () => {
    const pos = calculatePreviewPosition({
      mouseX: 300,
      mouseY: 20,
      previewWidth: 500,
      previewHeight: 520,
      viewportWidth: 1920,
      viewportHeight: 1080,
      margin: 16,
    })

    assert.equal(pos.y, 16) // clamped to margin
  })

  it('clamps vertical position so it does not overflow bottom of viewport', () => {
    const pos = calculatePreviewPosition({
      mouseX: 300,
      mouseY: 1050,
      previewWidth: 500,
      previewHeight: 520,
      viewportWidth: 1920,
      viewportHeight: 1080,
      margin: 16,
    })

    assert.ok(pos.y + 520 <= 1080 - 16)
    assert.equal(pos.y, 1080 - 520 - 16) // 544
  })

  it('handles narrow viewport gracefully by constraining maxWidth', () => {
    const pos = calculatePreviewPosition({
      mouseX: 100,
      mouseY: 100,
      previewWidth: 600,
      previewHeight: 500,
      viewportWidth: 400,
      viewportHeight: 600,
      margin: 16,
    })

    assert.ok(pos.maxWidth <= 400 - 32)
    assert.ok(pos.x >= 16)
  })
})
