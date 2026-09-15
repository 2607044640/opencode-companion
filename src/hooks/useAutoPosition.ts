import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react'
import {
  computeFlippedPosition,
  getBoundaryPlacementClasses,
  type VerticalPlacement,
  type HorizontalAlign,
  type ViewportBoundaryResult,
} from '../utils/viewport-boundary'

export interface UseAutoPositionOptions {
  isOpen: boolean
  defaultPlacement?: VerticalPlacement
  defaultAlign?: HorizontalAlign
  margin?: number
  padding?: number
}

export function useAutoPosition<
  TTrigger extends HTMLElement = HTMLElement,
  TDropdown extends HTMLElement = HTMLElement
>(options: UseAutoPositionOptions) {
  const {
    isOpen,
    defaultPlacement = 'bottom',
    defaultAlign = 'start',
    margin = 6,
    padding = 8,
  } = options

  const triggerRef = useRef<TTrigger>(null)
  const dropdownRef = useRef<TDropdown>(null)

  const [position, setPosition] = useState<ViewportBoundaryResult>({
    placement: defaultPlacement,
    align: defaultAlign,
    isFlippedVertical: false,
    isFlippedHorizontal: false,
  })

  const updatePosition = useCallback(() => {
    if (!isOpen || !dropdownRef.current) return

    const triggerEl = triggerRef.current
    const dropdownEl = dropdownRef.current

    // If explicit triggerRef is not attached, fallback to dropdown's parent element
    const triggerRect = triggerEl
      ? triggerEl.getBoundingClientRect()
      : dropdownEl.parentElement?.getBoundingClientRect()

    if (!triggerRect) return

    const dropdownRect = {
      width: dropdownEl.offsetWidth || dropdownEl.getBoundingClientRect().width,
      height: dropdownEl.offsetHeight || dropdownEl.getBoundingClientRect().height,
    }

    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    }

    const res = computeFlippedPosition({
      triggerRect,
      dropdownRect,
      viewport,
      defaultPlacement,
      defaultAlign,
      margin,
      padding,
    })

    setPosition((prev) => {
      if (
        prev.placement === res.placement &&
        prev.align === res.align &&
        prev.maxHeight === res.maxHeight
      ) {
        return prev
      }
      return res
    })
  }, [isOpen, defaultPlacement, defaultAlign, margin, padding])

  // Synchronously compute right after render to eliminate visual layout flash
  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition()
    }
  }, [isOpen, updatePosition])

  // Re-evaluate on window resize and scroll events
  useEffect(() => {
    if (!isOpen) return
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, updatePosition])

  const classes = getBoundaryPlacementClasses(position)

  return {
    triggerRef,
    dropdownRef,
    placement: position.placement,
    align: position.align,
    maxHeight: position.maxHeight,
    isFlippedVertical: position.isFlippedVertical,
    isFlippedHorizontal: position.isFlippedHorizontal,
    placementClasses: classes.placementClass,
    alignClasses: classes.alignClass,
    style: position.maxHeight ? { maxHeight: `${position.maxHeight}px` } : undefined,
  }
}
