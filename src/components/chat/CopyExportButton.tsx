import { useRef, useState, useCallback } from 'react'
import { Copy, Download, Check, Loader2 } from 'lucide-react'
import { useI18n } from '../../utils/i18n'

interface CopyExportButtonProps {
  /** Async getter that returns the full raw session JSON string to copy/export */
  getSessionJson: () => Promise<string>
  /** Session ID used to generate the export filename */
  sessionId: string | null
  className?: string
  /** Compact icon-only button mode for space-constrained toolbars */
  compact?: boolean
}

type ButtonState = 'idle' | 'loading' | 'copied' | 'exported' | 'error'

export function CopyExportButton({
  getSessionJson,
  sessionId,
  className = '',
  compact = false,
}: CopyExportButtonProps) {
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

  const { lang, t } = useI18n()
  const isDisabled = !sessionId || state === 'loading'
  const isZh = lang === 'zh-CN'

  const stateConfig: Record<ButtonState, { icon: React.ReactNode; label: string; colorClass: string }> = {
    idle: {
      icon: <Copy className="w-3.5 h-3.5" />,
      label: isZh ? '复制全部 JSON' : 'Copy All JSON',
      colorClass: 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 border-zinc-700/50',
    },
    loading: {
      icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
      label: isZh ? '处理中...' : 'Working...',
      colorClass: 'text-zinc-500 border-zinc-700/30 cursor-wait',
    },
    copied: {
      icon: <Check className="w-3.5 h-3.5" />,
      label: isZh ? '已复制!' : 'Copied!',
      colorClass: 'text-emerald-400 border-emerald-800/50 bg-emerald-950/30',
    },
    exported: {
      icon: <Download className="w-3.5 h-3.5" />,
      label: isZh ? '已保存到桌面!' : 'Saved to Desktop!',
      colorClass: 'text-sky-400 border-sky-800/50 bg-sky-950/30',
    },
    error: {
      icon: <Copy className="w-3.5 h-3.5" />,
      label: isZh ? '失败 — 请重试' : 'Failed — retry',
      colorClass: 'text-red-400 border-red-800/50',
    },
  }

  const { icon, label, colorClass } = stateConfig[state]

  const tooltipText = !sessionId
    ? t.header.noActiveSession
    : state === 'copied'
      ? t.header.copyJsonSuccess
      : state === 'exported'
        ? t.header.exportSuccess
        : t.header.copyJsonTooltip

  if (compact) {
    return (
      <div className="relative group/copy shrink-0">
        <button
          type="button"
          disabled={isDisabled}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          className={[
            'flex items-center justify-center p-1.5 text-xs font-medium rounded-md border transition-all duration-150 select-none shrink-0 cursor-pointer shadow-sm',
            'active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed',
            state === 'idle'
              ? 'text-zinc-400 hover:text-zinc-100 bg-[#16181e] hover:bg-[#1f232b] border-[#272a31] hover:border-zinc-600/70'
              : colorClass,
            className,
          ].join(' ')}
          aria-label={tooltipText}
        >
          {icon}
        </button>

        {/* Immediate floating tooltip on hover (100% localized and instant) */}
        <div className="pointer-events-none absolute right-0 top-full mt-1.5 z-50 whitespace-nowrap rounded-md bg-[#12141a]/95 backdrop-blur-md border border-[#2a2e38] px-2 py-1 text-[11px] font-medium text-zinc-200 shadow-xl opacity-0 translate-y-1 group-hover/copy:opacity-100 group-hover/copy:translate-y-0 transition-all duration-150">
          {tooltipText}
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      title={isZh ? '点击复制全部 JSON (单击) · 长按 500ms 导出到桌面' : 'Click to copy full JSON · Long press 500ms to export to desktop'}
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
