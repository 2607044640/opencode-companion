import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isQuoteAttachment,
  formatQuoteTag,
  getQuoteStats,
  extractQuoteTagsFromText,
  allocateNextQuoteId,
  createQuoteAttachment,
  insertQuoteMentionIntoText,
  serializePromptWithQuotes,
  parseQuotesFromText,
  QUOTE_MIME,
} from './quote'
import type { PromptAttachment } from '../types/opencode'

describe('Quote utilities', () => {
  it('identifies quote attachments by kind or mime', () => {
    assert.strictEqual(isQuoteAttachment(null), false)
    assert.strictEqual(isQuoteAttachment(undefined), false)
    assert.strictEqual(isQuoteAttachment({ mime: 'image/png', url: '' }), false)
    assert.strictEqual(isQuoteAttachment({ kind: 'quote', mime: '', url: '' }), true)
    assert.strictEqual(isQuoteAttachment({ mime: QUOTE_MIME, url: '' }), true)
  })

  it('formats canonical quote tags', () => {
    assert.strictEqual(formatQuoteTag('Quote'), '@[Quote]')
    assert.strictEqual(formatQuoteTag('Quote 2'), '@[Quote 2]')
    assert.strictEqual(formatQuoteTag(''), '@[Quote]')
  })

  it('computes quote stats accurately', () => {
    const stats = getQuoteStats('Line 1\nLine 2\nLine 3')
    assert.strictEqual(stats.lineCount, 3)
    assert.strictEqual(stats.charCount, 20)
    assert.strictEqual(stats.previewText, 'Line 1 Line 2 Line 3')
  })

  it('extracts quote tags from text', () => {
    const text = 'Here is @[Quote] and also @[Quote 2] in action'
    const tags = extractQuoteTagsFromText(text)
    assert.deepStrictEqual(tags, ['Quote', 'Quote 2'])
  })

  it('allocates next quote ID sequentially', () => {
    // Empty state allocates 'Quote'
    assert.strictEqual(allocateNextQuoteId('', []), 'Quote')

    // If 'Quote' is in text, allocates 'Quote 2'
    assert.strictEqual(allocateNextQuoteId('Look at @[Quote]', []), 'Quote 2')

    // If 'Quote' and 'Quote 2' exist in attachments, allocates 'Quote 3'
    const atts: PromptAttachment[] = [
      { id: '1', kind: 'quote', name: 'Quote', mime: QUOTE_MIME, url: '' },
      { id: '2', kind: 'quote', name: 'Quote 2', mime: QUOTE_MIME, url: '' },
    ]
    assert.strictEqual(allocateNextQuoteId('', atts), 'Quote 3')

    // Reuses 'Quote' if only 'Quote 2' exists
    const attsHole: PromptAttachment[] = [
      { id: '2', kind: 'quote', name: 'Quote 2', mime: QUOTE_MIME, url: '' },
    ]
    assert.strictEqual(allocateNextQuoteId('', attsHole), 'Quote')
  })

  it('creates quote attachments with unique IDs and metadata', () => {
    const att = createQuoteAttachment('console.log("hello")', [], 'Quote')
    assert.strictEqual(att.kind, 'quote')
    assert.strictEqual(att.name, 'Quote')
    assert.strictEqual(att.pastedId, 'Quote')
    assert.strictEqual(att.content, 'console.log("hello")')
    assert.strictEqual(att.mime, QUOTE_MIME)
    assert.ok(att.id?.startsWith('quote_'))
  })

  it('inserts quote mention into text with smart spacing', () => {
    // 1. Into empty text
    const res1 = insertQuoteMentionIntoText('', '@[Quote]')
    assert.strictEqual(res1.newText, '@[Quote] ')
    assert.strictEqual(res1.newCursor, 9)

    // 2. At end of text with no trailing space
    const res2 = insertQuoteMentionIntoText('Please analyze', '@[Quote]')
    assert.strictEqual(res2.newText, 'Please analyze @[Quote] ')

    // 3. At middle of text
    const res3 = insertQuoteMentionIntoText('Please and advise', '@[Quote]', 6) // after 'Please'
    assert.strictEqual(res3.newText, 'Please @[Quote] and advise')
  })

  it('serializes prompt with quotes and restores via parseQuotesFromText', () => {
    const quoteContent = 'const a = 123\nconst b = 456'
    const attachments: PromptAttachment[] = [
      createQuoteAttachment(quoteContent, [], 'Quote'),
    ]
    const userPrompt = 'Explain this function @[Quote] please'

    const serialized = serializePromptWithQuotes(userPrompt, attachments)
    assert.ok(serialized.includes('<quote_content id="Quote"'))
    assert.ok(serialized.includes(userPrompt))
    assert.ok(serialized.includes(quoteContent))

    const parsed = parseQuotesFromText(serialized)
    assert.strictEqual(parsed.cleanText, userPrompt)
    assert.strictEqual(parsed.quotes.length, 1)
    assert.strictEqual(parsed.quotes[0].quoteId, 'Quote')
    assert.strictEqual(parsed.quotes[0].tag, '@[Quote]')
    assert.strictEqual(parsed.quotes[0].content, quoteContent)
    assert.strictEqual(parsed.quotes[0].lineCount, 2)
  })
})
