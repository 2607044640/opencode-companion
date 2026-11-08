import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {
  isSensitiveGitPath,
  isAllowedExternalPath,
  isAllowedRollbackPath,
  normalizeRollbackPath,
  parsePorcelainPaths,
  resolveHostDirectory,
  resolveRollbackDiskPath,
  resolveRoutingConfig,
  resolveModelProfiles,
  readFileFromWorkspace,
  runGitRevert,
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

  test('allows rollback paths in configured standard workspaces', () => {
    assert.equal(
      isAllowedRollbackPath('/home/developer/projects/ObsidianNote/Notes/example.md'),
      true
    )
    assert.equal(isAllowedRollbackPath('/home/developer/projects/ObsidianNote/.env'), false)
    assert.equal(isAllowedRollbackPath('/home/developer/projects/ObsidianNotebook/Notes/example.md'), false)
  })

  test('discovers newly added workspaces under supported roots dynamically', () => {
    const options = {
      configuredRoots: [],
      candidateBases: ['C:/', 'C:/Godot', 'C:/ObsidianPublish'],
      listDirectories: (base: string) =>
        base === 'C:/' ? ['NewWorkspace'] :
          base === 'C:/Godot' ? ['NewGame'] : ['PublishVault'],
      directoryExists: () => true,
    }
    assert.equal(
      resolveRollbackDiskPath('/home/developer/projects/NewWorkspace/src/file.ts', options),
      path.resolve('C:/NewWorkspace/src/file.ts')
    )
    assert.equal(
      resolveRollbackDiskPath('/home/developer/projects/NewGame/scripts/main.gd', options),
      path.resolve('C:/Godot/NewGame/scripts/main.gd')
    )
    assert.equal(
      resolveRollbackDiskPath('/home/developer/projects/PublishVault/Notes/page.md', options),
      path.resolve('C:/ObsidianPublish/PublishVault/Notes/page.md')
    )
    assert.equal(
      resolveRollbackDiskPath('/home/developer/projects/AISpace/NewGame/scripts/main.gd', {
        ...options,
        configuredRoots: [{ jail: '/home/developer/projects/AISpace', win: 'C:/AISpace' }],
      }),
      path.resolve('C:/Godot/NewGame/scripts/main.gd')
    )
  })

  test('does not resolve removed workspaces or Windows paths outside discovered roots', () => {
    const options = {
      configuredRoots: [],
      candidateBases: ['C:/Godot'],
      listDirectories: () => [],
      directoryExists: () => false,
    }
    assert.equal(resolveRollbackDiskPath('/home/developer/projects/RemovedGame/file.gd', options), null)
    assert.equal(resolveRollbackDiskPath('C:/Unlisted/file.txt', options), null)
    assert.equal(
      resolveRollbackDiskPath('/home/developer/projects/NewGame/../.env', {
        ...options,
        listDirectories: () => ['NewGame'],
        directoryExists: () => true,
      }),
      null
    )
  })
})

describe('host-api routing config and senior model resolution', () => {
  test('resolves senior model from live opencode-routing.json SSOT', () => {
    const res = resolveRoutingConfig()
    assert.equal(res.ok, true)
    assert.ok(res.selectedActiveTarget)
    assert.ok(res.seniorModel.providerID)
    assert.ok(res.seniorModel.modelID)
    assert.ok(res.seniorModel.name)
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
    assert.ok(payload.seniorModel.modelID)
  })

  test('resolves model profiles dynamically from SSOT model_profiles.json', () => {
    const res = resolveModelProfiles()
    assert.equal(res.ok, true)
    assert.ok(res.profiles)
    assert.ok(res.profiles['gpt-6.1-sol'])
    assert.equal(res.profiles['gpt-6.1-sol'].effective_context_tokens, 922000)
    assert.equal(res.aliases?.['obsidian/gpt-6.1-sol'], 'gpt-6.1-sol')
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
    assert.equal(payload.profiles['gpt-6.1-sol'].effective_context_tokens, 922000)
  })
})

describe('host-api open-external endpoints and path launcher', () => {
  function createMockReq(url: string, bodyObj: any) {
    const jsonStr = JSON.stringify(bodyObj)
    return {
      url,
      method: 'POST',
      on: (event: string, handler: any) => {
        if (event === 'data') {
          handler(Buffer.from(jsonStr))
        } else if (event === 'end') {
          handler()
        }
      },
    }
  }

  test('handleHostApi serves POST /api/open-external for vscode and explorer', async () => {
    let statusCode = 0
    let bodyData = ''

    const req: any = createMockReq('/api/open-external', {
      filePath: '/home/developer/projects/APISpace/opencode-companion/package.json',
      target: 'vscode',
      line: 'L10-20',
    })
    const res: any = {
      statusCode: 0,
      setHeader: () => {},
      end: (data: string) => {
        bodyData = data
      },
    }

    const handled = await handleHostApi(req, res)
    assert.equal(handled, true)
    assert.equal(res.statusCode, 200)
    const payload = JSON.parse(bodyData)
    assert.equal(payload.ok, true)
    assert.equal(payload.line, 10)
  })

  test('POST /api/open-external rejects wildcard paths safely', async () => {
    let statusCode = 0
    let bodyData = ''

    const req: any = createMockReq('/api/open-external', {
      filePath: '**/AGENTS_Antigravity.md',
      target: 'explorer',
    })
    const res: any = {
      statusCode: 0,
      setHeader: () => {},
      end: (data: string) => {
        bodyData = data
      },
    }

    const handled = await handleHostApi(req, res)
    assert.equal(handled, true)
    assert.equal(res.statusCode, 400)
    const payload = JSON.parse(bodyData)
    assert.equal(payload.ok, false)
    assert.match(payload.error, /通配符/)
  })
})

describe('host-api readFileFromWorkspace and GET /api/file-content smart resolution', () => {
  test('resolves exact file path and reads content successfully', () => {
    const res = readFileFromWorkspace('C:/APISpace/opencode-companion/package.json')
    assert.equal(res.ok, true)
    assert.equal(res.fileName, 'package.json')
    assert.match(res.content, /"name":\s*"opencode-companion"/)
    assert.ok(res.lineCount > 0)
    assert.ok(res.byteSize > 0)
  })

  test('resolves file from jail POSIX path mapping', () => {
    const res = readFileFromWorkspace('/home/developer/projects/APISpace/opencode-companion/package.json')
    assert.equal(res.ok, true)
    assert.equal(res.fileName, 'package.json')
    assert.match(res.content, /"name":\s*"opencode-companion"/)
  })

  test('strips anchors, line numbers and quotes safely', () => {
    const res = readFileFromWorkspace('"C:/APISpace/opencode-companion/package.json#L5-15"')
    assert.equal(res.ok, true)
    assert.equal(res.fileName, 'package.json')
  })

  test('resolves relative path using directory context', () => {
    const res = readFileFromWorkspace('package.json', {
      directory: 'C:/APISpace/opencode-companion',
    })
    assert.equal(res.ok, true)
    assert.equal(res.fileName, 'package.json')
    assert.match(res.content, /"name":\s*"opencode-companion"/)
  })

  test('resolves file via subdirectory disambiguated search', () => {
    // Should find host-api.mjs in opencode-companion even without exact path
    const res = readFileFromWorkspace('host-api.mjs', {
      directory: 'C:/APISpace/opencode-companion',
    })
    assert.equal(res.ok, true)
    assert.equal(res.fileName, 'host-api.mjs')
    assert.match(res.content, /readFileFromWorkspace/)
  })

  test('blocks sensitive files like .env or one-api.db', () => {
    const res = readFileFromWorkspace('.env')
    assert.equal(res.ok, false)
    assert.match(res.error, /sensitive|Access denied/i)
  })

  test('resolves file with canonical name variations (_ vs space vs -)', () => {
    // File on disk has underscores: C:/Godot/AISpace/GPT-6-Astra_Backpack_Meta_Review_Prompt.md
    // Request with spaces should resolve to the exact same file!
    const res = readFileFromWorkspace('GPT-6-Astra Backpack Meta Review Prompt.md')
    assert.equal(res.ok, true)
    assert.equal(res.fileName, 'GPT-6-Astra_Backpack_Meta_Review_Prompt.md')
    assert.match(res.content, /GPT-6 Astra Review Prompt/i)
  })

  test('resolves Godot res:// paths to AISpace root', () => {
    const res = readFileFromWorkspace('res://GPT-6-Astra_Backpack_Meta_Review_Prompt.md')
    assert.equal(res.ok, true)
    assert.match(res.filePath, /C:\\Godot\\AISpace/i)
  })

  test('returns not found for nonexistent paths', () => {
    const res = readFileFromWorkspace('nonexistent_random_xyz_file_12345.txt')
    assert.equal(res.ok, false)
    assert.match(res.error, /File not found/i)
  })

  test('handleHostApi serves GET /api/file-content successfully', async () => {
    let bodyData = ''
    const req: any = {
      url: '/api/file-content?path=C%3A%2FAPISpace%2Fopencode-companion%2Fpackage.json',
      method: 'GET',
    }
    const res: any = {
      statusCode: 0,
      setHeader: () => {},
      end: (data: string) => {
        bodyData = data
      },
    }

    const handled = await handleHostApi(req, res)
    assert.equal(handled, true)
    assert.equal(res.statusCode, 200)
    const payload = JSON.parse(bodyData)
    assert.equal(payload.ok, true)
    assert.equal(payload.fileName, 'package.json')
    assert.match(payload.content, /opencode-companion/)
  })

  test('handleHostApi rejects non-GET methods on /api/file-content with 405', async () => {
    const req: any = {
      url: '/api/file-content?path=package.json',
      method: 'POST',
    }
    const res: any = {
      statusCode: 0,
      setHeader: () => {},
      end: () => {},
    }

    const handled = await handleHostApi(req, res)
    assert.equal(handled, true)
    assert.equal(res.statusCode, 405)
  })

  test('runGitRevert and POST /api/git-revert reject disallowed or shell-injected directories', async () => {
    const direct = runGitRevert('/tmp/evil; echo pwned')
    assert.equal(direct.ok, false)
    assert.equal(direct.status, 400)
    assert.match(direct.error, /not an allowed project path/i)

    let bodyData = ''
    const payloadStr = JSON.stringify({ directory: 'C:/Windows/System32', mode: 'revert' })
    const req: any = {
      url: '/api/git-revert',
      method: 'POST',
      on: (event: string, handler: any) => {
        if (event === 'data') handler(Buffer.from(payloadStr))
        else if (event === 'end') handler()
      },
    }
    const res: any = {
      statusCode: 0,
      setHeader: () => {},
      end: (data: string) => {
        bodyData = data
      },
    }
    const handled = await handleHostApi(req, res)
    assert.equal(handled, true)
    assert.equal(res.statusCode, 400)
    const parsed = JSON.parse(bodyData)
    assert.equal(parsed.ok, false)
  })
})
