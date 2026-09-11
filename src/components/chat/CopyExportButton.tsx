import { useRef, useState, useCallback } from 'react'
import { Copy, Download, Check, Loader2 } from 'lucide-react'

interface CopyExportButtonProps {
  /** Async getter that returns the full raw session JSON string to copy/export */
  getSessionJson: () => Promise<string>
  /** Session ID used to generate the export filename */
  sessionId: string | null
  className?: string
}

type ButtonState = 'idle' | 'loading' | 'copied' | 'exported' | 'error'

export function CopyExportButton({ getSessionJson, sessionId, className = '' }: CopyExportButtonProps) {
  const [state, setState] = useState<ButtonState>('idle')
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPressRef = useRef(false)

  const resetAfter = useCallback((ms = 2000) => {
    setTimeout(() => setState('idle'), ms)
  }, [])

  const doCopy = useCallback(async () => {
    if (!sessionId) return
    setState('loading')
    try {
      const json = await getSessionJson()
      await navigator.clipboard.writeText(json)
      setState('copied')
      resetAfter(2000)
    } catch {
      setState('error')
      resetAfter(2500)
    }
  }, [getSessionJson, sessionId, resetAfter])

  const doExport = useCallback(async () => {
    if (!sessionId) return
    setState('loading')
    try {
      const json = await getSessionJson()
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const filename = `session-${sessionId.slice(0, 8)}-${dateStr}.json`
      const resp = await fetch('/api/export-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: json }),
        signal: AbortSignal.timeout(8000),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setState('exported')
      resetAfter(2500)
    } catch {
      // Fallback: trigger browser download if serve.mjs route fails
      try {
        const json = await getSessionJson()
        const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const filename = `session-${(sessionId ?? 'unknown').slice(0, 8)}-${dateStr}.json`
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
        setState('exported')
        resetAfter(2500)
      } catch {
        setState('error')
        resetAfter(2500)
      }
    }
  }, [getSessionJson, sessionId, resetAfter])

  const handlePointerDown = useCallback(() => {
    isLongPressRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true
      void doExport()
    }, 500)
  }, [doExport])

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (!isLongPressRef.current) {
      void doCopy()
    }
  }, [doCopy])

  const handlePointerLeave = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const isDisabled = !sessionId || state === 'loading'

  const stateConfig: Record<ButtonState, { icon: React.ReactNode; label: string; colorClass: string }> = {
    idle: {
      icon: <Copy className="w-3.5 h-3.5" />,
      label: 'Copy All JSON',
      colorClass: 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 border-zinc-700/50',
    },
    loading: {
      icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
      label: 'Working...',
      colorClass: 'text-zinc-500 border-zinc-700/30 cursor-wait',
    },
    copied: {
      icon: <Check className="w-3.5 h-3.5" />,
      label: 'Copied!',
      colorClass: 'text-emerald-400 border-emerald-800/50 bg-emerald-950/30',
    },
    exported: {
      icon: <Download className="w-3.5 h-3.5" />,
      label: 'Saved to Desktop!',
      colorClass: 'text-sky-400 border-sky-800/50 bg-sky-950/30',
    },
    error: {
      icon: <Copy className="w-3.5 h-3.5" />,
      label: 'Failed — retry',
      colorClass: 'text-red-400 border-red-800/50',
    },
  }

  const { icon, label, colorClass } = stateConfig[state]

  return (
    <button
      type="button"
      title={`点击复制全部 JSON (单击) · 长按 500ms 导出到桌面`}
      disabled={isDisabled}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className={[
        'flex items-center gap-1.5 px-2 py-1 text-xs font-medium',
        'border rounded transition-all duration-150 select-none shrink-0',
        'active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed',
        colorClass,
        className,
      ].join(' ')}
    >
      {icon}
      <span className="hidden sm:inline whitespace-nowrap">{label}</span>
    </button>
  )
}
