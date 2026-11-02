import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Message } from '../types/opencode'
import {
  SYSTEM_ABORT_ERROR_NAME,
  SYSTEM_ABORT_MESSAGE,
  EMPTY_RESPONSE_ERROR_NAME,
  MAX_AUTO_RECOVERY_ATTEMPTS,
  classifyEmptyIdleFuse,
  decideEmptyTurnAutoRetry,
  hasTurnContent,
  inspectCurrentTurnRecovery,
  isFatalNonRetryableError,
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

  it('auto-retries an empty response up to MAX_AUTO_RECOVERY_ATTEMPTS (5), then stops', () => {
    const first = decideEmptyTurnAutoRetry({
      fuseKind: 'empty_response',
      turnKey: 'plan the failover',
      attemptCount: 0,
      assistantHasError: false,
      turnHasAnyOutput: false,
    })
    assert.equal(first.retry, true)
    assert.equal(first.reason, 'empty_response')

    const fifth = decideEmptyTurnAutoRetry({
      fuseKind: 'system_abort',
      turnKey: 'plan the failover',
      attemptCount: 4,
      assistantHasError: false,
      turnHasAnyOutput: false,
    })
    assert.equal(fifth.retry, true)

    const sixth = decideEmptyTurnAutoRetry({
      fuseKind: 'system_abort',
      turnKey: 'plan the failover',
      attemptCount: MAX_AUTO_RECOVERY_ATTEMPTS,
      assistantHasError: false,
      turnHasAnyOutput: false,
    })
    assert.equal(sixth.retry, false)
    assert.equal(sixth.reason, 'cap_exceeded')
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

  it('auto-retries a 502 on an empty turn (0 tokens), but refuses retry if turnHasAnyOutput is true', () => {
    const empty502 = decideEmptyTurnAutoRetry({
      fuseKind: 'empty_response',
      turnKey: 'plan the failover',
      attemptCount: 0,
      assistantHasError: true,
      errorText: '502 Bad Gateway',
      turnHasAnyOutput: false,
    })
    assert.equal(empty502.retry, true)
    assert.equal(empty502.reason, 'empty_response')

    const partial502 = decideEmptyTurnAutoRetry({
      fuseKind: 'empty_response',
      turnKey: 'plan the failover',
      attemptCount: 0,
      assistantHasError: true,
      errorText: '502 Bad Gateway',
      turnHasAnyOutput: true,
    })
    assert.equal(partial502.retry, false)
    assert.equal(partial502.reason, 'not_empty')
  })

  it('refuses auto-retry on fatal non-retryable errors (context overflow, invalid API key)', () => {
    assert.equal(isFatalNonRetryableError('context_length_exceeded: max tokens'), true)
    assert.equal(isFatalNonRetryableError('502 Bad Gateway'), false)
    const fatalDecision = decideEmptyTurnAutoRetry({
      fuseKind: 'empty_response',
      turnKey: 'plan the failover',
      attemptCount: 0,
      assistantHasError: true,
      errorText: 'context_length_exceeded',
      turnHasAnyOutput: false,
    })
    assert.equal(fatalDecision.retry, false)
    assert.equal(fatalDecision.reason, 'fatal_error')
  })

  it('inspectCurrentTurnRecovery tracks output and go on count across a root user turn', () => {
    const msgs: Message[] = [
      {
        info: { id: 'u1', sessionID: 'ses_1', role: 'user', time: { created: 1 } },
        parts: [{ id: 'up1', sessionID: 'ses_1', messageID: 'u1', type: 'text', text: 'implement feature' }],
      },
      assistant({
        finish: 'error',
        parts: [{ id: 'ap1', sessionID: 'ses_1', messageID: 'msg_a', type: 'text', text: 'step 1 done' }],
      }),
      {
        info: { id: 'u2', sessionID: 'ses_1', role: 'user', time: { created: 2 } },
        parts: [{ id: 'up2', sessionID: 'ses_1', messageID: 'u2', type: 'text', text: 'go on' }],
      },
      assistant({
        finish: 'error',
        parts: [],
      }),
    ]
    const inspection = inspectCurrentTurnRecovery(msgs, 'go on')
    assert.equal(inspection.turnKey, 'implement feature')
    assert.equal(inspection.turnHasAnyOutput, true)
    assert.equal(inspection.goOnCount, 1)
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
