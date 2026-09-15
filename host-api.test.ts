import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  isSensitiveGitPath,
  isAllowedExternalPath,
  isAllowedRollbackPath,
  normalizeRollbackPath,
  parsePorcelainPaths,
  resolveHostDirectory,
} from './host-api.mjs'

describe('host-api git path filter', () => {
  test('blocks secrets and allows source files', () => {
    assert.equal(isSensitiveGitPath('.env.production'), true)
    assert.equal(isSensitiveGitPath('api_secrets.json'), true)
    assert.equal(isSensitiveGitPath('gateway/logs/out.log'), true)
    assert.equal(isSensitiveGitPath('../escape.ts'), true)
    assert.equal(isSensitiveGitPath('src/utils/git-checkpoint.ts'), false)
  })

  test('parsePorcelainPaths drops secrets and directory entries', () => {
    const porcelain = [
      ' M src/hooks/useChatStream.ts',
      '?? .env',
      '?? gateway/logs/',
      '?? notes.token',
      'R  old.ts -> src/new.ts',
    ].join('\n')
    assert.deepEqual(parsePorcelainPaths(porcelain), [
      'src/hooks/useChatStream.ts',
      'src/new.ts',
    ])
  })
})

describe('host-api directory and desktop allowlist', () => {
  test('maps jail worktree into /home/developer/projects', () => {
    assert.equal(
      resolveHostDirectory('/workspace/projects/APISpace/opencode-companion'),
      '/home/developer/projects/APISpace/opencode-companion'
    )
    assert.equal(resolveHostDirectory('/tmp/evil'), null)
  })

  test('allows /mnt/desktop files only', () => {
    assert.equal(isAllowedExternalPath('/mnt/desktop/atlas-test.txt'), true)
    assert.equal(isAllowedExternalPath('/home/developer/projects/APISpace/secret.txt'), false)
    assert.equal(isAllowedExternalPath('/mnt/desktop/../projects/APISpace/secret.txt'), false)
  })

  test('maps Windows Desktop paths onto /mnt/desktop', () => {
    assert.equal(
      normalizeRollbackPath('C:/Users/jeff/Desktop/atlas-test.txt'),
      '/mnt/desktop/atlas-test.txt'
    )
    assert.equal(isAllowedExternalPath('C:/Users/jeff/Desktop/atlas-test.txt'), true)
    assert.equal(isAllowedRollbackPath('/mnt/desktop/atlas-test.txt'), true)
  })

  test('allows non-sensitive in-tree created-file unlinks', () => {
    assert.equal(
      isAllowedRollbackPath('/home/developer/projects/APISpace/opencode-companion/src/brand-new.ts'),
      true
    )
    assert.equal(isAllowedRollbackPath('/home/developer/projects/APISpace/.env'), false)
    assert.equal(isAllowedRollbackPath('/tmp/evil.txt'), false)
  })
})
