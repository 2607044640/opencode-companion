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

  test('reconcileHistoryWithOptimistic: NEVER leaks Turn 1 file parts into text-only Turn 2 user prompt (Regression: Figure 1 into Figure 2)', () => {
    const prev: Message[] = [
      // Turn 1 user message: has 4 attached images
      {
        info: { id: 'usr_turn_1', sessionID: 'ses_1', role: 'user', time: { created: 100 } },
        parts: [
          {
            id: 'prt_t1_f1',
            sessionID: 'ses_1',
            messageID: 'usr_turn_1',
            type: 'file',
            mime: 'image/png',
            filename: 'img1.png',
            url: 'data:image/png;base64,1',
          },
          {
            id: 'prt_t1_f2',
            sessionID: 'ses_1',
            messageID: 'usr_turn_1',
            type: 'file',
            mime: 'image/png',
            filename: 'img2.png',
            url: 'data:image/png;base64,2',
          },
          {
            id: 'prt_t1_txt',
            sessionID: 'ses_1',
            messageID: 'usr_turn_1',
            type: 'text',
            text: 'Turn 1 prompt with 4 images',
          },
        ],
      },
      // Turn 1 assistant reply
      {
        info: { id: 'ast_turn_1', sessionID: 'ses_1', role: 'assistant', time: { created: 110 } },
        parts: [{ id: 'prt_ast_1', sessionID: 'ses_1', messageID: 'ast_turn_1', type: 'text', text: 'Turn 1 answer' }],
      },
      // Turn 2 user prompt: text-only (sent via send button, no attachments)
      {
        info: { id: 'usr_turn_2_opt', sessionID: 'ses_1', role: 'user', time: { created: 200 } },
        parts: [
          {
            id: 'prt_t2_txt',
            sessionID: 'ses_1',
            messageID: 'usr_turn_2_opt',
            type: 'text',
            text: '认可不使用high而不是medium吗',
            isOptimistic: true,
          },
        ],
      },
    ]

    const history: Message[] = [
      // Backend history has Turn 1 (with its file parts)
      {
        info: { id: 'usr_turn_1', sessionID: 'ses_1', role: 'user', time: { created: 100 } },
        parts: [
          {
            id: 'prt_t1_f1',
            sessionID: 'ses_1',
            messageID: 'usr_turn_1',
            type: 'file',
            mime: 'image/png',
            filename: 'img1.png',
            url: 'data:image/png;base64,1',
          },
          {
            id: 'prt_t1_f2',
            sessionID: 'ses_1',
            messageID: 'usr_turn_1',
            type: 'file',
            mime: 'image/png',
            filename: 'img2.png',
            url: 'data:image/png;base64,2',
          },
          {
            id: 'prt_t1_txt',
            sessionID: 'ses_1',
            messageID: 'usr_turn_1',
            type: 'text',
            text: 'Turn 1 prompt with 4 images',
          },
        ],
      },
      {
        info: { id: 'ast_turn_1', sessionID: 'ses_1', role: 'assistant', time: { created: 110 } },
        parts: [{ id: 'prt_ast_1', sessionID: 'ses_1', messageID: 'ast_turn_1', type: 'text', text: 'Turn 1 answer' }],
      },
      // Backend history has Turn 2 (text-only)
      {
        info: { id: 'usr_turn_2_backend', sessionID: 'ses_1', role: 'user', time: { created: 205 } },
        parts: [
          {
            id: 'prt_t2_backend_txt',
            sessionID: 'ses_1',
            messageID: 'usr_turn_2_backend',
            type: 'text',
            text: '认可不使用high而不是medium吗',
          },
        ],
      },
    ]

    const reconciled = reconcileHistoryWithOptimistic(history, prev)
    assert.equal(reconciled.length, 3)

    // Turn 1 retains its 2 file parts and 1 text part
    assert.equal(reconciled[0].parts.filter((p) => p.type === 'file').length, 2)

    // Turn 2 MUST NOT have any file parts from Turn 1!
    const turn2Files = reconciled[2].parts.filter((p) => p.type === 'file')
    assert.equal(turn2Files.length, 0, 'Turn 2 must NOT receive Turn 1 images')
    assert.equal(reconciled[2].parts.length, 1)
    assert.equal((reconciled[2].parts[0] as any).text, '认可不使用high而不是medium吗')
  })

  test('reconcileHistoryWithOptimistic: isolates optimistic attachments strictly to their own matching turn', () => {
    const prev: Message[] = [
      // Turn 1 user message: historical, has img1
      {
        info: { id: 'usr_turn_1', sessionID: 'ses_1', role: 'user', time: { created: 100 } },
        parts: [
          {
            id: 'prt_t1_f1',
            sessionID: 'ses_1',
            messageID: 'usr_turn_1',
            type: 'file',
            mime: 'image/png',
            filename: 'img1.png',
            url: 'data:image/png;base64,1',
          },
          { id: 'prt_t1_txt', sessionID: 'ses_1', messageID: 'usr_turn_1', type: 'text', text: 'Question 1' },
        ],
      },
      // Turn 2 user message: optimistic, has img2
      {
        info: { id: 'usr_turn_2_opt', sessionID: 'ses_1', role: 'user', time: { created: 200 } },
        parts: [
          {
            id: 'prt_t2_f2',
            sessionID: 'ses_1',
            messageID: 'usr_turn_2_opt',
            type: 'file',
            mime: 'image/png',
            filename: 'img2.png',
            url: 'data:image/png;base64,2',
            isOptimistic: true,
          },
          {
            id: 'prt_t2_txt',
            sessionID: 'ses_1',
            messageID: 'usr_turn_2_opt',
            type: 'text',
            text: 'Question 2',
            isOptimistic: true,
          },
        ],
      },
    ]

    const history: Message[] = [
      {
        info: { id: 'usr_turn_1', sessionID: 'ses_1', role: 'user', time: { created: 100 } },
        parts: [
          {
            id: 'prt_t1_f1',
            sessionID: 'ses_1',
            messageID: 'usr_turn_1',
            type: 'file',
            mime: 'image/png',
            filename: 'img1.png',
            url: 'data:image/png;base64,1',
          },
          { id: 'prt_t1_txt', sessionID: 'ses_1', messageID: 'usr_turn_1', type: 'text', text: 'Question 1' },
        ],
      },
      {
        info: { id: 'usr_turn_2_backend', sessionID: 'ses_1', role: 'user', time: { created: 205 } },
        parts: [
          { id: 'prt_t2_backend_txt', sessionID: 'ses_1', messageID: 'usr_turn_2_backend', type: 'text', text: 'Question 2' },
        ],
      },
    ]

    const reconciled = reconcileHistoryWithOptimistic(history, prev)
    assert.equal(reconciled.length, 2)

    // Turn 1 has img1
    const t1Files = reconciled[0].parts.filter((p) => p.type === 'file')
    assert.equal(t1Files.length, 1)
    assert.equal((t1Files[0] as any).filename, 'img1.png')

    // Turn 2 receives ONLY img2 (never img1)
    const t2Files = reconciled[1].parts.filter((p) => p.type === 'file')
    assert.equal(t2Files.length, 1)
    assert.equal((t2Files[0] as any).filename, 'img2.png')
    assert.equal((t2Files[0] as any).messageID, 'usr_turn_2_backend')
  })
})
