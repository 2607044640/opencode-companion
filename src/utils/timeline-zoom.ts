import { useState, useEffect, useCallback } from 'react'

export const DEFAULT_ZOOM = 100
export const MIN_ZOOM = 75
export const MAX_ZOOM = 160
export const ZOOM_STEP = 10
export const TIMELINE_ZOOM_STORAGE_KEY = 'opencode_timeline_zoom'

export function clampZoom(zoom: number): number {
  if (typeof zoom !== 'number' || Number.isNaN(zoom)) return DEFAULT_ZOOM
  const rounded = Math.round(zoom)
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rounded))
}

export function getZoomLevel(): number {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(TIMELINE_ZOOM_STORAGE_KEY)
      if (raw) {
        const parsed = Number.parseInt(raw, 10)
        if (!Number.isNaN(parsed)) {
          return clampZoom(parsed)
        }
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_ZOOM
}

export function saveZoomLevel(zoom: number): number {
  const clamped = clampZoom(zoom)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TIMELINE_ZOOM_STORAGE_KEY, String(clamped))
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('opencode-zoom-change', { detail: clamped }))
    }
  } catch {
    // ignore
  }
  return clamped
}

export function zoomIn(current?: number): number {
  const base = typeof current === 'number' ? current : getZoomLevel()
  const next = clampZoom(base + ZOOM_STEP)
  return saveZoomLevel(next)
}

export function zoomOut(current?: number): number {
  const base = typeof current === 'number' ? current : getZoomLevel()
  const next = clampZoom(base - ZOOM_STEP)
  return saveZoomLevel(next)
}

export function resetZoom(): number {
  return saveZoomLevel(DEFAULT_ZOOM)
}

export function useTimelineZoom() {
  const [zoomLevel, setZoomLevel] = useState<number>(() => getZoomLevel())

  useEffect(() => {
    const handleZoomEvent = (e: Event) => {
      const custom = e as CustomEvent<number>
      if (typeof custom.detail === 'number') {
        setZoomLevel(clampZoom(custom.detail))
      } else {
        setZoomLevel(getZoomLevel())
      }
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === TIMELINE_ZOOM_STORAGE_KEY) {
        setZoomLevel(getZoomLevel())
      }
    }

    window.addEventListener('opencode-zoom-change', handleZoomEvent)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('opencode-zoom-change', handleZoomEvent)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => zoomIn(prev))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => zoomOut(prev))
  }, [])

  const handleResetZoom = useCallback(() => {
    setZoomLevel(resetZoom())
  }, [])

  const handleSetZoom = useCallback((nextZoom: number) => {
    setZoomLevel(saveZoomLevel(nextZoom))
  }, [])

  return {
    zoomLevel,
    zoomIn: handleZoomIn,
    zoomOut: handleZoomOut,
    resetZoom: handleResetZoom,
    setZoom: handleSetZoom,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  }
}
