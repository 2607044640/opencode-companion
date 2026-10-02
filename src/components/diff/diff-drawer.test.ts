import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { editItemsToTurnFiles } from './DiffDrawerContext'
import type { EditItem } from '../../utils/worked-summary'

describe('DiffDrawerContext unit tests', () => {
  test('editItemsToTurnFiles preserves all multiple edits for the same file', () => {
    const rawPart: any = { id: 'p1', type: 'tool', tool: 'edit' }
    const items: EditItem[] = [
      {
        partId: 'part_1',
        tool: 'edit',
        filePath: 'C:/AICore/global/rules/AGENTS_Antigravity.md',
        fileName: 'AGENTS_Antigravity.md',
        relativeDir: 'global/rules',
        status: 'modified',
        additions: 4,
        deletions: 0,
        unified: '@@ -30,0 +31,4 @@\n+line1\n+line2',
        source: 'metadata',
        toolStatus: 'completed',
        rawPart,
      },
      {
        partId: 'part_2',
        tool: 'edit',
        filePath: 'C:/AICore/global/rules/AGENTS_Antigravity.md',
        fileName: 'AGENTS_Antigravity.md',
        relativeDir: 'global/rules',
        status: 'modified',
        additions: 1,
        deletions: 1,
        unified: '@@ -50,1 +50,1 @@\n-old\n+new',
        source: 'metadata',
        toolStatus: 'completed',
        rawPart,
      },
      {
        partId: 'part_3',
        tool: 'edit',
        filePath: 'C:/AICore/global/rules/AGENTS_Antigravity.md',
        fileName: 'AGENTS_Antigravity.md',
        relativeDir: 'global/rules',
        status: 'modified',
        additions: 1,
        deletions: 1,
        unified: '@@ -60,1 +60,1 @@\n-(1)-(5)\n+(1)-(6)',
        source: 'metadata',
        toolStatus: 'completed',
        rawPart,
      },
      {
        partId: 'part_4',
        tool: 'write',
        filePath: 'C:/APISpace/new-file.ts',
        fileName: 'new-file.ts',
        relativeDir: 'APISpace',
        status: 'added',
        additions: 10,
        deletions: 0,
        unified: '@@ -0,0 +1,10 @@\n+const x = 1;',
        source: 'write',
        toolStatus: 'completed',
        rawPart,
      },
    ]

    const turnFiles = editItemsToTurnFiles(items, 'msg_turn_1')

    // Three edits of the same file collapse into one card; the other file stays separate.
    assert.equal(turnFiles.length, 2)

    assert.equal(turnFiles[0].partId, 'part_3')
    assert.equal(turnFiles[0].filePath, 'C:/AICore/global/rules/AGENTS_Antigravity.md')
    assert.equal(turnFiles[0].mergedEditCount, 3)
    assert.equal(turnFiles[0].additions, 4)
    assert.equal(turnFiles[0].deletions, 2)
    assert.equal(turnFiles[0].hunks?.length, 1)
    const texts = turnFiles[0].hunks?.[0].lines.map((line) => line.text) ?? []
    assert.equal(texts.includes('line1'), true)
    assert.equal(texts.includes('new'), true)
    assert.equal(texts.includes('(1)-(6)'), true)

    assert.equal(turnFiles[1].partId, 'part_4')
    assert.equal(turnFiles[1].filePath, 'C:/APISpace/new-file.ts')
    assert.equal(turnFiles[1].mergedEditCount, undefined)
    assert.equal(turnFiles[1].additions, 10)
  })
})
