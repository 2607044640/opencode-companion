import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  reorderTabIds,
  reorderTabIdsByIndex,
  calculateDropPosition,
} from './tab-reorder'

describe('tab-reorder utility', () => {
  describe('reorderTabIds', () => {
    const tabs = ['tab-1', 'tab-2', 'tab-3', 'tab-4']

    it('moves tab left-to-right before target', () => {
      const result = reorderTabIds(tabs, 'tab-1', 'tab-3', 'before')
      assert.deepEqual(result, ['tab-2', 'tab-1', 'tab-3', 'tab-4'])
    })

    it('moves tab left-to-right after target', () => {
      const result = reorderTabIds(tabs, 'tab-1', 'tab-3', 'after')
      assert.deepEqual(result, ['tab-2', 'tab-3', 'tab-1', 'tab-4'])
    })

    it('moves tab right-to-left before target', () => {
      const result = reorderTabIds(tabs, 'tab-4', 'tab-2', 'before')
      assert.deepEqual(result, ['tab-1', 'tab-4', 'tab-2', 'tab-3'])
    })

    it('moves tab right-to-left after target', () => {
      const result = reorderTabIds(tabs, 'tab-4', 'tab-2', 'after')
      assert.deepEqual(result, ['tab-1', 'tab-2', 'tab-4', 'tab-3'])
    })

    it('returns copy when source equals target', () => {
      const result = reorderTabIds(tabs, 'tab-2', 'tab-2', 'before')
      assert.deepEqual(result, tabs)
    })

    it('returns copy when sourceId is not found', () => {
      const result = reorderTabIds(tabs, 'tab-unknown', 'tab-2', 'before')
      assert.deepEqual(result, tabs)
    })

    it('returns copy when targetId is not found', () => {
      const result = reorderTabIds(tabs, 'tab-1', 'tab-unknown', 'before')
      assert.deepEqual(result, tabs)
    })

    it('handles empty or single item arrays safely', () => {
      assert.deepEqual(reorderTabIds([], 'a', 'b', 'before'), [])
      assert.deepEqual(reorderTabIds(['a'], 'a', 'a', 'before'), ['a'])
    })
  })

  describe('reorderTabIdsByIndex', () => {
    const tabs = ['a', 'b', 'c', 'd']

    it('moves item from index 0 to 2', () => {
      assert.deepEqual(reorderTabIdsByIndex(tabs, 0, 2), ['b', 'c', 'a', 'd'])
    })

    it('moves item from index 3 to 1', () => {
      assert.deepEqual(reorderTabIdsByIndex(tabs, 3, 1), ['a', 'd', 'b', 'c'])
    })

    it('handles invalid out-of-bound indices', () => {
      assert.deepEqual(reorderTabIdsByIndex(tabs, -1, 2), tabs)
      assert.deepEqual(reorderTabIdsByIndex(tabs, 0, 10), tabs)
      assert.deepEqual(reorderTabIdsByIndex(tabs, 1, 1), tabs)
    })
  })

  describe('calculateDropPosition', () => {
    const rect = { left: 100, width: 200 } // midpoint is 200

    it('returns before when cursor is on the left half', () => {
      assert.equal(calculateDropPosition(150, rect), 'before')
      assert.equal(calculateDropPosition(199, rect), 'before')
    })

    it('returns after when cursor is on the right half', () => {
      assert.equal(calculateDropPosition(200, rect), 'after')
      assert.equal(calculateDropPosition(250, rect), 'after')
    })

    it('safely handles zero width rect', () => {
      assert.equal(calculateDropPosition(100, { left: 0, width: 0 }), 'before')
    })
  })
})
