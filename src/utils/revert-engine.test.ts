import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Message, Session } from '../types/opencode'
import {
  classifyRevertBadge,
  collectRollbackActions,
  computeRevertDiffs,
  executeRevertWithTimeout,
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
})

describe('collectRollbackActions', () => {
  test('unlinks a desktop file created in the revert range', () => {
    const messages: Message[] = [
      userMsg('msg_user', 'write desktop'),
      toolMsg('msg_asst', 'write', {
        path: '/mnt/desktop/atlas-test.txt',
        contents: '111',
      }),
    ]
    assert.deepEqual(collectRollbackActions(messages, 'msg_user'), [
      { kind: 'delete', path: '/mnt/desktop/atlas-test.txt' },
    ])
  })

  test('unlinks a newly created in-tree file so git-less creates still revert', () => {
    const messages: Message[] = [
      userMsg('msg_user'),
      toolMsg('msg_asst', 'write', {
        path: '/home/developer/projects/APISpace/opencode-companion/src/brand-new.ts',
        contents: 'export const n = 1',
      }),
    ]
    assert.deepEqual(collectRollbackActions(messages, 'msg_user'), [
      {
        kind: 'delete',
        path: '/home/developer/projects/APISpace/opencode-companion/src/brand-new.ts',
      },
    ])
  })

  test('restores earliest pre-checkpoint content for an edited desktop file', () => {
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
    assert.deepEqual(collectRollbackActions(messages, 'msg_user'), [
      { kind: 'restore', path: '/mnt/desktop/atlas-test.txt', content: 'before' },
    ])
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
            path: '/mnt/desktop/atlas-test.txt',
            contents: '111',
          }),
        ],
      },
      port,
      200
    )
    assert.equal(result.ok, true)
    assert.equal(rolled.path, '/mnt/desktop/atlas-test.txt')
  })
})
