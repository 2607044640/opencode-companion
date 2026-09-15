import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Message } from '../types/opencode'
import {
  filterCheckpointPaths,
  formatCheckpointCommitMessage,
  isSensitiveGitPath,
  lastCompletedTurnMutatedFiles,
  extractTurnSummary,
  resolveCheckpointDirectory,
} from './git-checkpoint'

describe('isSensitiveGitPath', () => {
  test('blocks env, tokens, keys, secrets, and gateway logs', () => {
    assert.equal(isSensitiveGitPath('.env'), true)
    assert.equal(isSensitiveGitPath('.env.local'), true)
    assert.equal(isSensitiveGitPath('secrets/api_secrets.json'), true)
    assert.equal(isSensitiveGitPath('one-api.db'), true)
    assert.equal(isSensitiveGitPath('certs/id_rsa.key'), true)
    assert.equal(isSensitiveGitPath('gateway/logs/access.log'), true)
    assert.equal(isSensitiveGitPath('relay.token'), true)
    assert.equal(isSensitiveGitPath('src/hooks/useChatStream.ts'), false)
    assert.equal(isSensitiveGitPath('src/utils/git-checkpoint.ts'), false)
  })
})

describe('filterCheckpointPaths', () => {
  test('never returns sensitive paths and never duplicates', () => {
    const filtered = filterCheckpointPaths([
      'src/a.ts',
      '.env',
      'src/a.ts',
      'api_secrets.json',
      'src/b.ts',
    ])
    assert.deepEqual(filtered, ['src/a.ts', 'src/b.ts'])
  })
})

describe('formatCheckpointCommitMessage', () => {
  test('uses structured OpenCode-Checkpoint title and summary', () => {
    const msg = formatCheckpointCommitMessage('Fix revert 0/0', 'parse oldString diffs')
    assert.equal(msg, '[OpenCode-Checkpoint] Fix revert 0/0: parse oldString diffs')
  })
})

describe('lastCompletedTurnMutatedFiles', () => {
  test('skips read-only QA turns and flags write/edit turns', () => {
    const qa: Message[] = [
      {
        info: { id: 'u1', sessionID: 's', role: 'user', time: { created: 1 } },
        parts: [{ id: 'p1', sessionID: 's', messageID: 'u1', type: 'text', text: 'explain' }],
      },
      {
        info: { id: 'a1', sessionID: 's', role: 'assistant', time: { created: 2 } },
        parts: [
          {
            id: 'p2',
            sessionID: 's',
            messageID: 'a1',
            type: 'tool',
            tool: 'read',
            state: { status: 'completed', input: { path: 'src/a.ts' } },
          },
        ],
      },
    ]
    assert.equal(lastCompletedTurnMutatedFiles(qa), false)

    const edited: Message[] = [
      ...qa,
      {
        info: { id: 'u2', sessionID: 's', role: 'user', time: { created: 3 } },
        parts: [{ id: 'p3', sessionID: 's', messageID: 'u2', type: 'text', text: 'fix it' }],
      },
      {
        info: { id: 'a2', sessionID: 's', role: 'assistant', time: { created: 4 } },
        parts: [
          {
            id: 'p4',
            sessionID: 's',
            messageID: 'a2',
            type: 'tool',
            tool: 'edit',
            state: {
              status: 'completed',
              input: { path: 'src/a.ts', oldString: 'x', newString: 'y' },
            },
          },
        ],
      },
    ]
    assert.equal(lastCompletedTurnMutatedFiles(edited), true)
    assert.equal(extractTurnSummary(edited), 'fix it')
  })
})

describe('resolveCheckpointDirectory', () => {
  test('maps jail worktree to host project path', () => {
    assert.equal(
      resolveCheckpointDirectory('/workspace/projects/APISpace/opencode-companion'),
      '/home/developer/projects/APISpace/opencode-companion'
    )
  })
})
