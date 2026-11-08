import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getDialogueExpandedState,
  setDialogueExpandedState,
  getWorkedCardExpandedState,
  setWorkedCardExpandedState,
  clearDialogueExpandedCache,
} from './dialogue-collapse-cache'

describe('dialogue-collapse-cache unit tests', () => {
  beforeEach(() => {
    clearDialogueExpandedCache()
  })

  test('returns fallback default when no manual toggle exists', () => {
    assert.equal(getDialogueExpandedState('msg_1', undefined, false), false)
    assert.equal(getDialogueExpandedState('msg_2', undefined, true), true)
  })

  test('preserves user manual expand across lookups (simulating tab switch)', () => {
    // User expands msg_1
    setDialogueExpandedState('msg_1', true)

    // Simulating component remount after switching tabs
    assert.equal(getDialogueExpandedState('msg_1', undefined, false), true)
  })

  test('preserves user manual collapse across lookups', () => {
    // User collapses msg_1
    setDialogueExpandedState('msg_1', false)

    // Even if fallback was true, user explicit choice wins
    assert.equal(getDialogueExpandedState('msg_1', undefined, true), false)
  })

  test('supports composite turn allMessageIds lookup', () => {
    setDialogueExpandedState('msg_turn_1', true, ['msg_part_a', 'msg_part_b'])

    // Lookup using secondary message id
    assert.equal(getDialogueExpandedState('msg_part_b', undefined, false), true)
  })

  test('preserves WorkedSummaryCard expanded state separately', () => {
    assert.equal(getWorkedCardExpandedState('msg_3', false), false)

    setWorkedCardExpandedState('msg_3', true)
    assert.equal(getWorkedCardExpandedState('msg_3', false), true)

    // Dialogue body state remains unaffected
    assert.equal(getDialogueExpandedState('msg_3', undefined, false), false)
  })
})
