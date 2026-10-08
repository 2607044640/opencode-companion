import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectRepetitionLoop,
  sanitizeMessageRepetition,
  REPETITION_LOOP_NOTICE,
} from './repetition-fuse'
import type { Message } from '../types/opencode'

describe('repetition-fuse: detectRepetitionLoop', () => {
  it('detects a short confirmation line copied eight times', () => {
    const line = '正在确认所有修改已完成。'
    const result = detectRepetitionLoop((line + '\n').repeat(8))
    assert.equal(result.isLoop, true)
    assert.ok(result.cleanText.includes(REPETITION_LOOP_NOTICE))
  })

  it('detects a multi-line cycle copied three times', () => {
    const block = [
      '正在确认所有修改已完成。',
      '所有修改已完成。',
      '正在确认测试通过。',
      '测试通过。',
      '没有遗漏的步骤。',
    ].join('\n')
    const result = detectRepetitionLoop((block + '\n').repeat(3))
    assert.equal(result.isLoop, true)
    assert.ok((result.repeatCount || 0) >= 3)
  })

  it('detects the same confirmation set when the order changes', () => {
    const lines = [
      '最终回复已发送。',
      '正在确认最终回复已发送。',
      '正在确认没有遗漏的步骤。',
      '没有遗漏的步骤。',
      '正在确认所有文件修改已保存。',
      '所有文件修改已保存。',
      '正在确认测试通过。',
      '测试通过。',
      '正在确认文档更新完成。',
      '文档更新完成。',
      '正在确认代码修改完成。',
      '代码修改完成。',
      '正在确认最终回复准备就绪。',
      '最终回复准备就绪。',
      '正在发送最终回复。',
      '正在确认没有遗漏。',
      '没有遗漏。',
      '正在确认所有修改已完成。',
      '所有修改已完成。',
    ]
    const bag = [...lines, ...lines, ...lines, ...Array.from({ length: 12 }, () => '最终回复已发送。')]
    const order = [8, 2, 15, 0, 11, 4, 19, 6, 1, 13, 7, 16, 3, 10, 18, 5, 12, 9, 14, 17]
    const shuffled = [
      ...order.map((i) => bag[i % bag.length]),
      ...Array.from({ length: 40 }, (_, i) => bag[(i * 7 + 3) % bag.length]),
    ]
    const result = detectRepetitionLoop(shuffled.join('\n'))
    assert.equal(result.isLoop, true)
    assert.ok(result.cleanText.includes(REPETITION_LOOP_NOTICE))
    const prose = Array.from({ length: 40 }, (_, i) => `第${i}步看了不同的文件，结论也不一样。`).join('\n')
    assert.equal(detectRepetitionLoop(prose).isLoop, false)
  })

  it('does not flag ok or seven copies', () => {
    assert.equal(detectRepetitionLoop('ok\n'.repeat(20)).isLoop, false)
    const line = '正在确认所有修改已完成。'
    assert.equal(detectRepetitionLoop((line + '\n').repeat(7)).isLoop, false)
  })

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
