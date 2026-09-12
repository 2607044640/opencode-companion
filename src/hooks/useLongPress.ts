import { useRef, useCallback, useState } from 'react'

export interface UseLongPressOptions {
  onClick: () => void
  onLongPress: () => void
  thresholdMs?: number
}

export function useLongPress({
  onClick,
  onLongPress,
  thresholdMs = 1000,
}: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPressFired = useRef(false)
  const [isPressing, setIsPressing] = useState(false)

  const startPress = useCallback(() => {
    isLongPressFired.current = false
    setIsPressing(true)
    timerRef.current = setTimeout(() => {
      isLongPressFired.current = true
      setIsPressing(false)
      onLongPress()
    }, thresholdMs)
  }, [onLongPress, thresholdMs])

  const cancelPress = useCallback((e?: React.PointerEvent) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setIsPressing(false)
    if (e?.currentTarget && 'blur' in e.currentTarget) {
      ;(e.currentTarget as HTMLElement).blur()
    }
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Blur element to prevent persistent browser focus outline when arrow keys are pressed next
      if (e.currentTarget && 'blur' in e.currentTarget) {
        ;(e.currentTarget as HTMLElement).blur()
      }
      if (isLongPressFired.current) {
        e.preventDefault()
        e.stopPropagation()
        isLongPressFired.current = false
        return
      }
      onClick()
    },
    [onClick]
  )

  return {
    isPressing,
    handlers: {
      onPointerDown: startPress,
      onPointerUp: cancelPress,
      onPointerLeave: cancelPress,
      onPointerCancel: cancelPress,
      onClick: handleClick,
    },
  }
}
