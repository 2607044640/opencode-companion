import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeDistanceToCenter,
  findCenterDialogue,
  type DialogueCandidateMeta,
} from './center-dialogue-finder'

describe('center-dialogue-finder', () => {
  describe('computeDistanceToCenter', () => {
    it('returns 0 when targetCenterY falls inside bounds', () => {
      const bounds = { top: 400, bottom: 600, height: 200 }
      assert.equal(computeDistanceToCenter(bounds, 500), 0)
      assert.equal(computeDistanceToCenter(bounds, 400), 0)
      assert.equal(computeDistanceToCenter(bounds, 600), 0)
    })

    it('returns distance when element is below targetCenterY', () => {
      const bounds = { top: 600, bottom: 800, height: 200 }
      assert.equal(computeDistanceToCenter(bounds, 500), 100)
    })

    it('returns distance when element is above targetCenterY', () => {
      const bounds = { top: 100, bottom: 350, height: 250 }
      assert.equal(computeDistanceToCenter(bounds, 500), 150)
    })
  })

  describe('findCenterDialogue', () => {
    it('returns null for empty candidates', () => {
      assert.equal(findCenterDialogue([], 500), null)
    })

    it('selects the collapsible dialogue directly covering screen center', () => {
      const candidates: DialogueCandidateMeta[] = [
        {
          messageId: 'msg_1',
          role: 'user',
          isCollapsible: false,
          isExpanded: false,
          bounds: { top: 50, bottom: 120, height: 70 },
        },
        {
          messageId: 'msg_2',
          role: 'assistant',
          isCollapsible: true,
          isExpanded: false,
          bounds: { top: 140, bottom: 620, height: 480 },
        },
        {
          messageId: 'msg_3',
          role: 'user',
          isCollapsible: true,
          isExpanded: true,
          bounds: { top: 640, bottom: 850, height: 210 },
        },
      ]

      const result = findCenterDialogue(candidates, 500)
      assert.ok(result)
      assert.equal(result.messageId, 'msg_2')
      assert.equal(result.role, 'assistant')
      assert.equal(result.isCollapsible, true)
      assert.equal(result.isExpanded, false)
      assert.equal(result.distanceToCenter, 0)
    })

    it('prioritizes nearby collapsible dialogue when non-collapsible prompt hits exact center', () => {
      // Scenario: Screen center is at 500px.
      // A short 1-line user message "OK" is at 490px - 510px (covers center, but NOT collapsible).
      // A 400px AI answer is right below at 520px - 920px (IS collapsible).
      const candidates: DialogueCandidateMeta[] = [
        {
          messageId: 'short_prompt',
          role: 'user',
          isCollapsible: false,
          isExpanded: false,
          bounds: { top: 490, bottom: 510, height: 20 },
        },
        {
          messageId: 'long_ai_answer',
          role: 'assistant',
          isCollapsible: true,
          isExpanded: true,
          bounds: { top: 520, bottom: 920, height: 400 },
        },
      ]

      const result = findCenterDialogue(candidates, 500)
      assert.ok(result)
      // Must pick the collapsible AI answer so user's side button click actually expands/collapses!
      assert.equal(result.messageId, 'long_ai_answer')
      assert.equal(result.isCollapsible, true)
      assert.equal(result.isExpanded, true)
      assert.equal(result.distanceToCenter, 20)
    })

    it('selects closest collapsible candidate when screen center lands in margin gap', () => {
      const candidates: DialogueCandidateMeta[] = [
        {
          messageId: 'upper_block',
          role: 'assistant',
          isCollapsible: true,
          isExpanded: false,
          bounds: { top: 200, bottom: 480, height: 280 },
        },
        {
          messageId: 'lower_block',
          role: 'assistant',
          isCollapsible: true,
          isExpanded: true,
          bounds: { top: 540, bottom: 800, height: 260 },
        },
      ]

      // Target center is 500px (in the gap between 480 and 540)
      // upper_block distance is 500 - 480 = 20
      // lower_block distance is 540 - 500 = 40
      const result = findCenterDialogue(candidates, 500)
      assert.ok(result)
      assert.equal(result.messageId, 'upper_block')
      assert.equal(result.distanceToCenter, 20)
    })

    it('falls back to closest candidate when no candidates are collapsible', () => {
      const candidates: DialogueCandidateMeta[] = [
        {
          messageId: 'msg_a',
          role: 'user',
          isCollapsible: false,
          isExpanded: false,
          bounds: { top: 100, bottom: 200, height: 100 },
        },
        {
          messageId: 'msg_b',
          role: 'assistant',
          isCollapsible: false,
          isExpanded: false,
          bounds: { top: 450, bottom: 550, height: 100 },
        },
      ]

      const result = findCenterDialogue(candidates, 500)
      assert.ok(result)
      assert.equal(result.messageId, 'msg_b')
      assert.equal(result.isCollapsible, false)
      assert.equal(result.distanceToCenter, 0)
    })
  })
})
