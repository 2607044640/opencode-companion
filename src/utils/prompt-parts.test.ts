import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPromptParts,
  buildOptimisticMessage,
  reconcileHistoryWithOptimistic,
} from './prompt-parts'
import type { Message, PromptAttachment } from '../types/opencode'

describe('Prompt Parts & Optimistic Message Resolvers', () => {
  test('buildPromptParts: creates text part for string without attachments', () => {
    const parts = buildPromptParts('Hello world')
    assert.equal(parts.length, 1)
    assert.equal(parts[0].type, 'text')
    assert.equal((parts[0] as any).text, 'Hello world')
  })

  test('buildPromptParts: creates file and text parts when attachments present', () => {
    const attachments: PromptAttachment[] = [
      {
        id: 'att_1',
        name: 'test.png',
        mime: 'image/png',
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
      },
    ]
    const parts = buildPromptParts('Inspect this image', attachments)
    assert.equal(parts.length, 2)
    assert.equal(parts[0].type, 'file')
    assert.equal((parts[0] as any).filename, 'test.png')
    assert.equal((parts[0] as any).mime, 'image/png')
    assert.equal((parts[0] as any).url, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==')
    assert.equal(parts[1].type, 'text')
    assert.equal((parts[1] as any).text, 'Inspect this image')
  })

  test('buildPromptParts: supports image-only input without text', () => {
    const attachments: PromptAttachment[] = [
      {
        name: 'photo.jpg',
        mime: 'image/jpeg',
        url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      },
    ]
    const parts = buildPromptParts('   ', attachments)
    assert.equal(parts.length, 1)
    assert.equal(parts[0].type, 'file')
    assert.equal((parts[0] as any).filename, 'photo.jpg')
    assert.equal((parts[0] as any).mime, 'image/jpeg')
  })

  test('buildPromptParts: merges attachments into pre-existing MessagePartInput array without duplicates', () => {
    const existing = [
      {
        type: 'text' as const,
        text: 'Existing question',
      },
    ]
    const attachments: PromptAttachment[] = [
      {
        name: 'chart.png',
        mime: 'image/png',
        url: 'data:image/png;base64,chartdata',
      },
    ]
    const parts = buildPromptParts(existing, attachments)
    assert.equal(parts.length, 2)
    assert.equal(parts[0].type, 'file')
    assert.equal(parts[1].type, 'text')

    // Calling again with same attachment should deduplicate by URL
    const partsDedupe = buildPromptParts(parts, attachments)
    assert.equal(partsDedupe.length, 2)
  })

  test('buildOptimisticMessage: constructs valid user message with optimistic flag', () => {
    const attachments: PromptAttachment[] = [
      {
        name: 'diag.png',
        mime: 'image/png',
        url: 'data:image/png;base64,diag',
      },
    ]
    const msg = buildOptimisticMessage({
      sessionId: 'ses_123',
      text: 'Analyze diagram',
      attachments,
      agent: 'build',
      model: { providerID: 'anthropic', modelID: 'claude-3-5-sonnet' },
    })

    assert.equal(msg.info.role, 'user')
    assert.equal(msg.info.sessionID, 'ses_123')
    assert.equal(msg.info.agent, 'build')
    assert.equal(msg.parts.length, 2)
    assert.equal(msg.parts[0].type, 'file')
    assert.equal((msg.parts[0] as any).isOptimistic, true)
    assert.equal((msg.parts[0] as any).filename, 'diag.png')
    assert.equal(msg.parts[1].type, 'text')
    assert.equal((msg.parts[1] as any).isOptimistic, true)
    assert.equal((msg.parts[1] as any).text, 'Analyze diagram')
  })

  test('reconcileHistoryWithOptimistic: preserves local optimistic parts if history is empty', () => {
    const prev: Message[] = [
      {
        info: { id: 'usr_opt', sessionID: 'ses_1', role: 'user', time: { created: 100 } },
        parts: [
          {
            id: 'prt_1',
            sessionID: 'ses_1',
            messageID: 'usr_opt',
            type: 'file',
            mime: 'image/png',
            filename: 'test.png',
            url: 'data:image/png;base64,abc',
          },
        ],
      },
    ]
    const result = reconcileHistoryWithOptimistic([], prev)
    assert.equal(result.length, 1)
    assert.equal(result[0].info.id, 'usr_opt')
  })

  test('reconcileHistoryWithOptimistic: merges optimistic file parts into backend history lacking them', () => {
    const prev: Message[] = [
      {
        info: { id: 'usr_opt', sessionID: 'ses_1', role: 'user', time: { created: 100 } },
        parts: [
          {
            id: 'prt_opt_file',
            sessionID: 'ses_1',
            messageID: 'usr_opt',
            type: 'file',
            mime: 'image/png',
            filename: 'screenshot.png',
            url: 'data:image/png;base64,screen',
          },
          {
            id: 'prt_opt_txt',
            sessionID: 'ses_1',
            messageID: 'usr_opt',
            type: 'text',
            text: 'Here is the bug',
          },
        ],
      },
    ]

    const history: Message[] = [
      {
        info: { id: 'usr_backend_1', sessionID: 'ses_1', role: 'user', time: { created: 105 } },
        parts: [
          {
            id: 'prt_backend_txt',
            sessionID: 'ses_1',
            messageID: 'usr_backend_1',
            type: 'text',
            text: 'Here is the bug',
          },
        ],
      },
    ]

    const merged = reconcileHistoryWithOptimistic(history, prev)
    assert.equal(merged.length, 1)
    assert.equal(merged[0].parts.length, 2)
    assert.equal(merged[0].parts[0].type, 'file')
    assert.equal((merged[0].parts[0] as any).filename, 'screenshot.png')
    assert.equal(merged[0].parts[0].messageID, 'usr_backend_1')
    assert.equal(merged[0].parts[1].type, 'text')
  })
})
