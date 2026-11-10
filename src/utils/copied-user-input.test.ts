import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { Message, FilePart, TextPart, PromptAttachment } from '../types/opencode'
import {
  normalizeCopyText,
  recordCopiedUserInput,
  getCopiedUserInput,
  clearCopiedUserInputMemory,
  extractAttachmentsFromUserMessage,
  matchCopiedUserInput,
  mergePastedUserInputAttachments,
  registerSentMessageAttachments,
} from './copied-user-input'
import { PASTED_SNIPPET_MIME, createPastedAttachment } from './pasted-snippets'

describe('copied-user-input utility tests', () => {
  beforeEach(() => {
    clearCopiedUserInputMemory()
  })

  it('normalizes copy text cleanly', () => {
    assert.equal(normalizeCopyText('  hello\r\nworld  '), 'hello\nworld')
    assert.equal(normalizeCopyText(''), '')
  })

  it('records copied user message snapshot and matches exactly', () => {
    const p1 = createPastedAttachment('const a = 123;\nconsole.log(a);', [], 'p1')
    const img: PromptAttachment = {
      id: 'img_1',
      name: 'screenshot.png',
      mime: 'image/png',
      url: 'data:image/png;base64,abc1234',
      kind: 'image',
    }

    const displayText = 'Check this bug: [Here, user inserted p1 text] and see screenshot'
    const fullText = `<pasted_content id="p1" lines="2" chars="30" size="30 B">\nconst a = 123;\nconsole.log(a);\n</pasted_content>\n\n${displayText}`

    const msg: Message = {
      info: { id: 'msg_test_1', sessionID: 's1', role: 'user' },
      parts: [
        { type: 'file', id: 'f1', mime: 'image/png', filename: 'screenshot.png', url: 'data:image/png;base64,abc1234' } as FilePart,
        { type: 'text', id: 't1', text: fullText } as TextPart,
      ],
    }

    recordCopiedUserInput({
      message: msg,
      displayText,
      fullText,
      copiedText: displayText,
      attachments: [p1, img],
    })

    const active = getCopiedUserInput()
    assert.ok(active)
    assert.equal(active.displayText, displayText)
    assert.equal(active.attachments.length, 2)
    assert.equal(active.attachments[0].pastedId, 'p1')
    assert.equal(active.attachments[1].name, 'screenshot.png')

    // Test matchCopiedUserInput with exact clipboard text
    const matched = matchCopiedUserInput(displayText)
    assert.ok(matched)
    assert.equal(matched.matched, true)
    assert.equal(matched.text, displayText)
    assert.equal(matched.attachments.length, 2)
    assert.equal(matched.attachments[0].pastedId, 'p1')
    assert.equal(matched.attachments[0].content, 'const a = 123;\nconsole.log(a);')
    assert.equal(matched.attachments[1].url, 'data:image/png;base64,abc1234')
  })

  it('matches historical user messages even if not recently clicked', () => {
    const fullText = `<pasted_content id="p1" lines="1" chars="10" size="10 B">\nconsole.log\n</pasted_content>\n\nPlease inspect [Here, user inserted p1 text]`
    const msg: Message = {
      info: { id: 'msg_hist_1', sessionID: 's1', role: 'user' },
      parts: [
        { type: 'file', id: 'f1', mime: 'image/png', filename: 'diag.png', url: 'data:image/png;base64,diag' } as FilePart,
        { type: 'text', id: 't1', text: fullText } as TextPart,
      ],
    }

    const matched = matchCopiedUserInput('Please inspect [Here, user inserted p1 text]', [msg])
    assert.ok(matched)
    assert.equal(matched.matched, true)
    assert.equal(matched.attachments.length, 2)
    assert.equal(matched.attachments[0].pastedId, 'p1')
    assert.equal(matched.attachments[1].name, 'diag.png')
  })

  it('returns null for plain text without attachments', () => {
    const msg: Message = {
      info: { id: 'msg_plain', sessionID: 's1', role: 'user' },
      parts: [
        { type: 'text', id: 't1', text: 'Just a plain question without attachments' } as TextPart,
      ],
    }

    recordCopiedUserInput({
      message: msg,
      displayText: 'Just a plain question without attachments',
      copiedText: 'Just a plain question without attachments',
      attachments: [],
    })

    const matched = matchCopiedUserInput('Just a plain question without attachments', [msg])
    assert.equal(matched, null)
  })

  it('returns null for foreign text from external clipboard', () => {
    const matched = matchCopiedUserInput('Random external code copied from internet')
    assert.equal(matched, null)
  })

  it('merges attachments into empty composer preserving identical order', () => {
    const p1 = createPastedAttachment('Content of P1', [], 'p1')
    const img1: PromptAttachment = {
      id: 'img_1',
      name: 'img1.png',
      mime: 'image/png',
      url: 'data:image/png;base64,111',
      kind: 'image',
    }
    const p2 = createPastedAttachment('Content of P2', [p1], 'p2')

    const incoming = [p1, img1, p2]
    const merged = mergePastedUserInputAttachments(incoming, [], 'Text: [Here, user inserted p1 text] [Here, user inserted p2 text]')

    assert.equal(merged.attachments.length, 3)
    assert.equal(merged.attachments[0].pastedId, 'p1')
    assert.equal(merged.attachments[1].name, 'img1.png')
    assert.equal(merged.attachments[2].pastedId, 'p2')
    assert.equal(merged.text, 'Text: [Here, user inserted p1 text] [Here, user inserted p2 text]')
  })

  it('resolves pasted ID collision by remapping p1 to p2 and updating marker text', () => {
    const existingP1 = createPastedAttachment('Existing different content', [], 'p1')
    const incomingP1 = createPastedAttachment('New incoming content', [], 'p1')

    const merged = mergePastedUserInputAttachments(
      [incomingP1],
      [existingP1],
      'Pasted: [Here, user inserted p1 text]'
    )

    assert.equal(merged.attachments.length, 2)
    assert.equal(merged.attachments[0].pastedId, 'p1')
    assert.equal(merged.attachments[0].content, 'Existing different content')
    assert.equal(merged.attachments[1].pastedId, 'p2')
    assert.equal(merged.attachments[1].content, 'New incoming content')
    // Text marker should be remapped to p2
    assert.equal(merged.text, 'Pasted: [Here, user inserted p2 text]')
  })

  it('avoids duplicating identical images when merged', () => {
    const img: PromptAttachment = {
      id: 'img_a',
      name: 'test.png',
      mime: 'image/png',
      url: 'data:image/png;base64,same_image_data',
      kind: 'image',
    }

    const merged = mergePastedUserInputAttachments([img], [img], 'Some prompt')
    assert.equal(merged.attachments.length, 1)
  })

  it('preserves exact sent attachment order via registerSentMessageAttachments', () => {
    const img: PromptAttachment = {
      id: 'img_lead',
      name: 'head.png',
      mime: 'image/png',
      url: 'data:image/png;base64,head',
      kind: 'image',
    }
    const p1 = createPastedAttachment('Snippety', [], 'p1')

    // Order: image first, then p1
    registerSentMessageAttachments('Special prompt text', [img, p1], 'msg_sent_order')

    const extracted = extractAttachmentsFromUserMessage({
      info: { id: 'msg_sent_order', sessionID: 's1', role: 'user' },
      parts: [],
    })

    assert.equal(extracted.length, 2)
    assert.equal(extracted[0].name, 'head.png')
    assert.equal(extracted[1].pastedId, 'p1')
  })
})
