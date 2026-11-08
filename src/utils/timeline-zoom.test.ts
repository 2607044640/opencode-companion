import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampZoom,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  TIMELINE_ZOOM_STORAGE_KEY,
  getZoomLevel,
  saveZoomLevel,
  zoomIn,
  zoomOut,
  resetZoom,
} from './timeline-zoom'

// Mock minimal localStorage and window for node test environment
class MockLocalStorage {
  private store: Record<string, string> = {}
  getItem(key: string): string | null {
    return this.store[key] ?? null
  }
  setItem(key: string, value: string): void {
    this.store[key] = value
  }
  removeItem(key: string): void {
    delete this.store[key]
  }
  clear(): void {
    this.store = {}
  }
}

const mockStorage = new MockLocalStorage()
;(globalThis as any).localStorage = mockStorage

describe('timeline-zoom utility', () => {
  beforeEach(() => {
    mockStorage.clear()
  })

  it('clamps zoom within MIN_ZOOM and MAX_ZOOM bounds', () => {
    assert.equal(clampZoom(100), 100)
    assert.equal(clampZoom(MIN_ZOOM - 20), MIN_ZOOM)
    assert.equal(clampZoom(MAX_ZOOM + 30), MAX_ZOOM)
    assert.equal(clampZoom(NaN), DEFAULT_ZOOM)
    assert.equal(clampZoom(112.4), 112)
  })

  it('returns DEFAULT_ZOOM when localStorage is empty', () => {
    assert.equal(getZoomLevel(), DEFAULT_ZOOM)
  })

  it('persists and retrieves zoom level from localStorage', () => {
    const saved = saveZoomLevel(120)
    assert.equal(saved, 120)
    assert.equal(mockStorage.getItem(TIMELINE_ZOOM_STORAGE_KEY), '120')
    assert.equal(getZoomLevel(), 120)
  })

  it('increments zoom with zoomIn up to MAX_ZOOM', () => {
    saveZoomLevel(100)
    const next1 = zoomIn(100)
    assert.equal(next1, 100 + ZOOM_STEP)

    const nextMax = zoomIn(MAX_ZOOM)
    assert.equal(nextMax, MAX_ZOOM)
  })

  it('decrements zoom with zoomOut down to MIN_ZOOM', () => {
    saveZoomLevel(100)
    const next1 = zoomOut(100)
    assert.equal(next1, 100 - ZOOM_STEP)

    const nextMin = zoomOut(MIN_ZOOM)
    assert.equal(nextMin, MIN_ZOOM)
  })

  it('resets zoom to DEFAULT_ZOOM', () => {
    saveZoomLevel(140)
    assert.equal(getZoomLevel(), 140)

    const reset = resetZoom()
    assert.equal(reset, DEFAULT_ZOOM)
    assert.equal(getZoomLevel(), DEFAULT_ZOOM)
  })
})
