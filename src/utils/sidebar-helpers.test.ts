import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isSameOrSubdirectory,
  doesSessionBelongToProject,
  formatCompactTime,
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
})
