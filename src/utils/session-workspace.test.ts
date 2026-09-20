import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Project, Session } from '../types/opencode'
import {
  formatProjectPill,
  getProjectAbbreviation,
  planSessionActivation,
  resolveCanonicalProjectId,
  resolveSessionProject,
  selectSearchCorpus,
  sessionBelongsToProjectFilter,
} from './session-workspace'

function makeProject(partial: Partial<Project> & Pick<Project, 'id' | 'worktree'>): Project {
  return {
    time: { created: 1, updated: 1 },
    ...partial,
  }
}

function makeSession(partial: Partial<Session> & Pick<Session, 'id'>): Session {
  return {
    slug: partial.id,
    projectID: 'global',
    directory: '',
    title: 'Untitled',
    agent: '',
    model: { id: '', providerID: '' },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    cost: 0,
    time: { created: 1, updated: 1 },
    ...partial,
  }
}

const apiSpace = makeProject({
  id: '53aa51360d45a83713b344d0fec6eb07e226c45b',
  name: 'APISpace',
  worktree: '/workspace/projects/APISpace',
  icon: { color: 'blue' },
  associatedIds: ['53aa51360d45a83713b344d0fec6eb07e226c45b', 'proj_api_alias'],
})

const aiSpace = makeProject({
  id: 'af780317cdbe4ad0e34fd43acd12b34ac3093bed',
  name: 'AISpace',
  worktree: '/workspace/projects/AISpace',
  icon: { color: 'cyan' },
  associatedIds: ['af780317cdbe4ad0e34fd43acd12b34ac3093bed'],
})

const obsidianDev = makeProject({
  id: 'e2502d34ac60eb75b1dc17feed238fddebf26c12',
  name: 'ObsidianDev',
  worktree: '/workspace/projects/ObsidianDev',
  icon: { color: 'magenta' },
  associatedIds: ['e2502d34ac60eb75b1dc17feed238fddebf26c12'],
})

const obsidianNote = makeProject({
  id: '28409f34b07f22051233c7be93e4dffc8034e88e',
  name: 'ObsidianNote',
  worktree: '/workspace/projects/ObsidianNote',
  icon: { color: 'purple' },
  associatedIds: ['28409f34b07f22051233c7be93e4dffc8034e88e'],
})

const projects: readonly Project[] = [apiSpace, aiSpace, obsidianDev, obsidianNote]

describe('session-workspace: resolveCanonicalProjectId', () => {
  it('resolves by projectID and associatedIds to the canonical project', () => {
    const byId = makeSession({
      id: 'ses_api',
      projectID: apiSpace.id,
      directory: '/tmp/unrelated',
    })
    assert.equal(resolveCanonicalProjectId(byId, projects), apiSpace.id)

    const byAlias = makeSession({
      id: 'ses_alias',
      projectID: 'proj_api_alias',
      directory: '',
    })
    assert.equal(resolveCanonicalProjectId(byAlias, projects), apiSpace.id)
  })

  it('resolves by directory / canonical workspace even when projectID is global', () => {
    const byDir = makeSession({
      id: 'ses_ai',
      projectID: 'global',
      directory: '/workspace/projects/AISpace/src',
    })
    assert.equal(resolveCanonicalProjectId(byDir, projects), aiSpace.id)

    const byWinPath = makeSession({
      id: 'ses_win',
      projectID: 'global',
      directory: 'C:/projects/ObsidianDev',
    })
    assert.equal(resolveCanonicalProjectId(byWinPath, projects), obsidianDev.id)
  })

  it('falls back to canonical fallbackId when the project list is empty', () => {
    const session = makeSession({
      id: 'ses_orphan',
      projectID: 'global',
      directory: '/workspace/projects/APISpace',
    })
    assert.equal(
      resolveCanonicalProjectId(session, []),
      '53aa51360d45a83713b344d0fec6eb07e226c45b'
    )
  })
})

describe('session-workspace: project pills', () => {
  it('formats distinct [Project] badges for every canonical workspace', () => {
    const apiSession = makeSession({
      id: 'ses_1',
      projectID: apiSpace.id,
      directory: apiSpace.worktree,
    })
    const aiSession = makeSession({
      id: 'ses_2',
      projectID: aiSpace.id,
      directory: aiSpace.worktree,
    })
    const devSession = makeSession({
      id: 'ses_3',
      projectID: obsidianDev.id,
      directory: obsidianDev.worktree,
    })

    assert.equal(formatProjectPill(resolveSessionProject(apiSession, projects).name), '[APISpace]')
    assert.equal(formatProjectPill(resolveSessionProject(aiSession, projects).name), '[AISpace]')
    assert.equal(formatProjectPill(resolveSessionProject(devSession, projects).name), '[ObsidianDev]')
  })

  it('generates automated 2-letter project abbreviations (ON, OD, AS, AI, NS)', () => {
    assert.equal(getProjectAbbreviation('ObsidianNote'), 'ON')
    assert.equal(getProjectAbbreviation('ObsidianDev'), 'OD')
    assert.equal(getProjectAbbreviation('APISpace'), 'AS')
    assert.equal(getProjectAbbreviation('AISpace'), 'AI')
    assert.equal(getProjectAbbreviation('NullSpace'), 'NS')
    assert.equal(getProjectAbbreviation('AICore'), 'AI')
    assert.equal(getProjectAbbreviation('my-cool-project'), 'MC')
    assert.equal(getProjectAbbreviation('api_space'), 'AS')
    assert.equal(getProjectAbbreviation('frontend'), 'FR')
    assert.equal(getProjectAbbreviation('C:\\Godot\\ObsidianNote'), 'ON')
    assert.equal(getProjectAbbreviation('/workspace/projects/APISpace'), 'AS')
    assert.equal(getProjectAbbreviation(''), '--')

    const apiSession = makeSession({
      id: 'ses_abbr_1',
      projectID: apiSpace.id,
      directory: apiSpace.worktree,
    })
    const aiSession = makeSession({
      id: 'ses_abbr_2',
      projectID: aiSpace.id,
      directory: aiSpace.worktree,
    })
    const devSession = makeSession({
      id: 'ses_abbr_3',
      projectID: obsidianDev.id,
      directory: obsidianDev.worktree,
    })
    const noteSession = makeSession({
      id: 'ses_abbr_4',
      projectID: obsidianNote.id,
      directory: obsidianNote.worktree,
    })

    assert.equal(resolveSessionProject(apiSession, projects).abbreviation, 'AS')
    assert.equal(resolveSessionProject(aiSession, projects).abbreviation, 'AI')
    assert.equal(resolveSessionProject(devSession, projects).abbreviation, 'OD')
    assert.equal(resolveSessionProject(noteSession, projects).abbreviation, 'ON')
  })
})

describe('session-workspace: keyword search ignores project filter', () => {
  const apiSession = makeSession({
    id: 'ses_api_kw',
    projectID: apiSpace.id,
    directory: apiSpace.worktree,
    title: 'gateway token rotation',
  })
  const aiSession = makeSession({
    id: 'ses_ai_kw',
    projectID: aiSpace.id,
    directory: aiSpace.worktree,
    title: 'gateway prompt audit',
  })
  const sessions = [apiSession, aiSession]

  it('honors the project dropdown when the query is empty', () => {
    const corpus = selectSearchCorpus(sessions, '', apiSpace.id, (session) =>
      sessionBelongsToProjectFilter(
        session,
        apiSpace.id,
        projects,
        resolveSessionProject(session, projects)
      )
    )
    assert.deepEqual(
      corpus.map((s) => s.id),
      ['ses_api_kw']
    )
  })

  it('searches every workspace when keywords are present even if a project filter is set', () => {
    const corpus = selectSearchCorpus(sessions, 'gateway', apiSpace.id, (session) =>
      sessionBelongsToProjectFilter(
        session,
        apiSpace.id,
        projects,
        resolveSessionProject(session, projects)
      )
    )
    assert.deepEqual(
      corpus.map((s) => s.id).sort(),
      ['ses_ai_kw', 'ses_api_kw']
    )
  })
})

describe('session-workspace: deep-link activation plan', () => {
  it('uses the local session and switches to its canonical project', () => {
    const local = makeSession({
      id: 'ses_local',
      projectID: 'global',
      directory: '/workspace/projects/AISpace',
      title: 'local hit',
    })
    const plan = planSessionActivation({
      sessionId: 'ses_local',
      localSessions: [local],
      fetchedSession: null,
      projects,
    })
    assert.equal(plan.session?.id, 'ses_local')
    assert.equal(plan.projectId, aiSpace.id)
    assert.equal(plan.shouldInsert, false)
  })

  it('inserts a fetched session that is missing from the local list', () => {
    const fetched = makeSession({
      id: 'ses_remote',
      projectID: obsidianDev.id,
      directory: obsidianDev.worktree,
      title: 'deep link',
    })
    const plan = planSessionActivation({
      sessionId: 'ses_remote',
      localSessions: [],
      fetchedSession: fetched,
      projects,
    })
    assert.equal(plan.session?.id, 'ses_remote')
    assert.equal(plan.projectId, obsidianDev.id)
    assert.equal(plan.shouldInsert, true)
  })

  it('returns a null plan when the session cannot be resolved', () => {
    const plan = planSessionActivation({
      sessionId: 'ses_missing',
      localSessions: [],
      fetchedSession: null,
      projects,
    })
    assert.equal(plan.session, null)
    assert.equal(plan.projectId, null)
    assert.equal(plan.shouldInsert, false)
  })
})
