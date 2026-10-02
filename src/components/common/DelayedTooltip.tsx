import React, { useState, useRef, useEffect, useCallback } from 'react'

export interface DelayedTooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  /** Delay before disappearing in milliseconds. Defaults to 200ms (0.2s) */
  delayHideMs?: number
  /** Delay before appearing in milliseconds. Defaults to 0ms */
  delayShowMs?: number
  placement?: 'top' | 'top-end' | 'top-start' | 'bottom' | 'bottom-end' | 'bottom-start'
  variant?: 'default' | 'error' | 'warning'
  className?: string
  tooltipClassName?: string
  disabled?: boolean
}

export const DEFAULT_TOOLTIP_HIDE_DELAY_MS = 200

export function DelayedTooltip({
  content,
  children,
  delayHideMs = DEFAULT_TOOLTIP_HIDE_DELAY_MS,
  delayShowMs = 0,
  placement = 'top-end',
  variant = 'default',
  className = '',
  tooltipClassName = '',
  disabled = false,
}: DelayedTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
  }, [])

  const handleMouseEnter = useCallback(() => {
    if (disabled || !content) return
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    if (delayShowMs > 0) {
      showTimerRef.current = setTimeout(() => {
        setIsVisible(true)
      }, delayShowMs)
    } else {
      setIsVisible(true)
    }
  }, [disabled, content, delayShowMs])

  const handleMouseLeave = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
    leaveTimerRef.current = setTimeout(() => {
      setIsVisible(false)
    }, delayHideMs)
  }, [delayHideMs])

  useEffect(() => {
    return () => {
      clearTimers()
    }
  }, [clearTimers])

  if (disabled || !content) {
    return <>{children}</>
  }

  const placementClasses: Record<string, string> = {
    'top': 'bottom-full mb-1.5 left-1/2 -translate-x-1/2',
    'top-end': 'bottom-full mb-1.5 right-0',
    'top-start': 'bottom-full mb-1.5 left-0',
    'bottom': 'top-full mt-1.5 left-1/2 -translate-x-1/2',
    'bottom-end': 'top-full mt-1.5 right-0',
    'bottom-start': 'top-full mt-1.5 left-0',
  }

  const variantClasses: Record<string, string> = {
    default: 'bg-[#12141a]/95 border-[#2a2e38] text-zinc-200 shadow-black/80',
    error: 'bg-[#160d10]/95 border-rose-900/70 text-rose-200 shadow-rose-950/50',
    warning: 'bg-[#16120a]/95 border-amber-900/70 text-amber-200 shadow-amber-950/50',
  }

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title=""
    >
      {children}
      {isVisible && (
        <span
          role="tooltip"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={`pointer-events-auto absolute z-50 px-2.5 py-1.5 rounded-md border text-[11px] font-mono leading-relaxed shadow-2xl backdrop-blur-md max-w-xs sm:max-w-md break-words whitespace-pre-wrap select-text cursor-auto transition-opacity duration-150 ${
            placementClasses[placement] || placementClasses['top-end']
          } ${variantClasses[variant] || variantClasses.default} ${tooltipClassName}`}
        >
          {content}
        </span>
      )}
    </span>
  )
}
