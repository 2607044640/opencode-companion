import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  compactSearchText,
  foldSearchText,
  prepareSearchQuery,
  textMatchesQuery,
} from './search-text'

describe('search text folding', () => {
  it('matches a pasted title against a stored title that kept the newline', () => {
    const stored = '<user_intent>\n那你总结里没有说 ⚠️。一定要在总结后面加明显'
    const pasted = '<user_intent> 那你总结里没有说 ⚠。一定要在总结后面加明显...'
    assert.equal(textMatchesQuery(stored, pasted), true)
    assert.equal(compactSearchText(stored).includes(compactSearchText(prepareSearchQuery(pasted))), true)
  })

  it('strips emoji variation selectors before comparing', () => {
    const stored = '警告\u26A0\uFE0F已确认'
    const query = '警告\u26A0已确认'
    assert.equal(foldSearchText(stored), foldSearchText(query))
    assert.equal(textMatchesQuery(stored, query), true)
  })

  it('drops a trailing ellipsis copied from a truncated window title', () => {
    assert.equal(prepareSearchQuery('会话标题...'), '会话标题')
    assert.equal(prepareSearchQuery('keep ... inside'), 'keep ... inside')
  })
})
