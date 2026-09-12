import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseUnifiedHunks, buildUnifiedDiff } from './tool-diff'
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
})
