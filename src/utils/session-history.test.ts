import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SessionHistoryStack } from './session-history'

describe('Session Navigation History Stack (session-history.ts)', () => {
  it('initializes empty or with an initial session', () => {
    const empty = new SessionHistoryStack()
    assert.equal(empty.current(), null)
    assert.equal(empty.canGoBack, false)
    assert.equal(empty.canGoForward, false)

    const withInit = new SessionHistoryStack(50, 's1')
    assert.equal(withInit.current(), 's1')
    assert.equal(withInit.canGoBack, false)
    assert.equal(withInit.canGoForward, false)
  })

  it('pushes sessions and navigates back/forward correctly', () => {
    const nav = new SessionHistoryStack()
    nav.push('s1')
    nav.push('s2')
    nav.push('s3')

    assert.equal(nav.current(), 's3')
    assert.equal(nav.canGoBack, true)
    assert.equal(nav.canGoForward, false)

    // Back to s2
    const prev1 = nav.back()
    assert.equal(prev1, 's2')
    assert.equal(nav.current(), 's2')
    assert.equal(nav.canGoBack, true)
    assert.equal(nav.canGoForward, true)

    // Back to s1
    const prev2 = nav.back()
    assert.equal(prev2, 's1')
    assert.equal(nav.current(), 's1')
    assert.equal(nav.canGoBack, false)
    assert.equal(nav.canGoForward, true)

    // Forward to s2
    const next1 = nav.forward()
    assert.equal(next1, 's2')
    assert.equal(nav.current(), 's2')

    // Forward to s3
    const next2 = nav.forward()
    assert.equal(next2, 's3')
    assert.equal(nav.current(), 's3')
    assert.equal(nav.canGoForward, false)
  })

  it('prunes forward history when pushing after navigating back', () => {
    const nav = new SessionHistoryStack()
    nav.push('s1')
    nav.push('s2')
    nav.push('s3')

    nav.back() // at s2
    nav.push('s4') // pushes s4, s3 should be pruned

    assert.equal(nav.current(), 's4')
    assert.equal(nav.canGoForward, false)
    assert.equal(nav.canGoBack, true)

    assert.equal(nav.back(), 's2')
    assert.equal(nav.back(), 's1')
  })

  it('ignores duplicate consecutive pushes', () => {
    const nav = new SessionHistoryStack()
    nav.push('s1')
    nav.push('s1')
    nav.push('s1')

    assert.equal(nav.items.length, 1)
    assert.equal(nav.canGoBack, false)
  })

  it('removes deleted sessions and updates cursor safely', () => {
    const nav = new SessionHistoryStack()
    nav.push('s1')
    nav.push('s2')
    nav.push('s3')

    // Delete s2 (preceding item)
    nav.remove('s2')
    assert.deepEqual(nav.items, ['s1', 's3'])
    assert.equal(nav.current(), 's3')
    assert.equal(nav.back(), 's1')

    // Delete current item s1
    nav.remove('s1')
    assert.deepEqual(nav.items, ['s3'])
    assert.equal(nav.current(), 's3')
  })
})
