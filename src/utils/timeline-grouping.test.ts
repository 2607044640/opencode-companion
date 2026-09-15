import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Message } from '../types/opencode'
import { groupTimelineMessages } from './timeline-grouping'

describe('Timeline Grouping Unit Tests', () => {
  test('groups contiguous assistant messages following a user message', () => {
    const messages: Message[] = [
      {
        info: {
          id: 'u1',
          sessionID: 'ses_1',
          role: 'user',
          time: { created: 1000 },
        },
        parts: [{ id: 'p_u1', sessionID: 'ses_1', messageID: 'u1', type: 'text', text: 'Hello' }],
      },
      {
        info: {
          id: 'a1',
          sessionID: 'ses_1',
          role: 'assistant',
          agent: 'Sisyphus',
          modelID: 'grok-4.6',
          time: { created: 2000, completed: 5000 },
          tokens: { input: 100, output: 50, reasoning: 20, cache: { read: 0, write: 0 } },
        },
        parts: [
          { id: 't1', sessionID: 'ses_1', messageID: 'a1', type: 'tool', tool: 'read' },
          { id: 'txt1', sessionID: 'ses_1', messageID: 'a1', type: 'text', text: 'Inspecting...' },
        ],
      },
      {
        info: {
          id: 'a2',
          sessionID: 'ses_1',
          role: 'assistant',
          agent: 'Sisyphus',
          modelID: 'grok-4.6',
          time: { created: 5000, completed: 8000 },
          tokens: { input: 150, output: 80, reasoning: 30, cache: { read: 0, write: 0 } },
        },
        parts: [
          { id: 't2', sessionID: 'ses_1', messageID: 'a2', type: 'tool', tool: 'write' },
          { id: 'txt2', sessionID: 'ses_1', messageID: 'a2', type: 'text', text: 'Done.' },
        ],
      },
    ]

    const grouped = groupTimelineMessages(messages)
    assert.equal(grouped.length, 2)
    assert.equal(grouped[0].type, 'user')
    assert.equal(grouped[1].type, 'assistant')

    const asst = grouped[1]
    if (asst.type === 'assistant') {
      assert.equal(asst.messages.length, 2)
      assert.deepEqual(asst.allMessageIds, ['a1', 'a2'])
      assert.equal(asst.primaryMessage.info.id, 'a2')
      assert.equal(asst.compositeMessage.parts.length, 4)
      assert.equal(asst.compositeMessage.info.time.created, 2000)
      assert.equal(asst.compositeMessage.info.time.completed, 8000)
      assert.equal(asst.compositeMessage.info.tokens?.input, 250)
      assert.equal(asst.compositeMessage.info.tokens?.output, 130)
      assert.equal(asst.compositeMessage.info.tokens?.reasoning, 50)
    }
  })

  test('keeps separate assistant turns when separated by user turns', () => {
    const messages: Message[] = [
      {
        info: { id: 'u1', sessionID: 's', role: 'user', time: { created: 1 } },
        parts: [],
      },
      {
        info: { id: 'a1', sessionID: 's', role: 'assistant', time: { created: 2 } },
        parts: [],
      },
      {
        info: { id: 'u2', sessionID: 's', role: 'user', time: { created: 3 } },
        parts: [],
      },
      {
        info: { id: 'a2', sessionID: 's', role: 'assistant', time: { created: 4 } },
        parts: [],
      },
    ]

    const grouped = groupTimelineMessages(messages)
    assert.equal(grouped.length, 4)
    assert.equal(grouped[0].type, 'user')
    assert.equal(grouped[1].type, 'assistant')
    assert.equal(grouped[2].type, 'user')
    assert.equal(grouped[3].type, 'assistant')
  })

  test('flushes and isolates system messages between assistant turns', () => {
    const messages: Message[] = [
      {
        info: { id: 'u1', sessionID: 's', role: 'user', time: { created: 1 } },
        parts: [],
      },
      {
        info: { id: 'a1', sessionID: 's', role: 'assistant', time: { created: 2 } },
        parts: [],
      },
      {
        info: { id: 'sys1', sessionID: 's', role: 'system', time: { created: 3 } },
        parts: [],
      },
      {
        info: { id: 'a2', sessionID: 's', role: 'assistant', time: { created: 4 } },
        parts: [],
      },
    ]

    const grouped = groupTimelineMessages(messages)
    assert.equal(grouped.length, 4)
    assert.equal(grouped[0].type, 'user')
    assert.equal(grouped[1].type, 'assistant')
    assert.equal(grouped[2].type, 'system')
    assert.equal(grouped[3].type, 'assistant')
  })

  test('flushes and splits assistant messages at revert boundary', () => {
    const messages: Message[] = [
      {
        info: { id: 'u1', sessionID: 's', role: 'user', time: { created: 1 } },
        parts: [],
      },
      {
        info: { id: 'a1', sessionID: 's', role: 'assistant', time: { created: 2 } },
        parts: [],
      },
      {
        info: { id: 'a2', sessionID: 's', role: 'assistant', time: { created: 3 } },
        parts: [],
      },
    ]

    // If a1 is the revert boundary, a1 and a2 should not be fused into a single bubble
    const grouped = groupTimelineMessages(messages, 'a1')
    assert.equal(grouped.length, 3)
    assert.equal(grouped[0].type, 'user')
    assert.equal(grouped[1].type, 'assistant')
    if (grouped[1].type === 'assistant') {
      assert.deepEqual(grouped[1].allMessageIds, ['a1'])
    }
    assert.equal(grouped[2].type, 'assistant')
    if (grouped[2].type === 'assistant') {
      assert.deepEqual(grouped[2].allMessageIds, ['a2'])
    }
  })
})
