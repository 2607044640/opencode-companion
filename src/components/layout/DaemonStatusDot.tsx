import React, { useState } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import {
  useDaemonHeartbeat,
  getDaemonStateTooltip,
} from '../../utils/daemon-heartbeat'

interface DaemonStatusDotProps {
  onRestored?: () => void
  onLost?: () => void
  isZh?: boolean
  showLabelOnIssue?: boolean
  className?: string
}

export const DaemonStatusDot: React.FC<DaemonStatusDotProps> = ({
  onRestored,
  onLost,
  isZh = true,
  showLabelOnIssue = true,
  className = '',
}) => {
  const [isRetrying, setIsRetrying] = useState(false)

  const { state, attempt, retryNow } = useDaemonHeartbeat({
    onRestored,
    onLost,
  })

  const handleClick = async () => {
    if (state === 'connected' || isRetrying) return
    setIsRetrying(true)
    try {
      await retryNow()
    } finally {
      setIsRetrying(false)
    }
  }

  const tooltipText = getDaemonStateTooltip(state, attempt, isZh)

  return (
    <div className={`relative group/daemon flex items-center shrink-0 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={state === 'connected' || isRetrying}
        className={`flex items-center gap-1.5 px-1.5 py-1 rounded-md transition-all select-none ${
          state === 'connected'
            ? 'cursor-default'
            : 'cursor-pointer hover:bg-[#1c202a] active:scale-95'
        }`}
        title={tooltipText}
        aria-label={tooltipText}
      >
        {/* Dynamic Dot Indicator */}
        <span className="relative flex h-2 w-2 items-center justify-center">
          {state === 'connected' ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-25" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </>
          ) : state === 'reconnecting' ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
            </>
          ) : (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </>
          )}
        </span>

        {/* Optional Pill Tag on Disconnection / Reconnecting */}
        {showLabelOnIssue && state !== 'connected' && (
          <span
            className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border transition-colors flex items-center gap-1 ${
              state === 'reconnecting'
                ? 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
            }`}
          >
            {isRetrying ? (
              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
            ) : state === 'reconnecting' ? (
              <span>重连中 ({attempt})</span>
            ) : (
              <>
                <WifiOff className="w-2.5 h-2.5" />
                <span>离线</span>
              </>
            )}
          </span>
        )}
      </button>

      {/* Instant Hover Tooltip */}
      <div className="pointer-events-none absolute left-0 top-full mt-1.5 z-50 whitespace-nowrap rounded-md bg-[#12141a]/95 backdrop-blur-md border border-[#2a2e38] px-2.5 py-1 text-[11px] font-medium text-zinc-200 shadow-xl opacity-0 translate-y-1 group-hover/daemon:opacity-100 group-hover/daemon:translate-y-0 transition-all duration-150">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              state === 'connected'
                ? 'bg-emerald-400'
                : state === 'reconnecting'
                ? 'bg-amber-400'
                : 'bg-rose-500'
            }`}
          />
          <span>{tooltipText}</span>
        </div>
      </div>
    </div>
  )
}
