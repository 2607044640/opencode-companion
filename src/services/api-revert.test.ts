import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSession, api } from './api'

describe('Session Revert Normalization & Contract', () => {
  test('normalizeSession handles session with active revert state', () => {
    const raw = {
      id: 'ses_12345',
      directory: '/workspace/projects/APISpace',
      title: 'Test Session',
      revert: {
        messageID: 'msg_98765',
        partID: 'prt_111',
        snapshot: 'snap_abc',
        diff: '--- a/file.ts\n+++ b/file.ts',
      },
    }

    const session = normalizeSession(raw)
    assert.equal(session.id, 'ses_12345')
    assert.ok(session.revert)
    assert.equal(session.revert?.messageID, 'msg_98765')
    assert.equal(session.revert?.partID, 'prt_111')
    assert.equal(session.revert?.snapshot, 'snap_abc')
    assert.equal(session.revert?.diff, '--- a/file.ts\n+++ b/file.ts')
  })

  test('normalizeSession handles session without revert or null revert', () => {
    const sessionNoRevert = normalizeSession({ id: 'ses_1' })
    assert.equal(sessionNoRevert.revert, undefined)

    const sessionNullRevert = normalizeSession({ id: 'ses_2', revert: null })
    assert.equal(sessionNullRevert.revert, undefined)

    const sessionEmptyRevert = normalizeSession({ id: 'ses_3', revert: {} })
    assert.equal(sessionEmptyRevert.revert, undefined)
  })

  test('api methods revertSession, unrevertSession, summarizeSession, and getSessionDiff exist and are functions', () => {
    assert.equal(typeof api.revertSession, 'function')
    assert.equal(typeof api.unrevertSession, 'function')
    assert.equal(typeof api.summarizeSession, 'function')
    assert.equal(typeof api.getSessionDiff, 'function')
  })
})

