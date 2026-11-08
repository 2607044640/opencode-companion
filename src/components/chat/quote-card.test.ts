import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getQuoteStats, formatQuoteTag, allocateNextQuoteId, createQuoteAttachment } from '../../utils/quote'
import type { QuoteCardProps } from './QuoteCard'

describe('QuoteCard data contracts and properties', () => {
  it('formats QuoteCard tag and stats accurately', () => {
    const content = 'Line one\nLine two with details\nLine three'
    const stats = getQuoteStats(content)

    const props: QuoteCardProps = {
      quoteId: 'Quote',
      content,
      onClick: () => {},
      compact: true,
    }

    assert.equal(props.quoteId, 'Quote')
    assert.equal(formatQuoteTag(props.quoteId), '@[Quote]')
    assert.equal(stats.lineCount, 3)
    assert.ok(stats.previewText.includes('Line one'))
  })

  it('handles multi-quote sequential naming and card generation', () => {
    const att1 = createQuoteAttachment('first snippet', [], 'Quote')
    const nextId = allocateNextQuoteId('Look at @[Quote]', [att1])
    assert.equal(nextId, 'Quote 2')
    assert.equal(formatQuoteTag(nextId), '@[Quote 2]')

    const att2 = createQuoteAttachment('second snippet', [att1], nextId)
    assert.equal(att2.name, 'Quote 2')
    assert.equal(att2.pastedId, 'Quote 2')
  })
})
