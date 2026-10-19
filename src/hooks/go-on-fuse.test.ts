import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Message, TodoItem } from '../types/opencode'
import { decideGoOn, GO_ON_MAX_PER_TURN, GO_ON_SILENCE_MS, type GoOnClock } from './go-on-fuse'

function assistant(overrides: {
  finish?: string
  error?: Message['info']['error']
  parts?: Message['parts']
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
    parts: overrides.parts ?? [{ id: 'p1', sessionID: 'ses_1', messageID: 'msg_a', type: 'text', text: 'partial' }],
  }
}

function clock(overrides: Partial<GoOnClock> = {}): GoOnClock {
  return {
    lastActivityAt: 0,
    now: 1_000,
    runKnown: true,
    daemonIdle: true,
    userAborted: false,
    sentThisTurn: 0,
    messages: [assistant({ finish: 'stop' })],
    todos: [],
    ...overrides,
  }
}

const openTodo: TodoItem = { id: 't1', title: 'still open', status: 'pending' }

describe('decideGoOn', () => {
  it('does not nudge a clean stop, even when a todo is still open', () => {
    const verdict = decideGoOn(clock({ todos: [openTodo] }))
    assert.deepEqual(verdict, { act: 'wait', reason: 'model_finished' })
  })

  it('does not treat a 3 second pause as death', () => {
    const verdict = decideGoOn(clock({
      daemonIdle: false,
      now: 3_000,
      messages: [assistant({})],
    }))
    assert.deepEqual(verdict, { act: 'wait', reason: 'still_running' })
  })

  it('nudges only after a long silence while the daemon still says busy', () => {
    const verdict = decideGoOn(clock({
      daemonIdle: false,
      now: GO_ON_SILENCE_MS,
      messages: [assistant({})],
    }))
    assert.deepEqual(verdict, { act: 'send', reason: 'silence' })
  })

  it('nudges when the relay attached an error and the turn is idle', () => {
    const verdict = decideGoOn(clock({
      messages: [assistant({
        finish: 'error',
        error: { name: 'APIError', data: { message: '504 Gateway Timeout', statusCode: 504 } },
      })],
    }))
    assert.deepEqual(verdict, { act: 'send', reason: 'relay_error' })
  })

  it('nudges a length cut that idle already closed', () => {
    const verdict = decideGoOn(clock({
      messages: [assistant({ finish: 'length' })],
    }))
    assert.deepEqual(verdict, { act: 'send', reason: 'cut_finish' })
  })

  it('nudges an idle turn whose tool never finished', () => {
    const verdict = decideGoOn(clock({
      messages: [assistant({
        parts: [{
          id: 'tool_1',
          sessionID: 'ses_1',
          messageID: 'msg_a',
          type: 'tool',
          tool: 'bash',
          state: { status: 'running' },
        }],
      })],
    }))
    assert.deepEqual(verdict, { act: 'send', reason: 'open_tool' })
  })

  it('does not nudge a user abort or a question waiting on the user', () => {
    assert.equal(decideGoOn(clock({ userAborted: true })).reason, 'user_abort')
    const asking = decideGoOn(clock({
      messages: [assistant({
        parts: [{
          id: 'tool_q',
          sessionID: 'ses_1',
          messageID: 'msg_a',
          type: 'tool',
          tool: 'question',
          state: { status: 'running' },
        }],
      })],
    }))
    assert.deepEqual(asking, { act: 'wait', reason: 'user_question' })
  })

  it('stops after the per-turn cap', () => {
    const verdict = decideGoOn(clock({
      sentThisTurn: GO_ON_MAX_PER_TURN,
      messages: [assistant({
        error: { name: 'APIError', data: { message: '502' } },
      })],
    }))
    assert.deepEqual(verdict, { act: 'wait', reason: 'cap' })
  })

  it('does not invent a nudge before status is known', () => {
    const verdict = decideGoOn(clock({
      runKnown: false,
      daemonIdle: false,
      now: GO_ON_SILENCE_MS * 2,
    }))
    assert.deepEqual(verdict, { act: 'wait', reason: 'status_unknown' })
  })

  it('leaves a settled idle with no finish alone, todos or not', () => {
    const verdict = decideGoOn(clock({
      messages: [assistant({})],
      todos: [openTodo],
    }))
    assert.deepEqual(verdict, { act: 'wait', reason: 'settled' })
  })
})
