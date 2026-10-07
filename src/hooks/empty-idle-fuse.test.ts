import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Message } from '../types/opencode'
import {
  SYSTEM_ABORT_ERROR_NAME,
  SYSTEM_ABORT_MESSAGE,
  EMPTY_RESPONSE_ERROR_NAME,
  classifyEmptyIdleFuse,
  decideEmptyTurnAutoRetry,
  hasTurnContent,
  userTurnKey,
} from './empty-idle-fuse'

function assistant(overrides: {
  readonly finish?: string
  readonly parts?: Message['parts']
  readonly error?: Message['info']['error']
}): Message {
  return {
    info: {
      id: 'msg_a',
      sessionID: 'ses_1',
      role: 'assistant',
      time: { created: 1 },
      finish: overrides.finish,
      error: overrides.error,
    },
    parts: overrides.parts ?? [],
  }
}

describe('empty-idle-fuse', () => {
  it('classifies empty non-abort idle as empty_response', () => {
    const verdict = classifyEmptyIdleFuse({
      lastMessage: assistant({ finish: 'stop', parts: [] }),
      userAborted: false,
    })
    assert.equal(verdict.kind, 'empty_response')
    if (verdict.kind !== 'empty_response') return
    assert.equal(verdict.errorName, EMPTY_RESPONSE_ERROR_NAME)
  })

  it('classifies empty abort without user intent as system_abort', () => {
    const verdict = classifyEmptyIdleFuse({
      lastMessage: assistant({ finish: 'abort', parts: [] }),
      userAborted: false,
    })
    assert.equal(verdict.kind, 'system_abort')
    if (verdict.kind !== 'system_abort') return
    assert.equal(verdict.errorName, SYSTEM_ABORT_ERROR_NAME)
    assert.equal(verdict.message, SYSTEM_ABORT_MESSAGE)
  })

  it('does not attach an error when the user initiated abort', () => {
    const verdict = classifyEmptyIdleFuse({
      lastMessage: assistant({ finish: 'abort', parts: [] }),
      userAborted: true,
    })
    assert.equal(verdict.kind, 'user_abort')
  })

  it('ignores abort when the turn already has content and no repetition', () => {
    const msg = assistant({
      finish: 'abort',
      parts: [
        {
          id: 'p1',
          sessionID: 'ses_1',
          messageID: 'msg_a',
          type: 'text',
          text: 'partial answer that is normal and not repeating',
        },
      ],
    })
    assert.equal(hasTurnContent(msg), true)
    const verdict = classifyEmptyIdleFuse({ lastMessage: msg, userAborted: false })
    assert.equal(verdict.kind, 'none')
  })

  it('classifies a stopped short cycle as repetition_loop', () => {
    const block = [
      '正在确认所有修改已完成。',
      '所有修改已完成。',
      '正在确认测试通过。',
      '测试通过。',
    ].join('\n')
    const msg = assistant({
      finish: 'stop',
      parts: [
        {
          id: 'p1',
          sessionID: 'ses_1',
          messageID: 'msg_a',
          type: 'text',
          text: (block + '\n').repeat(3),
        },
      ],
    })
    const verdict = classifyEmptyIdleFuse({ lastMessage: msg, userAborted: false })
    assert.equal(verdict.kind, 'repetition_loop')
  })

  it('classifies aborted turn with repetition loop as repetition_loop', () => {
    const p =
      'Let me start by inspecting App.tsx for setSelectedProjectId usage. I will grep for setSelectedProjectId in App.tsx.'
    const msg = assistant({
      finish: 'abort',
      parts: [
        {
          id: 'p1',
          sessionID: 'ses_1',
          messageID: 'msg_a',
          type: 'text',
          text: (p + '\n\n').repeat(4),
        },
      ],
    })
    assert.equal(hasTurnContent(msg), true)
    const verdict = classifyEmptyIdleFuse({ lastMessage: msg, userAborted: false })
    assert.equal(verdict.kind, 'repetition_loop')
  })

  it('auto-retries an empty response once, then stops on the same prompt', () => {
    const first = decideEmptyTurnAutoRetry({
      fuseKind: 'empty_response',
      turnKey: 'plan the failover',
      alreadyRetriedTurnKey: null,
      assistantHasError: false,
    })
    assert.equal(first.retry, true)
    assert.equal(first.reason, 'empty_response')
    const second = decideEmptyTurnAutoRetry({
      fuseKind: 'system_abort',
      turnKey: 'plan the failover',
      alreadyRetriedTurnKey: 'plan the failover',
      assistantHasError: false,
    })
    assert.equal(second.retry, false)
    assert.equal(second.reason, 'already_retried')
  })

  it('keys the latch by user text, not the message id retry deletes', () => {
    const before = userTurnKey([
      {
        info: { id: 'usr_old', sessionID: 'ses_1', role: 'user', time: { created: 1 } },
        parts: [{ id: 'p', sessionID: 'ses_1', messageID: 'usr_old', type: 'text', text: 'same prompt' }],
      },
    ])
    const after = userTurnKey([
      {
        info: { id: 'usr_new', sessionID: 'ses_1', role: 'user', time: { created: 2 } },
        parts: [{ id: 'p2', sessionID: 'ses_1', messageID: 'usr_new', type: 'text', text: 'same prompt' }],
      },
    ])
    assert.equal(before, 'same prompt')
    assert.equal(after, before)
  })

  it('does not auto-retry a 502 that already has an error body', () => {
    const decision = decideEmptyTurnAutoRetry({
      fuseKind: 'empty_response',
      turnKey: 'plan the failover',
      alreadyRetriedTurnKey: null,
      assistantHasError: true,
    })
    assert.equal(decision.retry, false)
    assert.equal(decision.reason, 'has_error_body')
  })

  it('does not auto-retry a repetition loop', () => {
    const decision = decideEmptyTurnAutoRetry({
      fuseKind: 'repetition_loop',
      turnKey: 'plan the failover',
      alreadyRetriedTurnKey: null,
      assistantHasError: false,
    })
    assert.equal(decision.retry, false)
    assert.equal(decision.reason, 'not_empty')
  })

  it('returns none when last message is not assistant', () => {
    const verdict = classifyEmptyIdleFuse({
      lastMessage: {
        info: {
          id: 'msg_u',
          sessionID: 'ses_1',
          role: 'user',
          time: { created: 1 },
        },
        parts: [],
      },
      userAborted: false,
    })
    assert.equal(verdict.kind, 'none')
  })
})
