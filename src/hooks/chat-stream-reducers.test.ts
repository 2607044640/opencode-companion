import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Message } from '../types/opencode'
import {
  applyMessageUpdatedToMessages,
  applyPartDeltaToMessages,
  applyPartUpdatedToMessages,
  collectRetryDeletionIds,
  messageProgressSignature,
  preserveInFlightAssistantError,
  stampRelayErrorOnLastAssistant,
  stripAssistantErrors,
} from './chat-stream-reducers'

describe('chat-stream-reducers', () => {
  it('applies part delta to existing message and creates placeholder when missing', () => {
    const initial: Message[] = []
    const afterFirst = applyPartDeltaToMessages(initial, {
      sessionID: 'ses_1',
      messageID: 'msg_1',
      partID: 'p_1',
      field: 'text',
      delta: 'Hello ',
    })
    assert.equal(afterFirst.length, 1)
    assert.equal((afterFirst[0].parts[0] as any).text, 'Hello ')

    const afterSecond = applyPartDeltaToMessages(afterFirst, {
      sessionID: 'ses_1',
      messageID: 'msg_1',
      partID: 'p_1',
      field: 'text',
      delta: 'world',
    })
    assert.equal((afterSecond[0].parts[0] as any).text, 'Hello world')
  })

  it('replaces optimistic user message ID on message.updated and aligns part messageIDs', () => {
    const pendingRef = { current: 'usr_opt_1' as string | null }
    const prev: Message[] = [
      {
        info: { id: 'usr_opt_1', sessionID: 'ses_1', role: 'user', time: { created: 1 } },
        parts: [{ id: 'p1', sessionID: 'ses_1', messageID: 'usr_opt_1', type: 'text', text: 'hi', isOptimistic: true } as any],
      },
    ]
    const updated = applyMessageUpdatedToMessages(
      prev,
      { id: 'msg_real_1', sessionID: 'ses_1', role: 'user', time: { created: 2 } },
      pendingRef
    )
    assert.equal(pendingRef.current, null)
    assert.equal(updated[0].info.id, 'msg_real_1')
    assert.equal(updated[0].parts[0].messageID, 'msg_real_1')
  })

  it('replaces optimistic part on part.updated', () => {
    const prev: Message[] = [
      {
        info: { id: 'usr_opt_1', sessionID: 'ses_1', role: 'user', time: { created: 1 } },
        parts: [{ id: 'p_opt', sessionID: 'ses_1', messageID: 'usr_opt_1', type: 'text', text: 'hi', isOptimistic: true } as any],
      },
    ]
    const next = applyPartUpdatedToMessages(
      prev,
      { id: 'p_real', sessionID: 'ses_1', messageID: 'msg_real_1', type: 'text', text: 'hi' },
      'ses_1',
      'usr_opt_1'
    )
    assert.equal(next[0].parts.length, 1)
    assert.equal(next[0].parts[0].id, 'p_real')
  })

  it('stamps, preserves, and strips assistant errors cleanly', () => {
    const base: Message[] = [
      {
        info: { id: 'msg_a', sessionID: 'ses_1', role: 'assistant', time: { created: 1 } },
        parts: [],
      },
    ]
    const stamped = stampRelayErrorOnLastAssistant(base, { name: 'APIError', message: '502' })
    assert.equal(stamped[0].info.error?.name, 'APIError')

    const preserved = preserveInFlightAssistantError(base, stamped, true)
    assert.equal(preserved[0].info.error?.name, 'APIError')

    const stripped = stripAssistantErrors(preserved)
    assert.equal(stripped[0].info.error, undefined)
  })

  it('computes messageProgressSignature and collectRetryDeletionIds', () => {
    const localMsgs: Message[] = [
      {
        info: { id: 'usr_123', sessionID: 'ses_1', role: 'user', time: { created: 1 } },
        parts: [{ id: 'p1', sessionID: 'ses_1', messageID: 'usr_123', type: 'text', text: 'prompt' }],
      },
    ]
    const freshHistory: Message[] = [
      {
        info: { id: 'msg_u_real', sessionID: 'ses_1', role: 'user', time: { created: 1 } },
        parts: [{ id: 'p1', sessionID: 'ses_1', messageID: 'msg_u_real', type: 'text', text: 'prompt' }],
      },
      {
        info: { id: 'msg_a_empty', sessionID: 'ses_1', role: 'assistant', time: { created: 2 } },
        parts: [],
      },
    ]
    assert.notEqual(messageProgressSignature(localMsgs), messageProgressSignature(freshHistory))
    const ids = collectRetryDeletionIds(localMsgs, 0, freshHistory)
    assert.equal(ids.userIdsToDelete.has('msg_u_real'), true)
    assert.equal(ids.assistantIdsToDelete.has('msg_a_empty'), true)
    assert.equal(ids.allRemovedIds.has('usr_123'), true)
  })
})
