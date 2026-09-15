import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Message } from '../types/opencode'
import {
  findMatchesInMessages,
  extractMessageSearchableText,
  FIND_MATCH_FALLBACK_PADDING_PX,
} from './find-in-page'
import { computeMatchScrollTop } from './find-in-page-dom'

function createMockMessage(id: string, text: string, thinking?: string): Message {
  const parts: any[] = [{ id: `p_${id}_1`, type: 'text', text }]
  if (thinking) {
    parts.push({ id: `p_${id}_2`, type: 'reasoning', thinking })
  }
  return {
    info: {
      id,
      role: 'assistant',
      time: { created: Date.now() },
    },
    parts,
  }
}

describe('Find in Page Utility (find-in-page.ts)', () => {
  it('returns empty array when query is empty or whitespace', () => {
    const messages = [createMockMessage('m1', 'Hello world')]
    assert.deepEqual(findMatchesInMessages(messages, ''), [])
    assert.deepEqual(findMatchesInMessages(messages, '   '), [])
  })

  it('performs case-insensitive substring search by default', () => {
    const messages = [
      createMockMessage('m1', '5分钟内完成代码审计。'),
      createMockMessage('m2', '请等待 5分钟，然后继续'),
      createMockMessage('m3', '无关内容'),
    ]

    const matches = findMatchesInMessages(messages, '5分钟')
    assert.equal(matches.length, 2)
    assert.equal(matches[0].messageId, 'm1')
    assert.equal(matches[1].messageId, 'm2')
  })

  it('handles multiple occurrences within the same message', () => {
    const messages = [
      createMockMessage('m1', 'hello world, hello test, hello again'),
    ]

    const matches = findMatchesInMessages(messages, 'hello')
    assert.equal(matches.length, 3)
    assert.equal(matches[0].matchIndex, 0)
    assert.equal(matches[1].matchIndex, 1)
    assert.equal(matches[2].matchIndex, 2)
  })

  it('respects matchCase option', () => {
    const messages = [
      createMockMessage('m1', 'Atlas is planning'),
      createMockMessage('m2', 'atlas is executing'),
    ]

    const insensitive = findMatchesInMessages(messages, 'Atlas', { matchCase: false })
    assert.equal(insensitive.length, 2)

    const sensitive = findMatchesInMessages(messages, 'Atlas', { matchCase: true })
    assert.equal(sensitive.length, 1)
    assert.equal(sensitive[0].messageId, 'm1')
  })

  it('respects matchWholeWord option', () => {
    const messages = [
      createMockMessage('m1', 'cat and catalog'),
    ]

    const all = findMatchesInMessages(messages, 'cat', { matchWholeWord: false })
    assert.equal(all.length, 2)

    const wholeOnly = findMatchesInMessages(messages, 'cat', { matchWholeWord: true })
    assert.equal(wholeOnly.length, 1)
  })

  it('handles regex searching and gracefully ignores invalid regex', () => {
    const messages = [
      createMockMessage('m1', 'pipe_modules.py is 408 LOC'),
      createMockMessage('m2', 'pipe_routes.py is 120 LOC'),
    ]

    const regexMatches = findMatchesInMessages(messages, 'pipe_\\w+\\.py', { useRegex: true })
    assert.equal(regexMatches.length, 2)

    // Incomplete or invalid regex syntax shouldn't crash
    const invalidMatches = findMatchesInMessages(messages, '[unclosed', { useRegex: true })
    assert.deepEqual(invalidMatches, [])
  })

  it('includes searchable text from thinking parts', () => {
    const messages = [
      createMockMessage('m1', 'Final output', 'Internal reasoning with keyword secretKey'),
    ]

    const matches = findMatchesInMessages(messages, 'secretKey')
    assert.equal(matches.length, 1)
    assert.equal(matches[0].messageId, 'm1')
  })

  it('extracts reasoning from OpenCode text field', () => {
    const messages: Message[] = [
      {
        info: { id: 'm1', role: 'assistant', time: { created: Date.now() } },
        parts: [
          { id: 'p1', type: 'text', text: 'Final output' },
          { id: 'p2', type: 'reasoning', text: 'schema reasoning with token schemaKey' },
        ],
      } as Message,
    ]

    assert.match(extractMessageSearchableText(messages[0]), /schemaKey/)
    const matches = findMatchesInMessages(messages, 'schemaKey')
    assert.equal(matches.length, 1)
    assert.equal(matches[0].messageId, 'm1')
  })

  it('prefers reasoning text over legacy thinking when both exist', () => {
    const message = {
      info: { id: 'm1', role: 'assistant', time: { created: Date.now() } },
      parts: [
        { id: 'p1', type: 'reasoning', text: 'alphaToken', thinking: 'betaToken' },
      ],
    } as Message

    const extracted = extractMessageSearchableText(message)
    assert.equal(extracted.includes('alphaToken'), true)
    assert.equal(extracted.includes('betaToken'), false)
  })

  it('centers scroll on the match rect, not the message midpoint', () => {
    const container = {
      getBoundingClientRect: () => ({ top: 100 }),
      scrollTop: 400,
      clientHeight: 800,
    } as HTMLElement
    const fallbackEl = {
      getBoundingClientRect: () => ({ top: 200, height: 3000 }),
    } as HTMLElement
    const matchRect = { top: 180, height: 16, width: 40 } as DOMRect

    const top = computeMatchScrollTop(container, matchRect, fallbackEl)
    assert.equal(top, 88)
    assert.notEqual(top, 200 - 100 + 400 - 400 + 1500)
  })

  it('falls back to message top plus padding when range rect is missing', () => {
    const container = {
      getBoundingClientRect: () => ({ top: 50 }),
      scrollTop: 200,
      clientHeight: 800,
    } as HTMLElement
    const fallbackEl = {
      getBoundingClientRect: () => ({ top: 300, height: 2400 }),
    } as HTMLElement

    const top = computeMatchScrollTop(container, null, fallbackEl)
    assert.equal(top, 300 - 50 + 200 - FIND_MATCH_FALLBACK_PADDING_PX)
    assert.notEqual(top, 300 - 50 + 200 - 400 + 1200)
  })

  it('uses distinct scroll tops for two matches inside the same message', () => {
    const container = {
      getBoundingClientRect: () => ({ top: 0 }),
      scrollTop: 0,
      clientHeight: 600,
    } as HTMLElement
    const fallbackEl = {
      getBoundingClientRect: () => ({ top: 0, height: 2000 }),
    } as HTMLElement

    const first = computeMatchScrollTop(container, { top: 40, height: 20, width: 10 } as DOMRect, fallbackEl)
    const second = computeMatchScrollTop(container, { top: 900, height: 20, width: 10 } as DOMRect, fallbackEl)
    assert.notEqual(first, second)
    assert.ok(second > first)
  })
})
