/**
 * Unified Time Utility Module (Single Source of Truth for Companion app)
 */

export interface FormatTimeAgoOptions {
  /**
   * Days format for timestamps exceeding 48 hours.
   * 'days': '3 days ago' / '1 day ago' (default, matches user specification)
   * 'd': '3d ago' / '1d ago'
   */
  daysFormat?: 'days' | 'd'
  /**
   * Fallback string when timestamp is undefined, null, or invalid.
   * Defaults to '--'
   */
  fallback?: string
  /**
   * Whether to format in localized Chinese (e.g. 刚刚, 5秒前, 2分钟前, 3小时前, 3天前).
   * Defaults to false (English: xs ago, xm ago, xh ago, x days ago)
   */
  isZh?: boolean
}

/**
 * Normalizes a timestamp (milliseconds, seconds, or Date object) into epoch milliseconds.
 */
export function normalizeTimestampMs(timestamp: number | Date | string | undefined | null): number | null {
  if (timestamp === undefined || timestamp === null) return null
  if (timestamp instanceof Date) {
    const t = timestamp.getTime()
    return isNaN(t) ? null : t
  }
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp)
    if (!isNaN(parsed)) return parsed
    const num = Number(timestamp)
    if (!isNaN(num) && num > 0) return normalizeTimestampMs(num)
    return null
  }
  if (typeof timestamp === 'number') {
    if (isNaN(timestamp) || timestamp <= 0) return null
    // If timestamp is in seconds (e.g. 10 digits < 1e11), convert to milliseconds
    return timestamp < 1e11 ? timestamp * 1000 : timestamp
  }
  return null
}

/**
 * Formats relative time difference:
 * - < 60s: `${diffSec}s ago` (or `0s ago` if diff <= 0)
 * - < 60m: `${diffMin}m ago`
 * - < 48h: `${diffHours}h ago`
 * - >= 48h: `${diffDays} days ago` (or `${diffDays}d ago` depending on options.daysFormat)
 */
export function formatTimeAgo(
  timestamp: number | Date | string | undefined | null,
  nowMs?: number,
  options?: FormatTimeAgoOptions
): string {
  const ms = normalizeTimestampMs(timestamp)
  if (ms === null) return options?.fallback ?? '--'

  const current = typeof nowMs === 'number' ? nowMs : Date.now()
  const diffMs = current - ms

  // Future timestamp (clock skew or immediate)
  if (diffMs <= 0) {
    if (options?.isZh) return '刚刚'
    return '0s ago'
  }

  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) {
    if (options?.isZh) return diffSec <= 2 ? '刚刚' : `${diffSec}秒前`
    return `${diffSec}s ago`
  }

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) {
    if (options?.isZh) return `${diffMin}分钟前`
    return `${diffMin}m ago`
  }

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 48) {
    if (options?.isZh) return `${diffHours}小时前`
    return `${diffHours}h ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (options?.isZh) {
    return `${diffDays}天前`
  }

  if (options?.daysFormat === 'd') {
    return `${diffDays}d ago`
  }

  return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`
}

/**
 * Formats absolute time in short 2-digit format: 'YY.MM.DD HH:mm'
 * Example: '26.11.08 18:46'
 */
export function formatAbsoluteUserTime(timestamp?: number | Date | null): string {
  const ms = normalizeTimestampMs(timestamp)
  if (ms === null) return ''
  const d = new Date(ms)
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yy}.${mm}.${dd} ${hh}:${min}`
}

/**
 * Legacy wrapper for user message bubble time formatting (relative within 48h, absolute after 48h).
 */
export function formatUserMessageTime(timestamp?: number | Date | null, nowMs?: number): string {
  const ms = normalizeTimestampMs(timestamp)
  if (ms === null) return ''

  const current = typeof nowMs === 'number' ? nowMs : Date.now()
  const diffMs = current - ms

  const FORTY_EIGHT_HOURS_MS = 48 * 3600 * 1000
  if (diffMs >= 0 && diffMs < FORTY_EIGHT_HOURS_MS) {
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) {
      return 'just now'
    }
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) {
      return `${diffMin}m ago`
    }
    const diffHours = Math.floor(diffMin / 60)
    return `${diffHours}h ago`
  }

  return formatAbsoluteUserTime(ms)
}
