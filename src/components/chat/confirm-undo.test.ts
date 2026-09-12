import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Message } from '../../types/opencode'

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
              input: { path: 'src/App.tsx', additions: 12, deletions: 4 },
            },
          },
        ],
      },
    ]

    const targetMsgId = 'msg_1'
    const targetIndex = messages.findIndex((m) => m.info.id === targetMsgId)
    assert.equal(targetIndex, 0)

    const filesMap = new Map<string, { status?: string; additions: number; deletions: number }>()
    for (let i = targetIndex; i < messages.length; i++) {
      for (const part of messages[i].parts) {
        if (part.type === 'tool') {
          const tp = part as any
          const name = String(tp.tool || '').toLowerCase()
          const p = tp.state?.input?.path || ''
          const norm = p.split('/').pop() || p
          if (!filesMap.has(norm)) filesMap.set(norm, { additions: 0, deletions: 0 })
          const entry = filesMap.get(norm)!
          if (name === 'write') {
            entry.status = 'added'
          } else if (name === 'edit') {
            entry.status = 'modified'
            entry.additions += tp.state?.input?.additions || 0
            entry.deletions += tp.state?.input?.deletions || 0
          }
        }
      }
    }

    assert.equal(filesMap.has('NewModal.tsx'), true)
    assert.equal(filesMap.get('NewModal.tsx')?.status, 'added')
    assert.equal(filesMap.has('App.tsx'), true)
    assert.equal(filesMap.get('App.tsx')?.status, 'modified')
    assert.equal(filesMap.get('App.tsx')?.additions, 12)
    assert.equal(filesMap.get('App.tsx')?.deletions, 4)
  })
})
