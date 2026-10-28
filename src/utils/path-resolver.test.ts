import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { toWindowsPath, toLinuxPath, cleanRawPath } from './path-resolver'

describe('Path Resolver Utilities (path-resolver.ts)', () => {
  describe('toWindowsPath', () => {
    it('returns empty string for empty input', () => {
      assert.equal(toWindowsPath(''), '')
    })

    it('preserves existing Windows path with backslashes', () => {
      assert.equal(
        toWindowsPath('C:\\APISpace\\opencode-companion\\src\\App.tsx'),
        'C:\\APISpace\\opencode-companion\\src\\App.tsx'
      )
    })

    it('converts Windows path with forward slashes to backslashes', () => {
      assert.equal(
        toWindowsPath('C:/AICore/global/rules/AGENTS_Antigravity.md'),
        'C:\\AICore\\global\\rules\\AGENTS_Antigravity.md'
      )
    })

    it('maps /home/developer/projects/APISpace to C:\\APISpace', () => {
      assert.equal(
        toWindowsPath('/home/developer/projects/APISpace/opencode-companion/package.json'),
        'C:\\APISpace\\opencode-companion\\package.json'
      )
    })

    it('maps /home/developer/projects/AICore to C:\\AICore', () => {
      assert.equal(
        toWindowsPath('/home/developer/projects/AICore/global/rules/AGENTS_Antigravity.md'),
        'C:\\AICore\\global\\rules\\AGENTS_Antigravity.md'
      )
    })

    it('maps /home/developer/projects/AISpace to C:\\Godot\\AISpace', () => {
      assert.equal(
        toWindowsPath('/home/developer/projects/AISpace/src/main.gd'),
        'C:\\Godot\\AISpace\\src\\main.gd'
      )
    })

    it('maps /home/developer/projects/ObsidianNote to C:\\ObsidianNote', () => {
      assert.equal(
        toWindowsPath('/home/developer/projects/ObsidianNote/notes/daily.md'),
        'C:\\ObsidianNote\\notes\\daily.md'
      )
    })

    it('maps /workspace/projects/ObsidianDev to C:\\ObsidianDev', () => {
      assert.equal(
        toWindowsPath('/workspace/projects/ObsidianDev/plugins/test.ts'),
        'C:\\ObsidianDev\\plugins\\test.ts'
      )
    })

    it('maps /mnt/c/ to C:\\', () => {
      assert.equal(
        toWindowsPath('/mnt/c/Users/26070/test.txt'),
        'C:\\Users\\26070\\test.txt'
      )
    })
  })

  describe('toLinuxPath', () => {
    it('returns empty string for empty input', () => {
      assert.equal(toLinuxPath(''), '')
    })

    it('preserves existing Linux jail path', () => {
      assert.equal(
        toLinuxPath('/home/developer/projects/AICore/global/rules/AGENTS_Antigravity.md'),
        '/home/developer/projects/AICore/global/rules/AGENTS_Antigravity.md'
      )
    })

    it('maps C:\\APISpace to /home/developer/projects/APISpace', () => {
      assert.equal(
        toLinuxPath('C:\\APISpace\\opencode-companion\\package.json'),
        '/home/developer/projects/APISpace/opencode-companion/package.json'
      )
    })

    it('maps C:\\AICore to /home/developer/projects/AICore', () => {
      assert.equal(
        toLinuxPath('C:\\AICore\\skills\\AICtl\\SKILL.md'),
        '/home/developer/projects/AICore/skills/AICtl/SKILL.md'
      )
    })

    it('maps C:\\Godot\\AISpace to /home/developer/projects/AISpace', () => {
      assert.equal(
        toLinuxPath('C:\\Godot\\AISpace\\src\\main.gd'),
        '/home/developer/projects/AISpace/src/main.gd'
      )
    })
  })

  describe('cleanRawPath & messy input stripping', () => {
    it('strips file:/// and file:// prefixes', () => {
      assert.equal(cleanRawPath('file:///C:/APISpace/test.ts'), 'C:/APISpace/test.ts')
      assert.equal(cleanRawPath('file://C:/APISpace/test.ts'), 'C:/APISpace/test.ts')
    })

    it('strips surrounding single or double quotes', () => {
      assert.equal(cleanRawPath('"C:\\APISpace\\test.ts"'), 'C:\\APISpace\\test.ts')
      assert.equal(cleanRawPath("'C:\\APISpace\\test.ts'"), 'C:\\APISpace\\test.ts')
    })

    it('decodes %20 URI encodings', () => {
      assert.equal(cleanRawPath('C:/My%20Projects/test.ts'), 'C:/My Projects/test.ts')
    })

    it('strips line number suffixes (:42, #L42, (42))', () => {
      assert.equal(cleanRawPath('C:/APISpace/test.ts:42'), 'C:/APISpace/test.ts')
      assert.equal(cleanRawPath('C:/APISpace/test.ts:42:10'), 'C:/APISpace/test.ts')
      assert.equal(cleanRawPath('C:/APISpace/test.ts#L42-50'), 'C:/APISpace/test.ts')
      assert.equal(cleanRawPath('C:/APISpace/test.ts(42)'), 'C:/APISpace/test.ts')
    })

    it('toWindowsPath cleanly resolves messy file:/// and line number paths', () => {
      assert.equal(
        toWindowsPath('file:///C:/AICore/global/rules/AGENTS_Antigravity.md:42'),
        'C:\\AICore\\global\\rules\\AGENTS_Antigravity.md'
      )
      assert.equal(
        toWindowsPath('"file:///home/developer/projects/APISpace/package.json#L10"'),
        'C:\\APISpace\\package.json'
      )
    })

    it('strips tool banner and git status prefix (Bug 1 & Bug 2 regression fix)', () => {
      const bannerInput =
        'Success. Updated the following files:\nM home/developer/projects/AICore/opencode-jail/instructions/opencode-agent.md'

      // 1. cleanRawPath strips banner, git status prefix 'M ', and restores leading slash
      assert.equal(
        cleanRawPath(bannerInput),
        '/home/developer/projects/AICore/opencode-jail/instructions/opencode-agent.md'
      )

      // 2. toWindowsPath resolves correctly to Windows native path
      assert.equal(
        toWindowsPath(bannerInput),
        'C:\\AICore\\opencode-jail\\instructions\\opencode-agent.md'
      )

      // 3. toLinuxPath resolves correctly to POSIX jail path
      assert.equal(
        toLinuxPath(bannerInput),
        '/home/developer/projects/AICore/opencode-jail/instructions/opencode-agent.md'
      )
    })

    it('symmetrically converts Windows path back to Linux path', () => {
      const winPath = 'C:\\AICore\\opencode-jail\\instructions\\opencode-agent.md'
      assert.equal(
        toLinuxPath(winPath),
        '/home/developer/projects/AICore/opencode-jail/instructions/opencode-agent.md'
      )
    })

    it('handles paths missing leading slash seamlessly', () => {
      const missingSlash = 'home/developer/projects/APISpace/package.json'
      assert.equal(toWindowsPath(missingSlash), 'C:\\APISpace\\package.json')
      assert.equal(toLinuxPath(missingSlash), '/home/developer/projects/APISpace/package.json')
    })

    it('handles direct workspace root names', () => {
      const directWs = 'AICore/skills/AICtl/SKILL.md'
      assert.equal(toWindowsPath(directWs), 'C:\\AICore\\skills\\AICtl\\SKILL.md')
      assert.equal(toLinuxPath(directWs), '/home/developer/projects/AICore/skills/AICtl/SKILL.md')
    })
  })
})
