import React from 'react'

export interface AntigravityRunningIndicatorProps {
  className?: string
  title?: string
}

/**
 * Antigravity-style in-progress running animation (2x2 animated dot matrix)
 */
export function AntigravityRunningIndicator({
  className = '',
  title = '正在进行中…',
}: AntigravityRunningIndicatorProps) {
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 text-sky-400 ${className}`}
      title={title}
      aria-label="In progress"
    >
      <span className="grid grid-cols-2 gap-[2px] w-2.5 h-2.5 items-center justify-center">
        <span
          className="w-1 h-1 rounded-full bg-sky-400 animate-pulse"
          style={{ animationDuration: '0.8s', animationDelay: '0ms' }}
        />
        <span
          className="w-1 h-1 rounded-full bg-sky-400 animate-pulse"
          style={{ animationDuration: '0.8s', animationDelay: '200ms' }}
        />
        <span
          className="w-1 h-1 rounded-full bg-sky-400 animate-pulse"
          style={{ animationDuration: '0.8s', animationDelay: '600ms' }}
        />
        <span
          className="w-1 h-1 rounded-full bg-sky-400 animate-pulse"
          style={{ animationDuration: '0.8s', animationDelay: '400ms' }}
        />
      </span>
    </span>
  )
}

/**
 * Unread response blue dot indicator with glowing ring and pulse animation
 */
export function SessionUnreadDot({
  className = '',
  title = '新消息未读',
}: {
  className?: string
  title?: string
}) {
  return (
    <span
      className={`w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] ring-1 ring-sky-400/50 shrink-0 animate-pulse ${className}`}
      title={title}
      aria-label="Unread"
    />
  )
}

/**
 * Reusable trailing indicator for session list items (Sidebar, Search Modal, etc.).
 * Priority: Running (Figure 2 animated grid) > Unread (Blue dot) > Fallback (e.g. Timestamp)
 */
export function SessionTrailingIndicator({
  isRunning,
  isUnread,
  runningTitle,
  unreadTitle,
  fallback,
}: {
  isRunning?: boolean
  isUnread?: boolean
  runningTitle?: string
  unreadTitle?: string
  fallback?: React.ReactNode
}) {
  if (isRunning) {
    return <AntigravityRunningIndicator title={runningTitle} />
  }
  if (isUnread) {
    return <SessionUnreadDot title={unreadTitle} />
  }
  return <>{fallback}</>
}
