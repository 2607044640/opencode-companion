import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {
  AntigravityRunningIndicator,
  SessionUnreadDot,
  SessionTrailingIndicator,
} from './SessionStatusIndicator'

describe('SessionStatusIndicator Component Suite', () => {
  it('exports AntigravityRunningIndicator function component', () => {
    assert.equal(typeof AntigravityRunningIndicator, 'function')
    const element = React.createElement(AntigravityRunningIndicator, { className: 'test-cls' })
    assert.ok(element)
    assert.equal(element.type, AntigravityRunningIndicator)
    assert.equal(element.props.className, 'test-cls')
  })

  it('exports SessionUnreadDot function component', () => {
    assert.equal(typeof SessionUnreadDot, 'function')
    const element = React.createElement(SessionUnreadDot, { title: '未读' })
    assert.ok(element)
    assert.equal(element.type, SessionUnreadDot)
    assert.equal(element.props.title, '未读')
  })

  it('SessionTrailingIndicator prioritizes running over unread over fallback', () => {
    // 1. Both isRunning and isUnread true -> Running indicator wins
    const runningElem = SessionTrailingIndicator({
      isRunning: true,
      isUnread: true,
      runningTitle: '工作中',
      unreadTitle: '未读',
      fallback: '10m',
    })
    assert.equal(runningElem.type, AntigravityRunningIndicator)
    assert.equal(runningElem.props.title, '工作中')

    // 2. Only isUnread true -> SessionUnreadDot wins
    const unreadElem = SessionTrailingIndicator({
      isRunning: false,
      isUnread: true,
      runningTitle: '工作中',
      unreadTitle: '未读',
      fallback: '10m',
    })
    assert.equal(unreadElem.type, SessionUnreadDot)
    assert.equal(unreadElem.props.title, '未读')

    // 3. Neither true -> Fallback rendered
    const fallbackElem = SessionTrailingIndicator({
      isRunning: false,
      isUnread: false,
      fallback: '10m',
    })
    assert.ok(fallbackElem)
    assert.equal(fallbackElem.props.children, '10m')
  })
})
