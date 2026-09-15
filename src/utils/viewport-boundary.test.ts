import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeFlippedPosition,
  getBoundaryPlacementClasses,
  type RectLike,
} from './viewport-boundary'

describe('Viewport Boundary Collision & Flip Utilities', () => {
  const defaultViewport = { width: 1200, height: 800 }

  test('keeps default bottom placement when plenty of space exists below', () => {
    const triggerRect: RectLike = {
      top: 100,
      bottom: 130,
      left: 200,
      right: 300,
      width: 100,
      height: 30,
    }
    const dropdownRect = { width: 240, height: 200 }

    const result = computeFlippedPosition({
      triggerRect,
      dropdownRect,
      viewport: defaultViewport,
      defaultPlacement: 'bottom',
    })

    assert.equal(result.placement, 'bottom')
    assert.equal(result.isFlippedVertical, false)
    assert.equal(result.align, 'start')
    assert.equal(result.isFlippedHorizontal, false)

    const classes = getBoundaryPlacementClasses(result)
    assert.equal(classes.placementClass, 'top-full mt-1.5')
    assert.equal(classes.alignClass, 'left-0')
  })

  test('flips from bottom to top when dropdown overflows bottom edge (Image scenario)', () => {
    // Trigger is near the bottom of the window (e.g. PromptInput bar)
    const triggerRect: RectLike = {
      top: 720,
      bottom: 750,
      left: 100,
      right: 200,
      width: 100,
      height: 30,
    }
    const dropdownRect = { width: 240, height: 260 } // Needs 260px, only 50px below

    const result = computeFlippedPosition({
      triggerRect,
      dropdownRect,
      viewport: defaultViewport, // height: 800
      defaultPlacement: 'bottom',
    })

    // Flips to top because spaceAbove (720 - 6 - 8 = 706px) > spaceBelow (800 - 750 - 6 - 8 = 36px)
    assert.equal(result.placement, 'top')
    assert.equal(result.isFlippedVertical, true)

    const classes = getBoundaryPlacementClasses(result)
    assert.equal(classes.placementClass, 'bottom-full mb-1.5')
  })

  test('flips from top to bottom when dropdown overflows top edge', () => {
    // Trigger is near the top of the window
    const triggerRect: RectLike = {
      top: 20,
      bottom: 50,
      left: 100,
      right: 200,
      width: 100,
      height: 30,
    }
    const dropdownRect = { width: 240, height: 200 }

    const result = computeFlippedPosition({
      triggerRect,
      dropdownRect,
      viewport: defaultViewport,
      defaultPlacement: 'top',
    })

    assert.equal(result.placement, 'bottom')
    assert.equal(result.isFlippedVertical, true)

    const classes = getBoundaryPlacementClasses(result)
    assert.equal(classes.placementClass, 'top-full mt-1.5')
  })

  test('flips horizontal alignment from start (left) to end (right) when right edge overflows', () => {
    // Trigger is near the right edge of the viewport
    const triggerRect: RectLike = {
      top: 200,
      bottom: 230,
      left: 1100,
      right: 1180,
      width: 80,
      height: 30,
    }
    const dropdownRect = { width: 240, height: 150 } // 1100 + 240 = 1340 > 1200 viewport width

    const result = computeFlippedPosition({
      triggerRect,
      dropdownRect,
      viewport: defaultViewport,
      defaultAlign: 'start',
    })

    assert.equal(result.align, 'end')
    assert.equal(result.isFlippedHorizontal, true)

    const classes = getBoundaryPlacementClasses(result)
    assert.equal(classes.alignClass, 'right-0')
  })

  test('flips horizontal alignment from end (right) to start (left) when left edge overflows', () => {
    // Trigger is near the left edge of the viewport
    const triggerRect: RectLike = {
      top: 200,
      bottom: 230,
      left: 20,
      right: 80,
      width: 60,
      height: 30,
    }
    const dropdownRect = { width: 200, height: 150 } // 80 - 200 = -120 < 8 padding

    const result = computeFlippedPosition({
      triggerRect,
      dropdownRect,
      viewport: defaultViewport,
      defaultAlign: 'end',
    })

    assert.equal(result.align, 'start')
    assert.equal(result.isFlippedHorizontal, true)

    const classes = getBoundaryPlacementClasses(result)
    assert.equal(classes.alignClass, 'left-0')
  })

  test('clamps maxHeight when dropdown is larger than available vertical headroom', () => {
    const smallViewport = { width: 800, height: 300 }
    const triggerRect: RectLike = {
      top: 150,
      bottom: 180,
      left: 100,
      right: 200,
      width: 100,
      height: 30,
    }
    const dropdownRect = { width: 200, height: 350 } // Taller than the entire screen!

    const result = computeFlippedPosition({
      triggerRect,
      dropdownRect,
      viewport: smallViewport,
      defaultPlacement: 'bottom',
    })

    // spaceAbove: 150 - 14 = 136px
    // spaceBelow: 300 - 180 - 14 = 106px
    // spaceAbove > spaceBelow -> flips to 'top'
    assert.equal(result.placement, 'top')
    assert.ok(result.maxHeight !== undefined)
    assert.ok(result.maxHeight! <= 136)
  })
})
