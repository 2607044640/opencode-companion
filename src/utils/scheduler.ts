/**
 * Scheduled Tasks Engine (计划任务调度器)
 * Supports 1-hour delays, daily 09:00 runs, intervals, and cron expressions.
 */

export const SCHEDULED_TASKS_STORAGE_KEY = 'opencode_scheduled_tasks'

export type ScheduleType = 'once' | 'daily' | 'interval' | 'cron'

export interface ScheduledTask {
  id: string
  title: string
  prompt: string
  directory?: string
  agent?: string
  model?: { id: string; providerID: string; variant?: string }
  scheduleType: ScheduleType
  delayMs?: number
  dailyTime?: string // Format: "HH:MM" (e.g. "09:00")
  intervalMinutes?: number
  cronExpr?: string
  enabled: boolean
  createdAt: number
  lastRun?: number
  nextRun: number
  lastStatus?: 'success' | 'error' | 'running'
  lastError?: string
  lastSessionId?: string
}

export interface ScheduleConfig {
  delayMs?: number
  dailyTime?: string
  intervalMinutes?: number
  cronExpr?: string
}

/**
 * Calculates next epoch run timestamp based on schedule type and configuration
 */
export function calculateNextRun(
  type: ScheduleType,
  config: ScheduleConfig,
  baseTime: number = Date.now()
): number {
  if (type === 'once') {
    const delay = config.delayMs && config.delayMs > 0 ? config.delayMs : 3600_000 // default 1 hour
    return baseTime + delay
  }

  if (type === 'interval') {
    const minutes = config.intervalMinutes && config.intervalMinutes > 0 ? config.intervalMinutes : 60
    return baseTime + minutes * 60_000
  }

  if (type === 'daily') {
    const [hourStr, minStr] = (config.dailyTime || '09:00').split(':')
    const targetHour = parseInt(hourStr, 10) || 9
    const targetMin = parseInt(minStr, 10) || 0

    const targetDate = new Date(baseTime)
    targetDate.setHours(targetHour, targetMin, 0, 0)

    // If target time today has already elapsed, advance to tomorrow
    if (targetDate.getTime() <= baseTime) {
      targetDate.setDate(targetDate.getDate() + 1)
    }

    return targetDate.getTime()
  }

  if (type === 'cron') {
    // Simple 5-field cron parser for standard daily/hourly/interval expressions
    const expr = (config.cronExpr || '0 9 * * *').trim()
    const parts = expr.split(/\s+/)
    if (parts.length === 5) {
      const [minutePart, hourPart] = parts
      // Daily at specific hour:minute: e.g. "0 9 * * *"
      if (!minutePart.includes('*') && !hourPart.includes('*')) {
        const m = parseInt(minutePart, 10) || 0
        const h = parseInt(hourPart, 10) || 0
        const targetDate = new Date(baseTime)
        targetDate.setHours(h, m, 0, 0)
        if (targetDate.getTime() <= baseTime) {
          targetDate.setDate(targetDate.getDate() + 1)
        }
        return targetDate.getTime()
      }
      // Every N minutes: e.g. "*/30 * * * *"
      if (minutePart.startsWith('*/')) {
        const step = parseInt(minutePart.slice(2), 10) || 30
        return baseTime + step * 60_000
      }
    }
    // Fallback: 1 day later
    return baseTime + 86400_000
  }

  return baseTime + 3600_000
}

/**
 * Returns human-readable countdown string to next run
 */
export function formatCountdown(
  nextRun: number,
  now: number = Date.now(),
  isZh: boolean = true
): string {
  const diff = nextRun - now
  if (diff <= 0) {
    return isZh ? '即将执行' : 'Due now'
  }

  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) {
    return isZh ? `${seconds} 秒后` : `in ${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return isZh ? `${minutes} 分钟后` : `in ${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60
  if (hours < 24) {
    if (remMinutes === 0) {
      return isZh ? `${hours} 小时后` : `in ${hours}h`
    }
    return isZh ? `${hours} 小时 ${remMinutes} 分钟后` : `in ${hours}h ${remMinutes}m`
  }

  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  if (remHours === 0) {
    return isZh ? `${days} 天后` : `in ${days}d`
  }
  return isZh ? `${days} 天 ${remHours} 小时后` : `in ${days}d ${remHours}h`
}

/**
 * Evaluates whether a scheduled task should trigger right now
 */
export function shouldRunTask(task: ScheduledTask, now: number = Date.now()): boolean {
  return Boolean(task.enabled && task.nextRun > 0 && now >= task.nextRun)
}

/**
 * Advances task state after successful or initiated execution
 */
export function advanceTaskAfterRun(task: ScheduledTask, runTime: number = Date.now()): ScheduledTask {
  if (task.scheduleType === 'once') {
    return {
      ...task,
      enabled: false,
      lastRun: runTime,
      nextRun: 0,
      lastStatus: 'success',
    }
  }

  const nextRun = calculateNextRun(
    task.scheduleType,
    {
      delayMs: task.delayMs,
      dailyTime: task.dailyTime,
      intervalMinutes: task.intervalMinutes,
      cronExpr: task.cronExpr,
    },
    runTime
  )

  return {
    ...task,
    lastRun: runTime,
    nextRun,
    lastStatus: 'success',
  }
}

/**
 * Reads scheduled tasks from storage safely
 */
export function getScheduledTasks(storage?: Storage): ScheduledTask[] {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    if (!store) return []
    const raw = store.getItem(SCHEDULED_TASKS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('Failed to read scheduled tasks from storage:', err)
    return []
  }
}

/**
 * Persists scheduled tasks to storage safely
 */
export function saveScheduledTasks(tasks: ScheduledTask[], storage?: Storage): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    if (!store) return
    store.setItem(SCHEDULED_TASKS_STORAGE_KEY, JSON.stringify(tasks))
  } catch (err) {
    console.error('Failed to save scheduled tasks to storage:', err)
  }
}

/**
 * Adds a new scheduled task
 */
export function addScheduledTask(
  input: Omit<ScheduledTask, 'id' | 'createdAt' | 'nextRun'>,
  storage?: Storage
): ScheduledTask {
  const current = getScheduledTasks(storage)
  const now = Date.now()
  const nextRun = calculateNextRun(
    input.scheduleType,
    {
      delayMs: input.delayMs,
      dailyTime: input.dailyTime,
      intervalMinutes: input.intervalMinutes,
      cronExpr: input.cronExpr,
    },
    now
  )

  const newTask: ScheduledTask = {
    ...input,
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    nextRun,
  }

  saveScheduledTasks([newTask, ...current], storage)
  return newTask
}

/**
 * Updates an existing scheduled task
 */
export function updateScheduledTask(
  taskId: string,
  patch: Partial<ScheduledTask>,
  storage?: Storage
): ScheduledTask | null {
  const current = getScheduledTasks(storage)
  let updatedTask: ScheduledTask | null = null

  const updatedList = current.map((t) => {
    if (t.id === taskId) {
      const merged = { ...t, ...patch }
      // If schedule configuration or enabled changed, recalculate nextRun
      if (
        (patch.scheduleType && patch.scheduleType !== t.scheduleType) ||
        patch.dailyTime !== undefined ||
        patch.intervalMinutes !== undefined ||
        patch.delayMs !== undefined ||
        (patch.enabled === true && !t.enabled)
      ) {
        merged.nextRun = calculateNextRun(
          merged.scheduleType,
          {
            delayMs: merged.delayMs,
            dailyTime: merged.dailyTime,
            intervalMinutes: merged.intervalMinutes,
            cronExpr: merged.cronExpr,
          },
          Date.now()
        )
      }
      updatedTask = merged
      return merged
    }
    return t
  })

  if (updatedTask) {
    saveScheduledTasks(updatedList, storage)
  }
  return updatedTask
}

/**
 * Deletes a scheduled task
 */
export function deleteScheduledTask(taskId: string, storage?: Storage): void {
  const current = getScheduledTasks(storage)
  const filtered = current.filter((t) => t.id !== taskId)
  saveScheduledTasks(filtered, storage)
}
