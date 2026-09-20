import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseUnifiedHunks, buildUnifiedDiff, collapseUnchangedLines } from './tool-diff'
import { countDiffLines } from './worked-summary'

describe('tool-diff Unit Tests (Prometheus T2 Specification)', () => {
  test('parseUnifiedHunks parses single hunk with old and new line numbers', () => {
    const diff = [
      '--- a/src/test.ts',
      '+++ b/src/test.ts',
      '@@ -10,4 +10,5 @@ function test()',
      ' const a = 1',
      '-const b = 2',
      '+const b = 20',
      '+const c = 30',
      ' return a + b',
    ].join('\n')

    const hunks = parseUnifiedHunks(diff)
    assert.equal(hunks.length, 1)
    const h = hunks[0]
    assert.equal(h.oldStart, 10)
    assert.equal(h.newStart, 10)
    assert.equal(h.lines.length, 5)

    // Line 1: ctx
    assert.equal(h.lines[0].kind, 'ctx')
    assert.equal(h.lines[0].oldNo, 10)
    assert.equal(h.lines[0].newNo, 10)

    // Line 2: del
    assert.equal(h.lines[1].kind, 'del')
    assert.equal(h.lines[1].oldNo, 11)
    assert.equal(h.lines[1].newNo, undefined)

    // Line 3: add
    assert.equal(h.lines[2].kind, 'add')
    assert.equal(h.lines[2].oldNo, undefined)
    assert.equal(h.lines[2].newNo, 11)

    // Line 4: add
    assert.equal(h.lines[3].kind, 'add')
    assert.equal(h.lines[3].oldNo, undefined)
    assert.equal(h.lines[3].newNo, 12)

    // Line 5: ctx
    assert.equal(h.lines[4].kind, 'ctx')
    assert.equal(h.lines[4].oldNo, 12)
    assert.equal(h.lines[4].newNo, 13)
  })

  test('buildUnifiedDiff synthesizes unified diff from old and new strings', () => {
    const oldStr = 'line 1\nline 2'
    const newStr = 'line 1\nline 2 modified\nline 3'
    const diff = buildUnifiedDiff('file.txt', oldStr, newStr)

    assert.equal(diff.includes('--- a/file.txt'), true)
    assert.equal(diff.includes('+++ b/file.txt'), true)
    assert.equal(diff.includes('@@ -1,2 +1,3 @@'), true)

    const counts = countDiffLines(diff)
    assert.equal(counts.deletions, 2)
    assert.equal(counts.additions, 3)
  })

  test('buildUnifiedDiff handles new file creation', () => {
    const diff = buildUnifiedDiff('newfile.ts', '', 'hello\nworld')
    assert.equal(diff.includes('--- /dev/null'), true)
    assert.equal(diff.includes('+++ b/newfile.ts'), true)
    const counts = countDiffLines(diff)
    assert.equal(counts.additions, 2)
    assert.equal(counts.deletions, 0)
  })

  test('parseUnifiedHunks skips Index/===/---/+++ preamble before first @@ hunk', () => {
    const diff = [
      'Index: /workspace/projects/APISpace/src/utils/tool-diff.ts',
      '===================================================================',
      '--- /workspace/projects/APISpace/src/utils/tool-diff.ts',
      '+++ /workspace/projects/APISpace/src/utils/tool-diff.ts',
      '@@ -168,3 +168,3 @@ export function parseUnifiedHunks',
      ' const a = 1',
      '-const b = 2',
      '+const b = 20',
    ].join('\n')

    const hunks = parseUnifiedHunks(diff)
    assert.equal(hunks.length, 1)
    const h = hunks[0]
    assert.equal(h.oldStart, 168)
    assert.equal(h.newStart, 168)
    assert.equal(h.lines.length, 3)
    assert.equal(h.lines[0].kind, 'ctx')
    assert.equal(h.lines[0].text, 'const a = 1')
    assert.equal(h.lines[0].oldNo, 168)
    assert.equal(
      hunks.some((hunk) => hunk.lines.some((line) => line.text.includes('Index:'))),
      false
    )
    assert.equal(
      hunks.some((hunk) => hunk.lines.some((line) => line.text.includes('===='))),
      false
    )
  })

  test('parseUnifiedHunks skips diff --git / index SHA preamble', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'index abcdef0..1234567 100644',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,2 +1,2 @@',
      '-old',
      '+new',
    ].join('\n')

    const hunks = parseUnifiedHunks(diff)
    assert.equal(hunks.length, 1)
    assert.equal(hunks[0].oldStart, 1)
    assert.equal(hunks[0].lines.length, 2)
    assert.equal(hunks[0].lines[0].kind, 'del')
    assert.equal(hunks[0].lines[0].text, 'old')
    assert.equal(
      hunks.some((hunk) => hunk.lines.some((line) => line.text.startsWith('diff --git'))),
      false
    )
  })

  test('collapseUnchangedLines keeps short context around edits', () => {
    const lines = [
      { kind: 'ctx' as const, text: 'a', oldNo: 1, newNo: 1 },
      { kind: 'ctx' as const, text: 'b', oldNo: 2, newNo: 2 },
      { kind: 'add' as const, text: 'c', newNo: 3 },
      { kind: 'ctx' as const, text: 'd', oldNo: 3, newNo: 4 },
    ]
    const rows = collapseUnchangedLines(lines)
    assert.equal(rows.every((row) => row.type === 'line'), true)
    assert.equal(rows.length, 4)
  })

  test('collapseUnchangedLines hides long leading context with +N more lines', () => {
    const lines = [
      ...Array.from({ length: 10 }, (_, i) => ({
        kind: 'ctx' as const,
        text: `ctx${i}`,
        oldNo: i + 1,
        newNo: i + 1,
      })),
      { kind: 'add' as const, text: 'changed', newNo: 11 },
    ]
    const rows = collapseUnchangedLines(lines)
    assert.equal(rows[0].type, 'collapse')
    if (rows[0].type === 'collapse') {
      assert.equal(rows[0].count, 7)
    }
    assert.equal(rows.filter((row) => row.type === 'line').length, 4)
  })

  test('collapseUnchangedLines keeps pad on both sides between two edits', () => {
    const lines = [
      { kind: 'add' as const, text: 'first', newNo: 1 },
      ...Array.from({ length: 12 }, (_, i) => ({
        kind: 'ctx' as const,
        text: `mid${i}`,
        oldNo: i + 1,
        newNo: i + 2,
      })),
      { kind: 'del' as const, text: 'last', oldNo: 13 },
    ]
    const rows = collapseUnchangedLines(lines)
    const collapse = rows.find((row) => row.type === 'collapse')
    assert.ok(collapse)
    if (collapse && collapse.type === 'collapse') {
      assert.equal(collapse.count, 6)
    }
    assert.equal(rows[0].type, 'line')
    assert.equal(rows[rows.length - 1].type, 'line')
  })

  test('collapseUnchangedLines reveals lines partially from head and tail', () => {
    const lines = [
      { kind: 'add' as const, text: 'start', newNo: 1 },
      ...Array.from({ length: 30 }, (_, i) => ({
        kind: 'ctx' as const,
        text: `ctx${i}`,
        oldNo: i + 1,
        newNo: i + 2,
      })),
      { kind: 'add' as const, text: 'end', newNo: 32 },
    ]
    // 30 context lines: keepHead=3, keepTail=3, hidden=24.
    const initialRows = collapseUnchangedLines(lines)
    const initialCollapse = initialRows.find((r) => r.type === 'collapse')
    assert.ok(initialCollapse)
    assert.equal(initialCollapse?.type === 'collapse' ? initialCollapse.count : 0, 24)
    const collapseId = initialCollapse?.type === 'collapse' ? initialCollapse.id : ''

    // Reveal 10 from head
    const headRows = collapseUnchangedLines(lines, {
      revealed: { [collapseId]: { head: 10, tail: 0 } },
    })
    const headCollapse = headRows.find((r) => r.type === 'collapse')
    assert.ok(headCollapse)
    assert.equal(headCollapse?.type === 'collapse' ? headCollapse.count : 0, 14)

    // Reveal 10 from head + 10 from tail
    const bothRows = collapseUnchangedLines(lines, {
      revealed: { [collapseId]: { head: 10, tail: 10 } },
    })
    const bothCollapse = bothRows.find((r) => r.type === 'collapse')
    assert.ok(bothCollapse)
    assert.equal(bothCollapse?.type === 'collapse' ? bothCollapse.count : 0, 4)

    // Fully revealed (head + tail >= hidden) -> collapse disappears completely
    const fullyRows = collapseUnchangedLines(lines, {
      revealed: { [collapseId]: { head: 15, tail: 15 } },
    })
    assert.equal(fullyRows.some((r) => r.type === 'collapse'), false)
    assert.equal(fullyRows.length, 32)
  })
})
