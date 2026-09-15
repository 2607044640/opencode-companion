import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Message } from '../types/opencode'
import {
  collectExternalRollbackActions,
  isExternalToolPath,
} from './external-file-rollback'

describe('isExternalToolPath', () => {
  test('treats /mnt/desktop and Windows Desktop as external', () => {
    assert.equal(isExternalToolPath('/mnt/desktop/atlas-test.txt'), true)
    assert.equal(isExternalToolPath('C:/Users/jeff/Desktop/atlas-test.txt'), true)
    assert.equal(isExternalToolPath('/home/developer/projects/APISpace/src/a.ts'), false)
    assert.equal(isExternalToolPath('src/hooks/useChatStream.ts'), false)
    assert.equal(isExternalToolPath('src/desktop/icon.svg'), false)
  })
})

describe('collectExternalRollbackActions', () => {
  test('deletes desktop file created in revert range', () => {
    const messages: Message[] = [
      {
        info: { id: 'msg_user', sessionID: 's', role: 'user', time: { created: 1 } },
        parts: [{ id: 'p1', sessionID: 's', messageID: 'msg_user', type: 'text', text: 'write desktop' }],
      },
      {
        info: { id: 'msg_asst', sessionID: 's', role: 'assistant', time: { created: 2 } },
        parts: [
          {
            id: 'p2',
            sessionID: 's',
            messageID: 'msg_asst',
            type: 'tool',
            tool: 'write',
            state: {
              status: 'completed',
              input: { path: '/mnt/desktop/atlas-test.txt', contents: '111' },
            },
          },
        ],
      },
    ]

    const actions = collectExternalRollbackActions(messages, 'msg_user')
    assert.deepEqual(actions, [{ kind: 'delete', path: '/mnt/desktop/atlas-test.txt' }])
  })

  test('restores earliest oldString for edited desktop file', () => {
    const messages: Message[] = [
      {
        info: { id: 'msg_user', sessionID: 's', role: 'user', time: { created: 1 } },
        parts: [{ id: 'p1', sessionID: 's', messageID: 'msg_user', type: 'text', text: 'edit desktop' }],
      },
      {
        info: { id: 'msg_asst', sessionID: 's', role: 'assistant', time: { created: 2 } },
        parts: [
          {
            id: 'p2',
            sessionID: 's',
            messageID: 'msg_asst',
            type: 'tool',
            tool: 'edit',
            state: {
              status: 'completed',
              input: {
                path: '/mnt/desktop/atlas-test.txt',
                oldString: 'before',
                newString: '111',
              },
            },
          },
          {
            id: 'p3',
            sessionID: 's',
            messageID: 'msg_asst',
            type: 'tool',
            tool: 'edit',
            state: {
              status: 'completed',
              input: {
                path: '/mnt/desktop/atlas-test.txt',
                oldString: '111',
                newString: '222',
              },
            },
          },
        ],
      },
    ]

    const actions = collectExternalRollbackActions(messages, 'msg_user')
    assert.deepEqual(actions, [
      { kind: 'restore', path: '/mnt/desktop/atlas-test.txt', content: 'before' },
    ])
  })

  test('ignores in-workspace edits', () => {
    const messages: Message[] = [
      {
        info: { id: 'msg_user', sessionID: 's', role: 'user', time: { created: 1 } },
        parts: [{ id: 'p1', sessionID: 's', messageID: 'msg_user', type: 'text', text: 'edit' }],
      },
      {
        info: { id: 'msg_asst', sessionID: 's', role: 'assistant', time: { created: 2 } },
        parts: [
          {
            id: 'p2',
            sessionID: 's',
            messageID: 'msg_asst',
            type: 'tool',
            tool: 'edit',
            state: {
              status: 'completed',
              input: {
                path: '/home/developer/projects/APISpace/src/App.tsx',
                oldString: 'a',
                newString: 'b',
              },
            },
          },
        ],
      },
    ]
    assert.deepEqual(collectExternalRollbackActions(messages, 'msg_user'), [])
  })
})
