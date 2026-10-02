import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  isSensitiveGitPath,
  isAllowedExternalPath,
  isAllowedRollbackPath,
  normalizeRollbackPath,
  parsePorcelainPaths,
  resolveHostDirectory,
  resolveRoutingConfig,
  resolveModelProfiles,
  handleHostApi,
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
  test('maps jail worktree into projects root', () => {
    assert.equal(
      resolveHostDirectory('/workspace/projects/APISpace/opencode-companion'),
      '/workspace/projects/APISpace/opencode-companion'
    )
    assert.equal(resolveHostDirectory('/tmp/evil'), null)
  })

  test('strictly disallows external/desktop files', () => {
    assert.equal(isAllowedExternalPath('/mnt/desktop/atlas-test.txt'), false)
    assert.equal(isAllowedExternalPath('C:/test/atlas-test.txt'), false)
    assert.equal(isAllowedRollbackPath('/mnt/desktop/atlas-test.txt'), false)
    assert.equal(isAllowedRollbackPath('C:/test/atlas-test.txt'), false)
  })

  test('allows non-sensitive in-tree created-file unlinks only', () => {
    assert.equal(
      isAllowedRollbackPath('/workspace/projects/APISpace/opencode-companion/src/brand-new.ts'),
      true
    )
    assert.equal(isAllowedRollbackPath('/workspace/projects/APISpace/.env'), false)
    assert.equal(isAllowedRollbackPath('/tmp/evil.txt'), false)
  })
})

describe('host-api routing config and senior model resolution', () => {
  test('resolves senior model from live opencode-routing.json SSOT', () => {
    const res = resolveRoutingConfig()
    assert.equal(res.ok, true)
    assert.ok(res.selectedActiveTarget)
    assert.ok(res.seniorModel)
    assert.equal(res.seniorModel.providerID, 'obsidian')
    assert.equal(res.seniorModel.modelID, 'grok-4.7')
    assert.match(res.seniorModel.name, /Grok 4\.7/i)
  })

  test('handleHostApi serves GET /api/routing-config', async () => {
    let statusCode = 0
    let headers: Record<string, string> = {}
    let bodyData = ''

    const req: any = {
      url: '/api/routing-config',
      method: 'GET',
    }
    const res: any = {
      statusCode: 0,
      setHeader: (k: string, v: string) => {
        headers[k] = v
      },
      end: (data: string) => {
        bodyData = data
      },
    }

    const handled = await handleHostApi(req, res)
    assert.equal(handled, true)
    assert.equal(res.statusCode, 200)
    assert.equal(headers['Content-Type'], 'application/json')
    const payload = JSON.parse(bodyData)
    assert.equal(payload.ok, true)
    assert.equal(payload.seniorModel.modelID, 'grok-4.7')
  })

  test('resolves model profiles dynamically from SSOT model_profiles.json', () => {
    const res = resolveModelProfiles()
    assert.equal(res.ok, true)
    assert.ok(res.profiles)
    assert.ok(res.profiles['grok-4.7'])
    assert.equal(res.profiles['grok-4.7'].effective_context_tokens, 500000)
    assert.equal(res.aliases?.['obsidian/grok-4.7'], 'grok-4.7')
  })

  test('handleHostApi serves GET /api/model-profiles', async () => {
    let statusCode = 0
    let headers: Record<string, string> = {}
    let bodyData = ''

    const req: any = {
      url: '/api/model-profiles',
      method: 'GET',
    }
    const res: any = {
      statusCode: 0,
      setHeader: (k: string, v: string) => {
        headers[k] = v
      },
      end: (data: string) => {
        bodyData = data
      },
    }

    const handled = await handleHostApi(req, res)
    assert.equal(handled, true)
    assert.equal(res.statusCode, 200)
    assert.equal(headers['Content-Type'], 'application/json')
    const payload = JSON.parse(bodyData)
    assert.equal(payload.ok, true)
    assert.equal(payload.profiles['grok-4.7'].effective_context_tokens, 500000)
  })
})

