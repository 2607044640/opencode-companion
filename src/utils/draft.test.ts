import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { extractDraftFromMessage } from './draft'
import type { Message } from '../types/opencode'

describe('extractDraftFromMessage', () => {
  test('extracts single text part correctly', () => {
    const msg: Message = {
      info: {
        id: 'msg_1',
        sessionID: 'ses_1',
        role: 'user',
        time: { created: Date.now() },
      },
      parts: [
        {
          id: 'p_1',
          sessionID: 'ses_1',
          messageID: 'msg_1',
          type: 'text',
          text: 'Please refactor the auth middleware',
        },
      ],
    }

    const draft = extractDraftFromMessage(msg)
    assert.equal(draft.text, 'Please refactor the auth middleware')
    assert.equal(draft.attachments.length, 0)
  })

  test('extracts multiple text parts joined by newline', () => {
    const msg: Message = {
      info: {
        id: 'msg_2',
        sessionID: 'ses_1',
        role: 'user',
        time: { created: Date.now() },
      },
      parts: [
        {
          id: 'p_1',
          sessionID: 'ses_1',
          messageID: 'msg_2',
          type: 'text',
          text: 'First line',
        },
        {
          id: 'p_2',
          sessionID: 'ses_1',
          messageID: 'msg_2',
          type: 'text',
          text: 'Second line',
        },
      ],
    }

    const draft = extractDraftFromMessage(msg)
    assert.equal(draft.text, 'First line\nSecond line')
    assert.equal(draft.attachments.length, 0)
  })

  test('extracts image and file attachments into PromptAttachment list', () => {
    const msg: Message = {
      info: {
        id: 'msg_3',
        sessionID: 'ses_1',
        role: 'user',
        time: { created: Date.now() },
      },
      parts: [
        {
          id: 'p_1',
          sessionID: 'ses_1',
          messageID: 'msg_3',
          type: 'text',
          text: 'Inspect this bug screenshot',
        },
        {
          id: 'p_2',
          sessionID: 'ses_1',
          messageID: 'msg_3',
          type: 'file',
          mime: 'image/png',
          filename: 'error.png',
          url: 'data:image/png;base64,iVBORw0KGgo...',
        },
      ],
    }

    const draft = extractDraftFromMessage(msg)
    assert.equal(draft.text, 'Inspect this bug screenshot')
    assert.equal(draft.attachments.length, 1)
    assert.equal(draft.attachments[0].name, 'error.png')
    assert.equal(draft.attachments[0].mime, 'image/png')
    assert.equal(draft.attachments[0].url, 'data:image/png;base64,iVBORw0KGgo...')
  })

  test('handles empty message with no text parts', () => {
    const msg: Message = {
      info: {
        id: 'msg_4',
        sessionID: 'ses_1',
        role: 'user',
        time: { created: Date.now() },
      },
      parts: [],
    }

    const draft = extractDraftFromMessage(msg)
    assert.equal(draft.text, '')
    assert.equal(draft.attachments.length, 0)
  })
})
