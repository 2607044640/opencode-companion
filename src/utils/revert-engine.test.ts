import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Message, Session } from '../types/opencode'
import {
  classifyRevertBadge,
  collectRollbackActions,
  computeRevertDiffs,
  executeRevertWithTimeout,
  extractContentFromReadOutput,
  fileExistedBeforeCheckpoint,
  mergeRevertDiffs,
  withRevertTimeout,
  RevertTimeoutError,
  type RevertDaemonPort,
} from './revert-engine'

function userMsg(id: string, text = 'do it'): Message {
  return {
    info: { id, sessionID: 'ses_1', role: 'user', time: { created: 1 } },
    parts: [{ id: `p_${id}`, sessionID: 'ses_1', messageID: id, type: 'text', text }],
  }
}

function toolMsg(
  id: string,
  tool: string,
  input: Record<string, unknown>,
  created = 2
): Message {
  return {
    info: { id, sessionID: 'ses_1', role: 'assistant', time: { created } },
    parts: [
      {
        id: `p_${id}`,
        sessionID: 'ses_1',
        messageID: id,
        type: 'tool',
        tool,
        state: { status: 'completed', input },
      },
    ],
  }
}

describe('computeRevertDiffs', () => {
  test('classifies pre-existing workspace edit as modified with +X -Y', () => {
    const messages: Message[] = [
      userMsg('msg_prior'),
      toolMsg('msg_prior_asst', 'edit', {
        path: 'src/hooks/useChatStream.ts',
        oldString: 'const a = 1',
        newString: 'const a = 2',
      }),
      userMsg('msg_user'),
      toolMsg('msg_asst', 'edit', {
        path: 'src/hooks/useChatStream.ts',
        oldString: 'const a = 2\nconst b = 2',
        newString: 'const a = 2\nconst b = 20\nconst c = 30',
      }),
    ]

    const diffs = computeRevertDiffs(messages, 'msg_user')
    assert.equal(diffs.length, 1)
    assert.equal(diffs[0]?.file, 'useChatStream.ts')
    assert.equal(diffs[0]?.status, 'modified')
    assert.equal(classifyRevertBadge(diffs[0]!), 'modify')
    assert.equal(diffs[0]!.additions > 0, true)
    assert.equal(diffs[0]!.deletions > 0, true)
    assert.equal(fileExistedBeforeCheckpoint(messages, 'msg_user', 'src/hooks/useChatStream.ts'), true)
  })

  test('classifies a write of a file that already existed as modified, not Delete', () => {
    const messages: Message[] = [
      userMsg('msg_prior'),
      toolMsg('msg_prior_asst', 'write', {
        path: '/mnt/desktop/atlas-test.txt',
        contents: '111',
      }),
      userMsg('msg_user'),
      toolMsg('msg_asst', 'write', {
        path: '/mnt/desktop/atlas-test.txt',
        contents: '222',
      }),
    ]

    const diffs = computeRevertDiffs(messages, 'msg_user')
    assert.equal(diffs[0]?.status, 'modified')
    assert.equal(classifyRevertBadge(diffs[0]!), 'modify')
    assert.notEqual(classifyRevertBadge(diffs[0]!), 'delete')
  })

  test('classifies a newly created in-tree file as added / Delete', () => {
    const messages: Message[] = [
      userMsg('msg_user'),
      toolMsg('msg_asst', 'write', {
        path: 'src/new-file.ts',
        contents: 'export const x = 1\nexport const y = 2',
      }),
    ]

    const diffs = computeRevertDiffs(messages, 'msg_user')
    assert.equal(diffs[0]?.file, 'new-file.ts')
    assert.equal(diffs[0]?.status, 'added')
    assert.equal(classifyRevertBadge(diffs[0]!), 'delete')
    assert.equal(diffs[0]?.additions > 0, true)
    assert.equal(diffs[0]?.deletions, 0)
  })

  test('classifies a newly created desktop file as added / Delete', () => {
    const messages: Message[] = [
      userMsg('msg_user'),
      toolMsg('msg_asst', 'write', {
        path: '/mnt/desktop/atlas-test.txt',
        contents: 'line1\nline2\nline3',
      }),
    ]

    const diffs = computeRevertDiffs(messages, 'msg_user')
    assert.equal(diffs[0]?.file, 'atlas-test.txt')
    assert.equal(diffs[0]?.status, 'added')
    assert.equal(classifyRevertBadge(diffs[0]!), 'delete')
  })

  test('turn 0 edit with oldString is modified, not added/Delete', () => {
    const messages: Message[] = [
      userMsg('msg_user'),
      toolMsg('msg_asst', 'edit', {
        path: 'src/hooks/useChatStream.ts',
        oldString: 'const a = 1',
        newString: 'const a = 2',
      }),
    ]
    const diffs = computeRevertDiffs(messages, 'msg_user')
    assert.equal(diffs[0]?.status, 'modified')
    assert.equal(classifyRevertBadge(diffs[0]!), 'modify')
    assert.notEqual(classifyRevertBadge(diffs[0]!), 'delete')
  })

  test('turn 0 write after a same-turn read is modified, not Delete', () => {
    const messages: Message[] = [
      userMsg('msg_user'),
      {
        info: { id: 'msg_asst', sessionID: 'ses_1', role: 'assistant', time: { created: 2 } },
        parts: [
          {
            id: 'p_read',
            sessionID: 'ses_1',
            messageID: 'msg_asst',
            type: 'tool',
            tool: 'read',
            state: {
              status: 'completed',
              input: { path: '/mnt/desktop/atlas-test.txt' },
              output: '111',
            },
          },
          {
            id: 'p_write',
            sessionID: 'ses_1',
            messageID: 'msg_asst',
            type: 'tool',
            tool: 'write',
            state: {
              status: 'completed',
              input: { path: '/mnt/desktop/atlas-test.txt', contents: '222' },
            },
          },
        ],
      },
    ]
    const diffs = computeRevertDiffs(messages, 'msg_user')
    assert.equal(diffs[0]?.status, 'modified')
    assert.equal(classifyRevertBadge(diffs[0]!), 'modify')
  })

  test('turn 0 write with no prior read and no oldString stays added / Delete', () => {
    const messages: Message[] = [
      userMsg('msg_user'),
      toolMsg('msg_asst', 'write', {
        path: '/mnt/desktop/brand-new.txt',
        contents: 'hello',
      }),
    ]
    const diffs = computeRevertDiffs(messages, 'msg_user')
    assert.equal(diffs[0]?.status, 'added')
    assert.equal(classifyRevertBadge(diffs[0]!), 'delete')
  })

  test('create then read in the same range stays added / Delete (read-after-create is not existence)', () => {
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
              input: { path: 'src/brand-new.ts', contents: 'export const n = 1' },
            },
          },
          {
            id: 'p_read',
            sessionID: 'ses_1',
            messageID: 'msg_asst',
            type: 'tool',
            tool: 'read',
            state: {
              status: 'completed',
              input: { path: 'src/brand-new.ts' },
              output: 'export const n = 1',
            },
          },
        ],
      },
    ]
    const diffs = computeRevertDiffs(messages, 'msg_user')
    assert.equal(diffs[0]?.status, 'added')
    assert.equal(classifyRevertBadge(diffs[0]!), 'delete')
  })
})

describe('collectRollbackActions', () => {
  test('never touches desktop files in rollback actions (preserves host isolation)', () => {
    const messages: Message[] = [
      userMsg('msg_user', 'write desktop'),
      toolMsg('msg_asst', 'write', {
        path: '/mnt/desktop/atlas-test.txt',
        contents: '111',
      }),
    ]
    assert.deepEqual(collectRollbackActions(messages, 'msg_user'), [])
  })

  test('unlinks a newly created in-tree file so git-less creates still revert', () => {
    const messages: Message[] = [
      userMsg('msg_user'),
      toolMsg('msg_asst', 'write', {
        path: '/workspace/projects/APISpace/opencode-companion/src/brand-new.ts',
        contents: 'export const n = 1',
      }),
    ]
    assert.deepEqual(collectRollbackActions(messages, 'msg_user'), [
      {
        kind: 'delete',
        path: '/workspace/projects/APISpace/opencode-companion/src/brand-new.ts',
      },
    ])
  })

  test('does not delete or touch external desktop files even if edited', () => {
    const messages: Message[] = [
      userMsg('msg_prior'),
      toolMsg('msg_prior_asst', 'write', {
        path: '/mnt/desktop/atlas-test.txt',
        contents: 'before',
      }),
      userMsg('msg_user', 'edit desktop'),
      toolMsg(
        'msg_asst',
        'edit',
        {
          path: '/mnt/desktop/atlas-test.txt',
          oldString: 'before',
          newString: '111',
        },
        4
      ),
    ]
    assert.deepEqual(collectRollbackActions(messages, 'msg_user'), [])
  })

  test('does not delete a workspace file that already existed before the checkpoint', () => {
    const messages: Message[] = [
      userMsg('msg_prior'),
      toolMsg('msg_prior_asst', 'edit', {
        path: 'src/App.tsx',
        oldString: 'a',
        newString: 'b',
      }),
      userMsg('msg_user'),
      toolMsg('msg_asst', 'write', {
        path: 'src/App.tsx',
        contents: 'c',
      }),
    ]
    assert.deepEqual(collectRollbackActions(messages, 'msg_user'), [])
  })

  test('does not delete or touch turn-0 desktop file', () => {
    const messages: Message[] = [
      userMsg('msg_user'),
      {
        info: { id: 'msg_asst', sessionID: 'ses_1', role: 'assistant', time: { created: 2 } },
        parts: [
          {
            id: 'p_read',
            sessionID: 'ses_1',
            messageID: 'msg_asst',
            type: 'tool',
            tool: 'read',
            state: {
              status: 'completed',
              input: { path: '/mnt/desktop/atlas-test.txt' },
              output: '111',
            },
          },
          {
            id: 'p_write',
            sessionID: 'ses_1',
            messageID: 'msg_asst',
            type: 'tool',
            tool: 'write',
            state: {
              status: 'completed',
              input: { path: '/mnt/desktop/atlas-test.txt', contents: '222' },
            },
          },
        ],
      },
    ]
    assert.deepEqual(collectRollbackActions(messages, 'msg_user'), [])
  })

  test('restores an edited in-tree file using earliestOld', () => {
    const messages: Message[] = [
      userMsg('msg_user'),
      toolMsg('msg_asst', 'edit', {
        path: '/workspace/projects/APISpace/test.txt',
        oldString: 'original text',
        newString: '1234',
      }),
    ]
    assert.deepEqual(collectRollbackActions(messages, 'msg_user'), [
      {
        kind: 'restore',
        path: '/workspace/projects/APISpace/test.txt',
        content: 'original text',
      },
    ])
  })

  test('resolves relative path against sessionDir and generates restore action', () => {
    const messages: Message[] = [
      userMsg('msg_user'),
      toolMsg('msg_asst', 'edit', {
        path: 'src/main.ts',
        oldString: 'console.log("hello")',
        newString: 'console.log("world")',
      }),
    ]
    assert.deepEqual(
      collectRollbackActions(messages, 'msg_user', '/workspace/projects/APISpace'),
      [
        {
          kind: 'restore',
          path: '/workspace/projects/APISpace/src/main.ts',
          content: 'console.log("hello")',
        },
      ]
    )
  })
})

describe('mergeRevertDiffs', () => {
  test('does not let a daemon added/0/0 stamp override a client modified +X -Y', () => {
    const merged = mergeRevertDiffs(
      [{ file: 'useChatStream.ts', status: 'added', additions: 0, deletions: 0 }],
      [
        {
          file: 'useChatStream.ts',
          filePath: 'src/hooks/useChatStream.ts',
          status: 'modified',
          additions: 41,
          deletions: 37,
        },
      ]
    )
    assert.equal(merged[0]?.status, 'modified')
    assert.equal(merged[0]?.additions, 41)
    assert.equal(merged[0]?.deletions, 37)
    assert.equal(classifyRevertBadge(merged[0]!), 'modify')
  })
})

describe('withRevertTimeout', () => {
  test('resolves when work finishes before the timeout', async () => {
    const value = await withRevertTimeout(Promise.resolve('ok'), 50)
    assert.equal(value, 'ok')
  })

  test('rejects with RevertTimeoutError when work hangs past the timeout', async () => {
    let timedOut = false
    await withRevertTimeout(new Promise(() => {}), 20).catch((err: unknown) => {
      timedOut = err instanceof RevertTimeoutError
    })
    assert.equal(timedOut, true)
  })
})

describe('executeRevertWithTimeout', () => {
  test('returns timedOut and never leaves the caller waiting when the daemon hangs', async () => {
    const session: Session = {
      id: 'ses_1',
      slug: 's',
      projectID: 'p',
      directory: '/workspace/projects/APISpace',
      title: 't',
      agent: 'build',
      model: { id: 'm', providerID: 'p' },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      cost: 0,
      time: { created: 1, updated: 1 },
    }
    const port: RevertDaemonPort = {
      revertSession: () => new Promise(() => {}),
      unrevertSession: async () => session,
      summarizeSession: async () => {},
      rollbackFiles: async () => ({ ok: true }),
      reloadSession: async () => {},
    }
    const result = await executeRevertWithTimeout(
      {
        sessionId: 'ses_1',
        messageId: 'msg_user',
        mode: 'both',
        messages: [userMsg('msg_user')],
      },
      port,
      30
    )
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.timedOut, true)
    }
  })

  test('rolls back a created desktop file after a successful daemon revert', async () => {
    const session: Session = {
      id: 'ses_1',
      slug: 's',
      projectID: 'p',
      directory: '/workspace/projects/APISpace',
      title: 't',
      agent: 'build',
      model: { id: 'm', providerID: 'p' },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      cost: 0,
      time: { created: 1, updated: 1 },
    }
    const rolled: { path?: string } = {}
    const port: RevertDaemonPort = {
      revertSession: async () => session,
      unrevertSession: async () => session,
      summarizeSession: async () => {},
      rollbackFiles: async (actions) => {
        rolled.path = actions[0]?.kind === 'delete' ? actions[0].path : undefined
        return { ok: true }
      },
      reloadSession: async () => {},
    }
    const result = await executeRevertWithTimeout(
      {
        sessionId: 'ses_1',
        messageId: 'msg_user',
        mode: 'both',
        messages: [
          userMsg('msg_user'),
          toolMsg('msg_asst', 'write', {
            path: '/workspace/projects/APISpace/opencode-companion/src/new-in-tree.ts',
            contents: '111',
          }),
        ],
      },
      port,
      200
    )
    assert.equal(result.ok, true)
    assert.equal(
      rolled.path,
      '/workspace/projects/APISpace/opencode-companion/src/new-in-tree.ts'
    )
  })
})

describe('extractContentFromReadOutput', () => {
  test('extracts clean content from grok read output with line numbers and system reminders', () => {
    const raw = `GROK_TOOL_RESULT status=OK tool=read call_id=call-123
No disk change.
NOTE: Native xAI tokens are void.
<path>/workspace/projects/AISpace/temp/atlas-scratch.txt</path>
<type>file</type>
<content>
1: 237289

(End of file - total 1 lines)
</content>

<system-reminder>
Instructions from AGENTS.md
</system-reminder>`
    const clean = extractContentFromReadOutput(raw)
    assert.equal(clean.trim(), '237289')
  })

  test('extracts multi-line code removing line number prefixes', () => {
    const raw = `<content>
1: import React from 'react'
2: export function App() {
3:   return <div>Hello</div>
4: }

(End of file - total 4 lines)
</content>`
    const clean = extractContentFromReadOutput(raw)
    assert.equal(
      clean,
      "import React from 'react'\nexport function App() {\n  return <div>Hello</div>\n}\n"
    )
  })

  test('restores clean content when file is read then written', () => {
    const messages: Message[] = [
      userMsg('msg_user', 'change file to 90999'),
      {
        info: { id: 'msg_read', sessionID: 'ses_1', role: 'assistant', time: { created: 2 } },
        parts: [
          {
            id: 'p_read',
            sessionID: 'ses_1',
            messageID: 'msg_read',
            type: 'tool',
            tool: 'read',
            state: {
              status: 'completed',
              input: { filePath: '/workspace/projects/AISpace/temp/atlas-scratch.txt' },
              output: `<content>\n1: 237289\n\n(End of file - total 1 lines)\n</content>`,
            },
          },
        ],
      },
      {
        info: { id: 'msg_write', sessionID: 'ses_1', role: 'assistant', time: { created: 3 } },
        parts: [
          {
            id: 'p_write',
            sessionID: 'ses_1',
            messageID: 'msg_write',
            type: 'tool',
            tool: 'write',
            state: {
              status: 'completed',
              input: { filePath: '/workspace/projects/AISpace/temp/atlas-scratch.txt', content: '90999\n' },
            },
          },
        ],
      },
    ]

    const actions = collectRollbackActions(messages, 'msg_user', '/workspace/projects/AISpace')
    assert.equal(actions.length, 1)
    assert.equal(actions[0].kind, 'restore')
    assert.equal(actions[0].path, '/workspace/projects/AISpace/temp/atlas-scratch.txt')
    if (actions[0].kind === 'restore') {
      assert.equal(actions[0].content?.trim(), '237289')
    }
  })
})

