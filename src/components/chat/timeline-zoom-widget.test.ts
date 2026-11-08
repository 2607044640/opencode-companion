import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MIN_ZOOM, MAX_ZOOM, DEFAULT_ZOOM } from '../../utils/timeline-zoom'

describe('TimelineZoomWidget logic', () => {
  it('correctly determines custom zoom status', () => {
    assert.equal(100 === DEFAULT_ZOOM, true)
    assert.equal(110 !== DEFAULT_ZOOM, true)
    assert.equal(90 !== DEFAULT_ZOOM, true)
  })

  it('correctly bounds zoom within MIN_ZOOM and MAX_ZOOM boundaries', () => {
    assert.equal(MIN_ZOOM, 75)
    assert.equal(MAX_ZOOM, 160)
    assert.equal(75 <= MIN_ZOOM, true)
    assert.equal(160 >= MAX_ZOOM, true)
  })
})
