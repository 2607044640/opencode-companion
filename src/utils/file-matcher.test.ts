import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeFilePath,
  getCanonicalFileKey,
  isSameFileSemantics,
  findBestMatchingFileInGroups,
} from './file-matcher'
import type { WorkGroup } from './worked-summary'

describe('Smart File Matcher (智能文件查找与匹配系统)', () => {
  describe('normalizeFilePath', () => {
    test('strips URI schemes and line anchors', () => {
      assert.equal(
        normalizeFilePath('file:///C:/Godot/AISpace/test.md#L10-20'),
        'C:/Godot/AISpace/test.md'
      )
      assert.equal(
        normalizeFilePath('file://C:/APISpace/src/main.ts:42:5'),
        'C:/APISpace/src/main.ts'
      )
    })

    test('maps WSL and Godot paths correctly', () => {
      assert.equal(
        normalizeFilePath('/mnt/c/Godot/AISpace/test.md'),
        'C:/Godot/AISpace/test.md'
      )
      assert.equal(
        normalizeFilePath('res://addons/A1/Core/test.gd'),
        'C:/Godot/AISpace/addons/A1/Core/test.gd'
      )
    })

    test('maps jail project paths to Windows workspace roots', () => {
      assert.equal(
        normalizeFilePath('/workspace/projects/AISpace/scene.tscn'),
        'C:/Godot/AISpace/scene.tscn'
      )
      assert.equal(
        normalizeFilePath('/home/developer/projects/APISpace/server.ts'),
        'C:/APISpace/server.ts'
      )
    })

    test('decodes URI encoded characters (%20)', () => {
      assert.equal(
        normalizeFilePath('C:/Godot/AISpace/GPT-6-Astra%20Review.md'),
        'C:/Godot/AISpace/GPT-6-Astra Review.md'
      )
    })
  })

  describe('getCanonicalFileKey & isSameFileSemantics', () => {
    test('canonical key normalizes underscores, hyphens, spaces, and %20', () => {
      const key1 = getCanonicalFileKey('GPT-6-Astra_Backpack_Meta_Review_Prompt.md')
      const key2 = getCanonicalFileKey('GPT-6-Astra Backpack Meta Review Prompt.md')
      const key3 = getCanonicalFileKey('GPT-6-Astra-Backpack-Meta-Review-Prompt.md')
      const key4 = getCanonicalFileKey('GPT-6-Astra%20Backpack%20Meta%20Review%20Prompt.md')

      assert.equal(key1, 'gpt_6_astra_backpack_meta_review_prompt.md')
      assert.equal(key1, key2)
      assert.equal(key2, key3)
      assert.equal(key3, key4)
    })

    test('isSameFileSemantics returns true for equivalent filenames with different separators', () => {
      assert.equal(
        isSameFileSemantics(
          'GPT-6-Astra_Backpack_Meta_Review_Prompt.md',
          'C:/Godot/AISpace/GPT-6-Astra Backpack Meta Review Prompt.md'
        ),
        true
      )
      assert.equal(
        isSameFileSemantics(
          'addons/A1/test.gd',
          'C:/Godot/AISpace/addons/A1/test.gd'
        ),
        true
      )
    })

    test('SAFETY INVARIANT: never matches different files (zero false positives)', () => {
      // Different extension
      assert.equal(
        isSameFileSemantics('Review_Prompt.md', 'Review_Prompt.txt'),
        false
      )
      // Extra token (v2)
      assert.equal(
        isSameFileSemantics(
          'GPT-6-Astra_Backpack_Meta_Review_Prompt.md',
          'GPT-6-Astra_Backpack_Meta_Review_Prompt_v2.md'
        ),
        false
      )
      // Completely different file with partial substring
      assert.equal(
        isSameFileSemantics('Astra.md', 'GPT-6-Astra_Backpack_Meta_Review_Prompt.md'),
        false
      )
      // Different parent directory when both are specified
      assert.equal(
        isSameFileSemantics('C:/DirA/utils.ts', 'C:/DirB/utils.ts'),
        false
      )
    })
  })

  describe('findBestMatchingFileInGroups', () => {
    test('prioritizes item with content even if another group matched first', () => {
      const groups: WorkGroup[] = [
        {
          kind: 'edit',
          item: {
            partId: 'edit_1',
            tool: 'write_file',
            filePath: 'C:/Godot/AISpace/GPT-6-Astra Backpack Meta Review Prompt.md',
            fileName: 'GPT-6-Astra Backpack Meta Review Prompt.md',
            relativeDir: '',
            status: 'added',
            additions: 120,
            deletions: 0,
            unified: '',
            source: 'empty',
            toolStatus: 'completed',
            rawPart: {} as any,
          },
        },
        {
          kind: 'explore',
          items: [
            {
              partId: 'explore_1',
              tool: 'read',
              pathOrQuery: 'GPT-6-Astra_Backpack_Meta_Review_Prompt.md',
              fullPath: 'C:/Godot/AISpace/GPT-6-Astra_Backpack_Meta_Review_Prompt.md',
              kind: 'file',
              status: 'completed',
              output: '# Full File Content Here\nLine 2',
            },
          ],
          collapsedDefault: true,
        },
      ]

      const result = findBestMatchingFileInGroups(
        'GPT-6-Astra_Backpack_Meta_Review_Prompt.md',
        groups
      )

      assert.equal(result.matchScore >= 85, true)
      assert.equal(result.content, '# Full File Content Here\nLine 2')
      assert.equal(result.fullPath, 'C:/Godot/AISpace/GPT-6-Astra_Backpack_Meta_Review_Prompt.md')
    })

    test('extracts edit content when only edit item exists', () => {
      const groups: WorkGroup[] = [
        {
          kind: 'edit',
          item: {
            partId: 'edit_1',
            tool: 'write_file',
            filePath: 'C:/Godot/AISpace/GPT-6-Astra_Backpack_Meta_Review_Prompt.md',
            fileName: 'GPT-6-Astra_Backpack_Meta_Review_Prompt.md',
            relativeDir: '',
            status: 'added',
            additions: 10,
            deletions: 0,
            unified: '--- a/file\n+++ b/file\n+line 1',
            source: 'write',
            toolStatus: 'completed',
            rawPart: {
              state: {
                input: {
                  content: 'Created file text',
                },
              },
            } as any,
          },
        },
      ]

      const result = findBestMatchingFileInGroups(
        'GPT-6-Astra Backpack Meta Review Prompt.md',
        groups
      )

      assert.equal(result.content, 'Created file text')
      assert.equal(result.fullPath, 'C:/Godot/AISpace/GPT-6-Astra_Backpack_Meta_Review_Prompt.md')
    })
  })
})
