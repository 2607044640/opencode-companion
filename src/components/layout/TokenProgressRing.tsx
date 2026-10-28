import { getTokenThreshold, type TokenThreshold } from '../../utils/token-limit'

interface TokenProgressRingProps {
  percent: number
  threshold?: TokenThreshold
  size?: number
  showPercentText?: boolean
  className?: string
  title?: string
}

/**
 * Token Context Window Circular Progress Ring ("圈圈")
 * 
 * Renders an SVG progress ring directly in the header bar, sidebar, and tooltips.
 * Color transitions:
 * - >= 75%: Red (#ef4444) (超过3/4变红)
 * - >= 50%: Yellow (#eab308) (超过一半变黄)
 * - < 50%: Green (#22c55e) (其他是绿)
 */
export function TokenProgressRing({
  percent,
  threshold,
  size = 14,
  showPercentText = false,
  className = '',
  title,
}: TokenProgressRingProps) {
  const activeThreshold = threshold ?? getTokenThreshold(percent)
  const clamped = Math.min(Math.max(percent, 0), 100)

  // Circular geometry
  const radius = 6.5
  const strokeWidth = 2.2
  const center = 9
  const circumference = 2 * Math.PI * radius
  // When clamped is 0, hide stroke completely so empty ring has no stub
  const offset = clamped <= 0 ? circumference : circumference * (1 - clamped / 100)

  const strokeColor =
    activeThreshold === 'red'
      ? '#ef4444' // Red (>= 75%)
      : activeThreshold === 'yellow'
      ? '#eab308' // Yellow (>= 50%)
      : '#22c55e' // Green (< 50%)

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
      title={title}
    >
      <svg
        viewBox="0 0 18 18"
        className="w-full h-full -rotate-90 transform"
        aria-hidden="true"
      >
        {/* Track circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.15)"
          strokeWidth={strokeWidth}
        />
        {/* Dynamic progress arc */}
        {clamped > 0 && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-[stroke-dashoffset,stroke] duration-300 ease-out"
          />
        )}
      </svg>
      {showPercentText && (
        <span
          className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-bold leading-none select-none pointer-events-none tracking-tighter"
          style={{ color: strokeColor }}
        >
          {clamped}%
        </span>
      )}
    </div>
  )
}
