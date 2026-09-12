import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  findJumpTargetIndex,
  findNextJumpTargetIndex,
  evaluatePromptCollapsing,
  computeDialogueTicks,
  computeViewportThumb,
  resolveCommandCopyText,
  type UserMessageRect,
} from './quick-jump'

describe('Quick-Jump Target Selection Logic', () => {
  test('returns null when there are no user messages', () => {
    assert.equal(findJumpTargetIndex(100, []), null)
    assert.equal(findNextJumpTargetIndex(100, []), null)
  })

  test('jumps to latest user message when scrolled down past it', () => {
    const userMessages: UserMessageRect[] = [
      { index: 0, top: 100, bottom: 200 },
      { index: 1, top: 500, bottom: 600 },
      { index: 2, top: 900, bottom: 1000 },
    ]

    const target = findJumpTargetIndex(1200, userMessages)
    // Nearest user message above viewport (1200 - 30 = 1170) is index 2 (top: 900)
    assert.equal(target, 2)
  })

  test('jumps to previous user message when already viewing the latest one', () => {
    const userMessages: UserMessageRect[] = [
      { index: 0, top: 100, bottom: 200 },
      { index: 1, top: 500, bottom: 600 },
      { index: 2, top: 900, bottom: 1000 },
    ]

    const target = findJumpTargetIndex(905, userMessages)
    // Message 2 is at top (not < 905 - 30), so finds message 1 (top: 500 < 875)
    assert.equal(target, 1)
  })

  test('returns null (scroll to top) when already viewing the first message near top', () => {
    const userMessages: UserMessageRect[] = [
      { index: 0, top: 100, bottom: 200 },
      { index: 1, top: 500, bottom: 600 },
    ]

    // Viewport is at y = 100 (aligned with message 0)
    const target = findJumpTargetIndex(100, userMessages)
    // Already at message 0, so returns null to signal scrolling to absolute top 0
    assert.equal(target, null)
  })

  test('findNextJumpTargetIndex jumps to next user message below viewport', () => {
    const userMessages: UserMessageRect[] = [
      { index: 0, top: 100, bottom: 200 },
      { index: 1, top: 500, bottom: 600 },
      { index: 2, top: 900, bottom: 1000 },
    ]

    // Currently at message 0 (y = 100) -> next is message 1 (top: 500 > 130)
    assert.equal(findNextJumpTargetIndex(100, userMessages), 1)

    // Currently at message 1 (y = 500) -> next is message 2 (top: 900 > 530)
    assert.equal(findNextJumpTargetIndex(500, userMessages), 2)

    // Currently at message 2 (y = 900) -> no user messages below, returns null (scroll to bottom)
    assert.equal(findNextJumpTargetIndex(900, userMessages), null)
  })
})

describe('Prompt Collapsible Evaluation Logic', () => {
  test('short single-line message is not collapsible', () => {
    const res = evaluatePromptCollapsing('fix this bug')
    assert.equal(res.isCollapsible, false)
    assert.equal(res.defaultCollapsed, false)
  })

  test('message exceeding line threshold is collapsible and auto-collapsed', () => {
    const multiLine = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5'
    const res = evaluatePromptCollapsing(multiLine, {
      autoCollapsePrompt: true,
      promptLineThreshold: 4,
    })
    assert.equal(res.lineCount, 5)
    assert.equal(res.isCollapsible, true)
    assert.equal(res.defaultCollapsed, true)
  })

  test('message exceeding character threshold is collapsible and auto-collapsed', () => {
    const longPrompt = 'A'.repeat(300)
    const res = evaluatePromptCollapsing(longPrompt, {
      autoCollapsePrompt: true,
      promptCharThreshold: 240,
    })
    assert.equal(res.charCount, 300)
    assert.equal(res.isCollapsible, true)
    assert.equal(res.defaultCollapsed, true)
  })

  test('moderately long message is collapsible even if auto-collapse is turned off', () => {
    const mediumPrompt = 'B'.repeat(160)
    const res = evaluatePromptCollapsing(mediumPrompt, {
      autoCollapsePrompt: false,
    })
    assert.equal(res.isCollapsible, true)
    assert.equal(res.defaultCollapsed, false) // Starts open, but user can fold it
  })
})

describe('Dialogue Navigation Rail Geometry & Ticks', () => {
  test('computeDialogueTicks maps user message positions proportionally', () => {
    const container = { scrollHeight: 2000, scrollTop: 0, clientHeight: 500 }
    const userElements = [
      { offsetTop: 200, promptPreview: 'First user question' },
      { offsetTop: 1000, promptPreview: 'Second user question with longer text...' },
      { offsetTop: 1800, textContent: 'Third user question' },
    ]

    const ticks = computeDialogueTicks(container, userElements)
    assert.equal(ticks.length, 3)

    // Index 0: 200 / 2000 * 100 = 10%
    assert.equal(ticks[0].percentage, 10)
    assert.equal(ticks[0].snippet, 'First user question')
    assert.equal(ticks[0].isActive, true) // 200 is in [-60, 460]

    // Index 1: 1000 / 2000 * 100 = 50%
    assert.equal(ticks[1].percentage, 50)
    assert.equal(ticks[1].snippet, 'Second user question with longer tex…')
    assert.equal(ticks[1].isActive, false)

    // Index 2: 1800 / 2000 * 100 = 90%
    assert.equal(ticks[2].percentage, 90)
    assert.equal(ticks[2].snippet, 'Third user question')
    assert.equal(ticks[2].isActive, false)
  })

  test('computeViewportThumb calculates top and height correctly', () => {
    const container = { scrollHeight: 1000, scrollTop: 250, clientHeight: 250 }
    const thumb = computeViewportThumb(container)

    // height = 250 / 1000 * 100 = 25%
    assert.equal(thumb.heightPct, 25)
    // top = 250 / 1000 * 100 = 25%
    assert.equal(thumb.topPct, 25)
  })
})

describe('Command Copy Separation Logic', () => {
  const item = {
    command: 'python ./scripts/note_helper.py search "78525" --limit 20',
    outputPreview: '/bin/bash: line 1: python: command not found',
  }

  test('resolveCommandCopyText returns full command string for command kind', () => {
    const copyText = resolveCommandCopyText('command', item)
    assert.equal(copyText, 'python ./scripts/note_helper.py search "78525" --limit 20')
  })

  test('resolveCommandCopyText returns output preview for output kind', () => {
    const copyText = resolveCommandCopyText('output', item)
    assert.equal(copyText, '/bin/bash: line 1: python: command not found')
  })
})

