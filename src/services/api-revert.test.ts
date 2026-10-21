import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSession, api } from './api'

describe('Session Revert Normalization & Contract', () => {
  test('conversation-only stage falls back to standard revert when stage endpoint is unavailable', async () => {
    const original = globalThis.fetch
    const requests: string[] = []
    globalThis.fetch = async (input) => {
      requests.push(String(input))
      if (String(input).endsWith('/revert/stage')) {
        return new Response('stage unavailable', { status: 404 })
      }
      return new Response(JSON.stringify({ id: 'ses_1', revert: { messageID: 'msg_1' } }), { status: 200 })
    }
    try {
      const res = await api.revertSession('ses_1', 'msg_1', { files: false })
      assert.equal(res.id, 'ses_1')
      assert.equal(requests.length, 2)
      assert.ok(requests[0].endsWith('/revert/stage'))
      assert.ok(requests[1].endsWith('/revert'))
    } finally { globalThis.fetch = original }
  })
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
