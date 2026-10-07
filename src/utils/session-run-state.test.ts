import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isRunningStatus, pickSessionRunStatus, runChrome, sessionStatusFromTable } from './session-run-state'

describe('pickSessionRunStatus', () => {
  const table = {
    ses_live: { type: 'busy' },
    ses_retry: { type: 'retry', attempt: 2, message: 'again', next: 50 },
    ses_done: { type: 'idle' },
    ses_junk: { type: 'nope' },
  }

  it('reads busy and retry for the requested session only', () => {
    assert.deepEqual(pickSessionRunStatus(table, 'ses_live'), { type: 'busy' })
    assert.deepEqual(pickSessionRunStatus(table, 'ses_retry'), {
      type: 'retry',
      attempt: 2,
      message: 'again',
      next: 50,
    })
    assert.equal(isRunningStatus(pickSessionRunStatus(table, 'ses_live')), true)
    assert.equal(isRunningStatus(pickSessionRunStatus(table, 'ses_retry')), true)
  })

  it('treats an explicit idle, a missing id, and a bad payload as not running', () => {
    assert.deepEqual(pickSessionRunStatus(table, 'ses_done'), { type: 'idle' })
    assert.equal(pickSessionRunStatus(table, 'ses_gone'), null)
    assert.deepEqual(pickSessionRunStatus(table, 'ses_junk'), { type: 'idle' })
    assert.equal(pickSessionRunStatus(null, 'ses_live'), null)
    assert.equal(pickSessionRunStatus([], 'ses_live'), null)
    assert.equal(isRunningStatus(null), false)
    assert.equal(isRunningStatus({ type: 'idle' }), false)
  })

  it('treats a live map that omits the id as idle, and a bad body as unknown', () => {
    assert.deepEqual(sessionStatusFromTable({}, 'ses_after_reboot'), { type: 'idle' })
    assert.deepEqual(sessionStatusFromTable({ ses_other: { type: 'busy' } }, 'ses_done'), { type: 'idle' })
    assert.deepEqual(sessionStatusFromTable({ ses_live: { type: 'busy' } }, 'ses_live'), { type: 'busy' })
    assert.equal(sessionStatusFromTable(null, 'ses_live'), null)
    assert.equal(sessionStatusFromTable('nope', 'ses_live'), null)
  })

  it('hides finished and retry chrome until the daemon answers', () => {
    assert.equal(runChrome(false, { type: 'idle' }), 'confirming')
    assert.equal(runChrome(false, { type: 'retry', attempt: 4, message: 'Database error' }), 'confirming')
    assert.equal(runChrome(true, { type: 'busy' }), 'running')
    assert.equal(runChrome(true, { type: 'retry', attempt: 1, message: 'x' }), 'running')
    assert.equal(runChrome(true, { type: 'idle' }), 'settled')
  })
})
