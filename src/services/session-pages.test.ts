import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  nextSessionListLimit,
  SESSION_LIST_CAP,
  SESSION_LIST_START,
  sessionListExhausted,
  sessionListPath,
} from './session-pages'

describe('session list pages', () => {
  it('treats a short page as the end of the list', () => {
    assert.equal(sessionListExhausted(593, 1000), true)
    assert.equal(sessionListExhausted(500, 500), false)
  })

  it('grows the limit until the cap', () => {
    assert.equal(nextSessionListLimit(SESSION_LIST_START), 1000)
    assert.equal(nextSessionListLimit(SESSION_LIST_CAP), SESSION_LIST_CAP)
  })

  it('does not send offset or before, which the daemon ignores', () => {
    assert.equal(sessionListPath(1000), '/session?limit=1000')
    assert.equal(
      sessionListPath(500, '/home/developer/projects/APISpace'),
      '/session?limit=500&directory=%2Fhome%2Fdeveloper%2Fprojects%2FAPISpace'
    )
  })
})
