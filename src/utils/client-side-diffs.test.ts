import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Message } from '../types/opencode'
import { computeClientSideDiffs, mergeRevertDiffs } from './client-side-diffs'

function userMsg(id: string): Message {
  return {
    info: { id, sessionID: 'ses_1', role: 'user', time: { created: 1 } },
    parts: [{ id: `p_${id}`, sessionID: 'ses_1', messageID: id, type: 'text', text: 'do it' }],
  }
}

describe('computeClientSideDiffs', () => {
  test('counts native edit oldString/newString instead of +0 -0', () => {
    const messages: Message[] = [
      userMsg('msg_user'),
      {
        info: { id: 'msg_asst', sessionID: 'ses_1', role: 'assistant', time: { created: 2 } },
        parts: [
          {
            id: 'p_edit',
            sessionID: 'ses_1',
            messageID: 'msg_asst',
            type: 'tool',
            tool: 'edit',
            state: {
              status: 'completed',
              input: {
                path: 'src/hooks/useChatStream.ts',
                oldString: 'const a = 1\nconst b = 2',
                newString: 'const a = 1\nconst b = 20\nconst c = 30',
              },
            },
          },
        ],
      },
    ]

    const diffs = computeClientSideDiffs(messages, 'msg_user')
    assert.equal(diffs.length, 1)
    assert.equal(diffs[0]?.file, 'useChatStream.ts')
    assert.equal(diffs[0]?.status, 'modified')
    assert.equal(diffs[0]?.additions > 0, true)
    assert.equal(diffs[0]?.deletions > 0, true)
    assert.notEqual(diffs[0]?.additions, 0)
    assert.notEqual(diffs[0]?.deletions, 0)
  })

  test('counts metadata.diff hunks when input has no additions field', () => {
    const messages: Message[] = [
      userMsg('msg_user'),
      {
        info: { id: 'msg_asst', sessionID: 'ses_1', role: 'assistant', time: { created: 2 } },
        parts: [
          {
            id: 'p_edit',
            sessionID: 'ses_1',
            messageID: 'msg_asst',
            type: 'tool',
            tool: 'edit',
            state: {
              status: 'completed',
              input: { filePath: 'src/App.tsx' },
              metadata: {
                diff: [
                  '--- a/src/App.tsx',
                  '+++ b/src/App.tsx',
                  '@@ -1,2 +1,3 @@',
                  ' keep',
                  '-old',
                  '+new',
                  '+extra',
                ].join('\n'),
              },
            },
          },
        ],
      },
    ]

    const diffs = computeClientSideDiffs(messages, 'msg_user')
    assert.equal(diffs[0]?.file, 'App.tsx')
    assert.equal(diffs[0]?.additions, 2)
    assert.equal(diffs[0]?.deletions, 1)
  })

  test('treats write as added with content line counts', () => {
    const messages: Message[] = [
      userMsg('msg_user'),
      {
        info: { id: 'msg_asst', sessionID: 'ses_1', role: 'assistant', time: { created: 2 } },
        parts: [
          {
            id: 'p_write',
            sessionID: 'ses_1',
            messageID: 'msg_asst',
            type: 'tool',
            tool: 'write',
            state: {
              status: 'completed',
              input: {
                path: '/mnt/desktop/atlas-test.txt',
                contents: 'line1\nline2\nline3',
              },
            },
          },
        ],
      },
    ]

    const diffs = computeClientSideDiffs(messages, 'msg_user')
    assert.equal(diffs[0]?.file, 'atlas-test.txt')
    assert.equal(diffs[0]?.status, 'added')
    assert.equal(diffs[0]?.additions, 3)
    assert.equal(diffs[0]?.deletions, 0)
  })
})

describe('mergeRevertDiffs', () => {
  test('fills daemon +0 -0 from client counts instead of leaving 0/0', () => {
    const merged = mergeRevertDiffs(
      [{ file: 'useChatStream.ts', status: 'modified', additions: 0, deletions: 0 }],
      [{ file: 'useChatStream.ts', status: 'modified', additions: 41, deletions: 37 }]
    )
    assert.equal(merged.length, 1)
    assert.equal(merged[0]?.additions, 41)
    assert.equal(merged[0]?.deletions, 37)
  })
})
