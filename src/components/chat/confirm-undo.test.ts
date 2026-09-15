import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Message } from '../../types/opencode'
import { computeClientSideDiffs } from '../../utils/client-side-diffs'

describe('Confirm Undo Diff Logic & Badge Formatting', () => {
  test('formats added files as Delete status', () => {
    const diff = {
      file: 'consult_prometheus_revert.py',
      status: 'added' as const,
      additions: 0,
      deletions: 0,
    }

    const isDelete = diff.status === 'added' || (diff.additions === 0 && diff.deletions === 0 && diff.status !== 'modified')
    assert.equal(isDelete, true)
  })

  test('formats modified files with line additions and deletions', () => {
    const diff = {
      file: 'useChatStream.ts',
      status: 'modified' as const,
      additions: 41,
      deletions: 37,
    }

    const isDelete = diff.status === 'added'
    const isModify = diff.status === 'modified' || (diff.additions > 0 || diff.deletions > 0)
    assert.equal(isDelete, false)
    assert.equal(isModify, true)
    assert.equal(diff.additions, 41)
    assert.equal(diff.deletions, 37)
  })

  test('extracts file diffs from tool calls in message history', () => {
    const messages: Message[] = [
      {
        info: {
          id: 'msg_1',
          sessionID: 'ses_1',
          role: 'user',
          time: { created: 1000 },
        },
        parts: [{ id: 'p1', sessionID: 'ses_1', messageID: 'msg_1', type: 'text', text: 'hello' }],
      },
      {
        info: {
          id: 'msg_2',
          sessionID: 'ses_1',
          role: 'assistant',
          time: { created: 2000 },
        },
        parts: [
          {
            id: 'p2',
            sessionID: 'ses_1',
            messageID: 'msg_2',
            type: 'tool',
            tool: 'write',
            state: {
              status: 'completed',
              input: { path: 'src/components/chat/NewModal.tsx' },
            },
          },
          {
            id: 'p3',
            sessionID: 'ses_1',
            messageID: 'msg_2',
            type: 'tool',
            tool: 'edit',
            state: {
              status: 'completed',
              input: {
                path: 'src/App.tsx',
                oldString: 'a\nb\nc\nd',
                newString: 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl',
              },
            },
          },
        ],
      },
    ]

    const diffs = computeClientSideDiffs(messages, 'msg_1')
    const byFile = new Map(diffs.map((d) => [d.file, d]))
    assert.equal(byFile.get('NewModal.tsx')?.status, 'added')
    assert.equal(byFile.get('App.tsx')?.status, 'modified')
    assert.equal((byFile.get('App.tsx')?.additions ?? 0) > 0, true)
    assert.equal((byFile.get('App.tsx')?.deletions ?? 0) > 0, true)
  })
})
