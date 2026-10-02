import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applySlashCommand, detectSlashTrigger } from './slash-trigger'

describe('detectSlashTrigger', () => {
  it('opens at the start of the field', () => {
    const hit = detectSlashTrigger('/goal', 5)
    assert.deepEqual(hit, { slashIndex: 0, query: 'goal' })
  })

  it('opens after whitespace mid-sentence', () => {
    const text = '有没有可以根据这个 /instructio'
    const hit = detectSlashTrigger(text, text.length)
    assert.equal(hit?.query, 'instructio')
    assert.equal(text[hit!.slashIndex], '/')
  })

  it('opens after a newline', () => {
    const text = 'line one\n/sch'
    const hit = detectSlashTrigger(text, text.length)
    assert.equal(hit?.query, 'sch')
  })

  it('does not open when / is glued to a word', () => {
    assert.equal(detectSlashTrigger('see http://exa', 'see http://exa'.length), null)
    assert.equal(detectSlashTrigger('path a/b', 'path a/b'.length), null)
  })

  it('closes once the token contains a space', () => {
    assert.equal(detectSlashTrigger('/goal extra', '/goal extra'.length), null)
  })

  it('closes once the cursor has left the slash token', () => {
    const text = 'keep /goal and more'
    const cursor = text.indexOf('more')
    assert.equal(detectSlashTrigger(text, cursor), null)
  })
})

describe('applySlashCommand', () => {
  it('replaces only the slash slice and keeps surrounding text', () => {
    const text = '看看这个 /ins 后面'
    const cursor = text.indexOf(' 后面')
    const next = applySlashCommand(text, cursor, 'instruction')
    assert.equal(next?.text, '看看这个 /instruction  后面')
    assert.equal(next?.cursor, '看看这个 /instruction '.length)
  })

  it('returns null when no slash token is under the cursor', () => {
    assert.equal(applySlashCommand('no slash here', 4, 'goal'), null)
  })
})
