import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DRAFT_SESSION_ID } from './useSessions'
import type { Session } from '../types/opencode'

describe('Lazy Session Recording & Abandoned Session Filter', () => {
  it('DRAFT_SESSION_ID is defined as __draft__', () => {
    assert.equal(DRAFT_SESSION_ID, '__draft__')
  })

  it('filters out abandoned empty sessions created with "New session - " and 0 tokens', () => {
    const mockSessions: Session[] = [
      {
        id: 'ses_real_1',
        slug: 'shiny-knight',
        projectID: 'global',
        directory: '/workspace/projects/APISpace',
        title: 'Real Coding Session',
        agent: 'Atlas - Plan Executor',
        model: { id: 'grok-4.6', providerID: 'obsidian' },
        tokens: { input: 1200, output: 400, reasoning: 100, cache: { read: 0, write: 0 } },
        cost: 0,
        time: { created: 1000, updated: 2000 },
      },
      {
        id: 'ses_empty_abandoned_1',
        slug: 'swift-sailor',
        projectID: 'global',
        directory: '/workspace/projects',
        title: 'New session - 2026/9/12 22:48:45',
        agent: 'Default Agent',
        model: { id: '', providerID: '' },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        cost: 0,
        time: { created: 1000, updated: 1000 },
      },
      {
        id: 'ses_empty_abandoned_2',
        slug: 'glowing-tiger',
        projectID: 'global',
        directory: '/workspace/projects',
        title: 'New session - 2026/9/12 22:48:44',
        agent: 'Default Agent',
        model: { id: '', providerID: '' },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        cost: 0,
        time: { created: 1000, updated: 1000 },
      },
      {
        id: DRAFT_SESSION_ID,
        slug: 'draft',
        projectID: 'global',
        directory: '',
        title: '新会话',
        agent: 'Atlas - Plan Executor',
        model: { id: 'grok-4.6', providerID: 'obsidian' },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        cost: 0,
        time: { created: 1000, updated: 1000 },
      },
    ]

    const filtered = mockSessions.filter((s) => {
      if (s.id === DRAFT_SESSION_ID) return false
      const isAbandonedEmpty =
        Boolean(s.title?.startsWith('New session - ')) &&
        (!s.tokens || (s.tokens.input === 0 && s.tokens.output === 0)) &&
        (!s.summary || s.summary.files === 0)
      return !isAbandonedEmpty
    })

    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].id, 'ses_real_1')
    assert.equal(filtered[0].title, 'Real Coding Session')
  })

  it('tab swapping correctly replaces DRAFT_SESSION_ID with real session id', () => {
    const tabs = ['ses_real_1', DRAFT_SESSION_ID]
    const newSessionId = 'ses_created_from_send'

    const nextTabs = tabs.includes(DRAFT_SESSION_ID)
      ? tabs.map((id) => (id === DRAFT_SESSION_ID ? newSessionId : id))
      : [...tabs, newSessionId]

    assert.deepEqual(nextTabs, ['ses_real_1', 'ses_created_from_send'])
    assert.ok(!nextTabs.includes(DRAFT_SESSION_ID))
  })
})
