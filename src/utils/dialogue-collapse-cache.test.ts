import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getDialogueExpandedState,
  setDialogueExpandedState,
  getWorkedCardExpandedState,
  setWorkedCardExpandedState,
  clearDialogueExpandedCache,
  toggleAllDialogues,
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

  describe('toggleAllDialogues master toggle switch', () => {
    let originalWindow: unknown
    let dispatchedEvents: string[] = []

    beforeEach(() => {
      dispatchedEvents = []
      originalWindow = (globalThis as any).window
      ;(globalThis as any).window = {
        dispatchEvent: (event: { type: string }) => {
          dispatchedEvents.push(event.type)
          return true
        },
      }
    })

    afterEach(() => {
      ;(globalThis as any).window = originalWindow
    })

    function createMockRoot(elements: { getAttribute: (attr: string) => string | null }[]): ParentNode {
      return {
        querySelectorAll: (selector: string) => {
          if (selector === '[data-collapsible="true"]') {
            return elements as unknown as NodeListOf<HTMLElement>
          }
          return [] as unknown as NodeListOf<HTMLElement>
        },
      } as unknown as ParentNode
    }

    test('returns collapsed and does nothing when no collapsible elements exist', () => {
      const root = createMockRoot([])
      const result = toggleAllDialogues(root)
      assert.equal(result, 'collapsed')
      assert.equal(dispatchedEvents.length, 0)
    })

    test('collapses all dialogues if ANY dialogue is currently expanded', () => {
      const root = createMockRoot([
        { getAttribute: (attr: string) => (attr === 'data-expanded' ? 'false' : null) },
        { getAttribute: (attr: string) => (attr === 'data-expanded' ? 'true' : null) },
      ])
      const result = toggleAllDialogues(root)
      assert.equal(result, 'collapsed')
      assert.deepEqual(dispatchedEvents, ['opencode-collapse-all-dialogues'])
    })

    test('collapses all dialogues if ALL dialogues are currently expanded', () => {
      const root = createMockRoot([
        { getAttribute: (attr: string) => (attr === 'data-expanded' ? 'true' : null) },
        { getAttribute: (attr: string) => (attr === 'data-expanded' ? 'true' : null) },
      ])
      const result = toggleAllDialogues(root)
      assert.equal(result, 'collapsed')
      assert.deepEqual(dispatchedEvents, ['opencode-collapse-all-dialogues'])
    })

    test('expands all dialogues if ALL dialogues are currently collapsed', () => {
      const root = createMockRoot([
        { getAttribute: (attr: string) => (attr === 'data-expanded' ? 'false' : null) },
        { getAttribute: (attr: string) => (attr === 'data-expanded' ? 'false' : null) },
      ])
      const result = toggleAllDialogues(root)
      assert.equal(result, 'expanded')
      assert.deepEqual(dispatchedEvents, ['opencode-expand-all-dialogues'])
    })
  })
})
