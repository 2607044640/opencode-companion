import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isSameOrSubdirectory,
  doesSessionBelongToProject,
  formatCompactTime,
  DEFAULT_FOLDER_LIMIT,
  FOLDER_PAGE_STEP,
  getVisibleSessions,
  calculateNextLimit,
} from './sidebar-helpers'
import type { Project, Session } from '../types/opencode'

describe('Sidebar Helpers (sidebar-helpers.ts)', () => {
  it('detects directory and subdirectories correctly', () => {
    assert.equal(isSameOrSubdirectory('C:/APISpace', 'C:/APISpace'), true)
    assert.equal(isSameOrSubdirectory('C:/APISpace', 'C:/APISpace/sub/dir'), true)
    assert.equal(isSameOrSubdirectory('C:/APISpace', 'C:/ObsidianDev'), false)
    assert.equal(isSameOrSubdirectory('/home/developer/projects/APISpace', 'C:/APISpace'), true)
  })

  it('matches session to project by worktree and projectID', () => {
    const project: Project = {
      id: 'proj_api',
      worktree: '/home/developer/projects/APISpace',
      name: 'APISpace',
      associatedIds: ['proj_api_alias'],
    }

    const matchingSession1: Session = {
      id: 'ses_1',
      projectID: 'proj_api',
      title: 'Session 1',
    }
    assert.equal(doesSessionBelongToProject(matchingSession1, project), true)

    const matchingSession2: Session = {
      id: 'ses_2',
      directory: '/home/developer/projects/APISpace/backend',
      title: 'Session 2',
    }
    assert.equal(doesSessionBelongToProject(matchingSession2, project), true)

    const unmatchedSession: Session = {
      id: 'ses_3',
      projectID: 'other_proj',
      directory: '/home/developer/projects/AISpace',
      title: 'Session 3',
    }
    assert.equal(doesSessionBelongToProject(unmatchedSession, project), false)
  })

  it('formats compact relative time accurately', () => {
    const now = 1700000000000
    // 30s ago -> now
    assert.equal(formatCompactTime(now - 30000, now), 'now')
    // 15m ago -> 15m
    assert.equal(formatCompactTime(now - 15 * 60000, now), '15m')
    // 8h ago -> 8h
    assert.equal(formatCompactTime(now - 8 * 3600000, now), '8h')
    // 2d ago -> 2d
    assert.equal(formatCompactTime(now - 2 * 86400000, now), '2d')
    // 60d ago -> 2mo
    assert.equal(formatCompactTime(now - 60 * 86400000, now), '2mo')
    // 400d ago -> 1y
    assert.equal(formatCompactTime(now - 400 * 86400000, now), '1y')
  })

  it('verifies folder pagination default limit is 7 and step is 5', () => {
    assert.equal(DEFAULT_FOLDER_LIMIT, 7)
    assert.equal(FOLDER_PAGE_STEP, 5)
  })

  it('returns all items without hasMore when items <= 7', () => {
    const items = ['s1', 's2', 's3', 's4', 's5']
    const result = getVisibleSessions(items, 7)

    assert.equal(result.visibleItems.length, 5)
    assert.deepEqual(result.visibleItems, items)
    assert.equal(result.hasMore, false)
    assert.equal(result.remaining, 0)
    assert.equal(result.nextStep, 0)
  })

  it('returns exactly 7 items and indicates 1 remaining when items = 8', () => {
    const items = Array.from({ length: 8 }, (_, i) => `session-${i + 1}`)
    const result = getVisibleSessions(items, 7)

    assert.equal(result.visibleItems.length, 7)
    assert.equal(result.hasMore, true)
    assert.equal(result.remaining, 1)
    assert.equal(result.nextStep, 1)
  })

  it('handles large project list (e.g. 205 sessions from APISpace screenshot) with progressive +5', () => {
    const items = Array.from({ length: 205 }, (_, i) => `session-${i + 1}`)
    // Initial render: 7 items, 198 remaining, next step 5
    const result0 = getVisibleSessions(items, 7)
    assert.equal(result0.visibleItems.length, 7)
    assert.equal(result0.hasMore, true)
    assert.equal(result0.remaining, 198)
    assert.equal(result0.nextStep, 5)

    // Click 1: limit 12, 193 remaining, next step 5
    const nextLimit1 = calculateNextLimit(7)
    assert.equal(nextLimit1, 12)
    const result1 = getVisibleSessions(items, nextLimit1)
    assert.equal(result1.visibleItems.length, 12)
    assert.equal(result1.remaining, 193)
    assert.equal(result1.nextStep, 5)

    // Click 2: limit 17, 188 remaining, next step 5
    const nextLimit2 = calculateNextLimit(nextLimit1)
    assert.equal(nextLimit2, 17)
    const result2 = getVisibleSessions(items, nextLimit2)
    assert.equal(result2.visibleItems.length, 17)
    assert.equal(result2.remaining, 188)
    assert.equal(result2.nextStep, 5)
  })

  it('handles boundary when remaining items is less than step 5', () => {
    const items = Array.from({ length: 14 }, (_, i) => `session-${i + 1}`)
    // Limit 12 -> 2 remaining, next step 2
    const result = getVisibleSessions(items, 12)
    assert.equal(result.visibleItems.length, 12)
    assert.equal(result.hasMore, true)
    assert.equal(result.remaining, 2)
    assert.equal(result.nextStep, 2)

    // Next limit 17 -> all 14 returned, hasMore false
    const nextLimit = calculateNextLimit(12)
    const finalResult = getVisibleSessions(items, nextLimit)
    assert.equal(finalResult.visibleItems.length, 14)
    assert.equal(finalResult.hasMore, false)
    assert.equal(finalResult.remaining, 0)
    assert.equal(finalResult.nextStep, 0)
  })
})
