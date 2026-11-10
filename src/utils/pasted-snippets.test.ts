import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldConvertToPastedSnippet,
  getNextPastedId,
  getPastedSnippetStats,
  createPastedAttachment,
  formatPastedSnippetCursorPlaceholder,
  insertPastedSnippetPlaceholder,
  serializePromptWithPastedSnippets,
  parsePastedSnippetsFromText,
  isPastedAttachment,
  isImageAttachment,
} from './pasted-snippets'

describe('pasted-snippets utility tests', () => {
  it('evaluates paste threshold by character count and line count', () => {
    assert.equal(shouldConvertToPastedSnippet('short text'), false)
    assert.equal(shouldConvertToPastedSnippet('a'.repeat(600)), true)
    assert.equal(shouldConvertToPastedSnippet('a'.repeat(599)), false)

    const tenLines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n')
    const nineLines = Array.from({ length: 9 }, (_, i) => `line ${i + 1}`).join('\n')
    assert.equal(shouldConvertToPastedSnippet(tenLines), true)
    assert.equal(shouldConvertToPastedSnippet(nineLines), false)

    assert.equal(
      shouldConvertToPastedSnippet('a'.repeat(1000), { enabled: false }),
      false
    )
  })

  it('allocates sequential p1, p2, p3 IDs and reuses freed slots', () => {
    assert.equal(getNextPastedId([]), 'p1')
    const p1 = createPastedAttachment('first block', [])
    assert.equal(p1.pastedId, 'p1')
    assert.equal(isPastedAttachment(p1), true)
    assert.equal(isImageAttachment(p1), false)

    const p2 = createPastedAttachment('second block', [p1])
    assert.equal(p2.pastedId, 'p2')

    // If p1 is removed and only p2 remains, next allocation reuses p1
    assert.equal(getNextPastedId([p2]), 'p1')
    assert.equal(getNextPastedId([p1, p2]), 'p3')
  })

  it('computes accurate line counts, byte sizes, and preview text', () => {
    const sample = 'Line one\nLine two\nLine three\nLine four\nLine five\nLine six'
    const stats = getPastedSnippetStats(sample)
    assert.equal(stats.lineCount, 6)
    assert.equal(stats.charCount, sample.length)
    assert.equal(stats.lines.length, 6)
    assert.equal(stats.lines[0].lineNo, '1')
    assert.equal(stats.lines[5].text, 'Line six')
    assert.match(stats.formattedSize, /B$/)
  })

  it('serializes and parses multiple pasted snippets (p1, p2) with user prompt round-trip', () => {
    const p1 = createPastedAttachment('First pasted content\nwith 2 lines', [], 'p1')
    const p2 = createPastedAttachment('Second pasted content\nwith </pasted_content> inside', [p1], 'p2')

    const serialized = serializePromptWithPastedSnippets('看p1，对比p2的区别', [p1, p2])
    assert.match(serialized, /<pasted_content id="p1"/)
    assert.match(serialized, /<pasted_content id="p2"/)
    assert.match(serialized, /看p1，对比p2的区别$/)

    const parsed = parsePastedSnippetsFromText(serialized)
    assert.equal(parsed.snippets.length, 2)
    assert.equal(parsed.snippets[0].pastedId, 'p1')
    assert.equal(parsed.snippets[0].content, 'First pasted content\nwith 2 lines')
    assert.equal(parsed.snippets[1].pastedId, 'p2')
    assert.equal(parsed.snippets[1].content, 'Second pasted content\nwith </pasted_content> inside')
    assert.equal(parsed.cleanText, '看p1，对比p2的区别')
  })

  it('handles pasted-only submission with empty prompt text', () => {
    const p1 = createPastedAttachment('Standalone pasted block', [], 'p1')
    const serialized = serializePromptWithPastedSnippets('   ', [p1])
    const parsed = parsePastedSnippetsFromText(serialized)
    assert.equal(parsed.snippets.length, 1)
    assert.equal(parsed.snippets[0].pastedId, 'p1')
    assert.equal(parsed.snippets[0].content, 'Standalone pasted block')
    assert.equal(parsed.cleanText, '')
  })

  describe('cursor placeholder generation on paste (p1, p2)', () => {
    it('formats English placeholder like [Here, user inserted p1 text]', () => {
      assert.equal(formatPastedSnippetCursorPlaceholder('p1'), '[Here, user inserted p1 text]')
      assert.equal(formatPastedSnippetCursorPlaceholder('P2'), '[Here, user inserted p2 text]')
      assert.equal(formatPastedSnippetCursorPlaceholder(''), '[Here, user inserted p1 text]')
    })

    it('inserts placeholder into empty prompt with smart trailing space', () => {
      const res = insertPastedSnippetPlaceholder('', 'p1', 0, 0)
      assert.equal(res.newText, '[Here, user inserted p1 text] ')
      assert.equal(res.newCursorPosition, '[Here, user inserted p1 text] '.length)
    })

    it('inserts placeholder with leading space when preceding text lacks whitespace', () => {
      const res = insertPastedSnippetPlaceholder('Check this log:', 'p1', 15, 15)
      assert.equal(res.newText, 'Check this log: [Here, user inserted p1 text] ')
      assert.equal(res.newCursorPosition, 'Check this log: [Here, user inserted p1 text] '.length)
    })

    it('inserts placeholder inside existing text without duplicate spaces', () => {
      const res = insertPastedSnippetPlaceholder('Check:  and fix it', 'p1', 8, 8)
      assert.equal(res.newText, 'Check:  [Here, user inserted p1 text] and fix it')
      assert.equal(res.newCursorPosition, 8 + '[Here, user inserted p1 text] '.length)
    })

    it('replaces active text selection with placeholder cleanly', () => {
      const res = insertPastedSnippetPlaceholder('Look at <selected_code> please', 'p2', 8, 23)
      assert.equal(res.newText, 'Look at [Here, user inserted p2 text] please')
    })
  })
})
