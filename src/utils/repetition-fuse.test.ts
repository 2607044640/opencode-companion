import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectRepetitionLoop,
  sanitizeMessageRepetition,
  REPETITION_LOOP_NOTICE,
} from './repetition-fuse'
import type { Message } from '../types/opencode'

describe('repetition-fuse: detectRepetitionLoop', () => {
  it('returns isLoop=false for normal non-repetitive text', () => {
    const text =
      'Let me start by inspecting App.tsx for setSelectedProjectId usage. Then I will check useSessions.ts.'
    const result = detectRepetitionLoop(text)
    assert.equal(result.isLoop, false)
    assert.equal(result.cleanText, text)
  })

  it('detects 30x repeated planning paragraph and truncates to first occurrence with notice', () => {
    const paragraph =
      'Let me start by inspecting App.tsx for setSelectedProjectId usage. I will grep for setSelectedProjectId in App.tsx. If it is unused, I can remove it from the destructure to avoid unused-var lint. Then I will look at startDraftSession and createNewSession to see if they also need the URL write. After that I will add a test for the toMessageSearchMeta mapping. Then I will compile and run the tests, then measure the LOC of the changed files.'

    const loopText = (paragraph + '\n\n').repeat(5)
    const result = detectRepetitionLoop(loopText)

    assert.equal(result.isLoop, true)
    assert.ok(result.repeatCount && result.repeatCount >= 3)
    assert.ok(result.cleanText.includes(REPETITION_LOOP_NOTICE))
    assert.ok(result.cleanText.startsWith(paragraph))
  })
})

describe('repetition-fuse: sanitizeMessageRepetition', () => {
  it('cleans up repeated loops inside assistant message parts', () => {
    const paragraph =
      'Let me start by inspecting App.tsx for setSelectedProjectId usage. I will grep for setSelectedProjectId in App.tsx.'
    const looped = (paragraph + ' ').repeat(4)

    const msg: Message = {
      info: {
        id: 'msg-1',
        sessionID: 'ses-1',
        role: 'assistant',
        time: { created: 1 },
      },
      parts: [
        {
          id: 'p-1',
          sessionID: 'ses-1',
          messageID: 'msg-1',
          type: 'text',
          text: looped,
        },
      ],
    }

    const { message, hasLoop } = sanitizeMessageRepetition(msg)
    assert.equal(hasLoop, true)
    const textPart = message.parts[0] as { text: string }
    assert.ok(textPart.text.includes(REPETITION_LOOP_NOTICE))
  })
})
