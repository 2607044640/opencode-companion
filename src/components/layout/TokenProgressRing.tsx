import { getTokenThreshold, type TokenThreshold } from '../../utils/token-limit'

interface TokenProgressRingProps {
  percent: number
  threshold?: TokenThreshold
  size?: number
  className?: string
  title?: string
}

/**
 * Token Context Window Circular Progress Ring ("圈圈")
 * 
 * Renders an SVG progress ring directly in the header bar and tooltips.
 * Color transitions:
 * - >= 80%: Red (#ef4444)
 * - >= 50%: Yellow (#eab308)
 * - < 50%: Green (#22c55e)
 */
export function TokenProgressRing({
  percent,
  threshold,
  size = 14,
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
      ? '#ef4444' // Red (>= 80%)
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
    </div>
  )
}
