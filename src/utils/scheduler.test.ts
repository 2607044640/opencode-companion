import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateNextRun,
  formatCountdown,
  shouldRunTask,
  advanceTaskAfterRun,
  getScheduledTasks,
  saveScheduledTasks,
  addScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  ScheduledTask,
  SCHEDULED_TASKS_STORAGE_KEY,
} from './scheduler'

function createMockStorage(initialData: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initialData))
  return {
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    get length() {
      return store.size
    },
  }
}

describe('Scheduled Tasks Engine (scheduler.ts)', () => {
  it('calculates once nextRun with default 1 hour and custom delay', () => {
    const base = 1700000000000
    // Default 1 hour = 3600000 ms
    const next1 = calculateNextRun('once', {}, base)
    assert.equal(next1, base + 3600000)

    // Custom 30 minutes
    const next2 = calculateNextRun('once', { delayMs: 1800000 }, base)
    assert.equal(next2, base + 1800000)
  })

  it('calculates daily 09:00 nextRun correctly before and after 09:00', () => {
    // 2026-09-13 08:00:00 UTC (local time target)
    const baseBefore = new Date(2026, 8, 13, 8, 0, 0).getTime()
    const expectedToday = new Date(2026, 8, 13, 9, 0, 0).getTime()
    const next1 = calculateNextRun('daily', { dailyTime: '09:00' }, baseBefore)
    assert.equal(next1, expectedToday)

    // 2026-09-13 10:00:00 (past 09:00) -> should be tomorrow 2026-09-14 09:00:00
    const baseAfter = new Date(2026, 8, 13, 10, 0, 0).getTime()
    const expectedTomorrow = new Date(2026, 8, 14, 9, 0, 0).getTime()
    const next2 = calculateNextRun('daily', { dailyTime: '09:00' }, baseAfter)
    assert.equal(next2, expectedTomorrow)
  })

  it('calculates interval nextRun accurately', () => {
    const base = 1700000000000
    const next = calculateNextRun('interval', { intervalMinutes: 120 }, base)
    assert.equal(next, base + 120 * 60000)
  })

  it('formats countdown human-friendly in Chinese and English', () => {
    const now = 1700000000000

    // Due now
    assert.equal(formatCountdown(now - 100, now, true), '即将执行')
    assert.equal(formatCountdown(now - 100, now, false), 'Due now')

    // 30 seconds
    assert.equal(formatCountdown(now + 30000, now, true), '30 秒后')
    assert.equal(formatCountdown(now + 30000, now, false), 'in 30s')

    // 25 minutes
    assert.equal(formatCountdown(now + 25 * 60000, now, true), '25 分钟后')
    assert.equal(formatCountdown(now + 25 * 60000, now, false), 'in 25m')

    // 2 hours 15 minutes
    assert.equal(formatCountdown(now + (2 * 3600 + 15 * 60) * 1000, now, true), '2 小时 15 分钟后')
    assert.equal(formatCountdown(now + (2 * 3600 + 15 * 60) * 1000, now, false), 'in 2h 15m')
  })

  it('evaluates shouldRunTask based on enabled and timestamp', () => {
    const now = 1700000000000
    const taskFuture: ScheduledTask = {
      id: 't1',
      title: 'Check',
      prompt: 'Check',
      scheduleType: 'once',
      enabled: true,
      createdAt: now,
      nextRun: now + 5000,
    }
    assert.equal(shouldRunTask(taskFuture, now), false)

    const taskDue: ScheduledTask = {
      ...taskFuture,
      nextRun: now - 10,
    }
    assert.equal(shouldRunTask(taskDue, now), true)

    const taskDisabled: ScheduledTask = {
      ...taskDue,
      enabled: false,
    }
    assert.equal(shouldRunTask(taskDisabled, now), false)
  })

  it('advances task after run for once and recurring schedules', () => {
    const runTime = 1700000000000
    const taskOnce: ScheduledTask = {
      id: 't1',
      title: 'Run once',
      prompt: 'Run once',
      scheduleType: 'once',
      delayMs: 3600000,
      enabled: true,
      createdAt: runTime - 1000,
      nextRun: runTime,
    }

    const advancedOnce = advanceTaskAfterRun(taskOnce, runTime)
    assert.equal(advancedOnce.enabled, false)
    assert.equal(advancedOnce.lastRun, runTime)
    assert.equal(advancedOnce.nextRun, 0)
    assert.equal(advancedOnce.lastStatus, 'success')

    const taskInterval: ScheduledTask = {
      id: 't2',
      title: 'Recurring',
      prompt: 'Recurring',
      scheduleType: 'interval',
      intervalMinutes: 60,
      enabled: true,
      createdAt: runTime - 1000,
      nextRun: runTime,
    }

    const advancedInterval = advanceTaskAfterRun(taskInterval, runTime)
    assert.equal(advancedInterval.enabled, true)
    assert.equal(advancedInterval.lastRun, runTime)
    assert.equal(advancedInterval.nextRun, runTime + 3600000)
  })

  it('performs CRUD operations on storage', () => {
    const storage = createMockStorage()
    assert.deepEqual(getScheduledTasks(storage), [])

    // Add task
    const added = addScheduledTask(
      {
        title: 'Daily Review',
        prompt: 'Review codebase changes',
        scheduleType: 'daily',
        dailyTime: '09:00',
        enabled: true,
      },
      storage
    )

    assert.ok(added.id)
    assert.equal(added.title, 'Daily Review')
    const list = getScheduledTasks(storage)
    assert.equal(list.length, 1)

    // Update task
    const updated = updateScheduledTask(added.id, { enabled: false }, storage)
    assert.equal(updated?.enabled, false)
    assert.equal(getScheduledTasks(storage)[0].enabled, false)

    // Delete task
    deleteScheduledTask(added.id, storage)
    assert.equal(getScheduledTasks(storage).length, 0)
  })
})
