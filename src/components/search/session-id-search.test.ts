import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { filterSessionsById } from './session-id-search'
import type { Session } from '../../types/opencode'

function mockSession(id: string, title: string, updated: number): Session {
  return {
    id,
    title,
    time: {
      created: updated - 1000,
      updated,
    },
  } as Session
}

describe('filterSessionsById', () => {
  const sampleSessions: Session[] = [
    mockSession('ses_eb1d8ed1cffefyK0NhqUWm6iiJ', '工具调用异常智能过滤方案', 1000),
    mockSession('ses_other1234567890abcdef', 'Map tool status rendering', 2000),
    mockSession('ses_alpha_999999999999', 'GPT-6 Astra接入审计与Token配置审查', 3000),
    mockSession('ses_beta_888888888888', 'ses_eb1d8ed1cffefyK0NhqUWm6iiJ in title', 4000),
  ]

  it('returns all sessions sorted by updated time descending on empty query', () => {
    const results = filterSessionsById(sampleSessions, '')
    assert.equal(results.length, 4)
    assert.equal(results[0].id, 'ses_beta_888888888888')
    assert.equal(results[1].id, 'ses_alpha_999999999999')
    assert.equal(results[2].id, 'ses_other1234567890abcdef')
    assert.equal(results[3].id, 'ses_eb1d8ed1cffefyK0NhqUWm6iiJ')
  })

  it('ranks exact session ID match at the top', () => {
    const results = filterSessionsById(sampleSessions, 'ses_eb1d8ed1cffefyK0NhqUWm6iiJ')
    assert.ok(results.length >= 1)
    assert.equal(results[0].id, 'ses_eb1d8ed1cffefyK0NhqUWm6iiJ')
  })

  it('finds session by ID prefix (e.g. ses_eb1d)', () => {
    const results = filterSessionsById(sampleSessions, 'ses_eb1d')
    assert.ok(results.length >= 1)
    assert.equal(results[0].id, 'ses_eb1d8ed1cffefyK0NhqUWm6iiJ')
  })

  it('finds session by middle hash fragment (e.g. yK0NhqUWm6iiJ)', () => {
    const results = filterSessionsById(sampleSessions, 'yK0NhqUWm6iiJ')
    assert.ok(results.length >= 1)
    assert.equal(results[0].id, 'ses_eb1d8ed1cffefyK0NhqUWm6iiJ')
  })

  it('handles case-insensitivity seamlessly (e.g. SES_EB1D8ED1)', () => {
    const results = filterSessionsById(sampleSessions, 'SES_EB1D8ED1')
    assert.ok(results.length >= 1)
    assert.equal(results[0].id, 'ses_eb1d8ed1cffefyK0NhqUWm6iiJ')
  })

  it('handles multi-token search for id fragments', () => {
    const results = filterSessionsById(sampleSessions, 'ses eb1d8ed1')
    assert.ok(results.length >= 1)
    assert.equal(results[0].id, 'ses_eb1d8ed1cffefyK0NhqUWm6iiJ')
  })

  it('falls back to matching title if session ID does not match directly', () => {
    const results = filterSessionsById(sampleSessions, 'Astra')
    assert.equal(results.length, 1)
    assert.equal(results[0].id, 'ses_alpha_999999999999')
  })

  it('returns empty array when query does not match any session ID or title', () => {
    const results = filterSessionsById(sampleSessions, 'non_existent_id_xyz_999')
    assert.equal(results.length, 0)
  })

  it('gracefully handles missing session IDs or titles without throwing', () => {
    const dirtySessions: Session[] = [
      { id: '', title: '' } as Session,
      { id: undefined, title: undefined } as any,
      mockSession('ses_valid_123', 'Valid session', 5000),
    ]
    const results = filterSessionsById(dirtySessions, 'valid')
    assert.equal(results.length, 1)
    assert.equal(results[0].id, 'ses_valid_123')
  })
})
