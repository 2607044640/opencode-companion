import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getNextTabId,
  getPrevTabId,
  calculateCloseTabState,
  getTabIdByIndex,
  closeOtherTabsState,
  closeTabsToRightState,
} from './tab-navigation'

describe('tab-navigation utilities', () => {
  describe('getNextTabId', () => {
    it('returns null if there are 0 or 1 tabs', () => {
      assert.equal(getNextTabId([], null), null)
      assert.equal(getNextTabId(['s1'], 's1'), null)
    })

    it('advances to next tab in order', () => {
      const tabs = ['s1', 's2', 's3']
      assert.equal(getNextTabId(tabs, 's1'), 's2')
      assert.equal(getNextTabId(tabs, 's2'), 's3')
    })

    it('wraps around to the first tab when at the last tab', () => {
      const tabs = ['s1', 's2', 's3']
      assert.equal(getNextTabId(tabs, 's3'), 's1')
    })

    it('defaults to first tab if active tab is not found', () => {
      const tabs = ['s1', 's2', 's3']
      assert.equal(getNextTabId(tabs, 'nonexistent'), 's1')
      assert.equal(getNextTabId(tabs, null), 's1')
    })
  })

  describe('getPrevTabId', () => {
    it('returns null if there are 0 or 1 tabs', () => {
      assert.equal(getPrevTabId([], null), null)
      assert.equal(getPrevTabId(['s1'], 's1'), null)
    })

    it('goes back to previous tab in order', () => {
      const tabs = ['s1', 's2', 's3']
      assert.equal(getPrevTabId(tabs, 's3'), 's2')
      assert.equal(getPrevTabId(tabs, 's2'), 's1')
    })

    it('wraps around to the last tab when at the first tab', () => {
      const tabs = ['s1', 's2', 's3']
      assert.equal(getPrevTabId(tabs, 's1'), 's3')
    })

    it('defaults to last tab if active tab is not found', () => {
      const tabs = ['s1', 's2', 's3']
      assert.equal(getPrevTabId(tabs, 'nonexistent'), 's3')
      assert.equal(getPrevTabId(tabs, null), 's3')
    })
  })

  describe('calculateCloseTabState', () => {
    it('closes middle active tab and activates adjacent tab (Chrome/VS Code behavior)', () => {
      const tabs = ['s1', 's2', 's3']
      const res = calculateCloseTabState(tabs, 's2', 's2')
      assert.deepEqual(res.nextTabs, ['s1', 's3'])
      assert.equal(res.nextActiveId, 's3')
    })

    it('closes last active tab and activates preceding tab', () => {
      const tabs = ['s1', 's2', 's3']
      const res = calculateCloseTabState(tabs, 's3', 's3')
      assert.deepEqual(res.nextTabs, ['s1', 's2'])
      assert.equal(res.nextActiveId, 's2')
    })

    it('closes sole active tab and sets nextActiveId to null without crashing', () => {
      const tabs = ['s1']
      const res = calculateCloseTabState(tabs, 's1', 's1')
      assert.deepEqual(res.nextTabs, [])
      assert.equal(res.nextActiveId, null)
    })

    it('closes inactive background tab without altering active tab', () => {
      const tabs = ['s1', 's2', 's3']
      const res = calculateCloseTabState(tabs, 's1', 's2')
      assert.deepEqual(res.nextTabs, ['s1', 's3'])
      assert.equal(res.nextActiveId, 's1')
    })
  })

  describe('getTabIdByIndex', () => {
    it('returns tab by 1-based index and handles index 9 as last tab', () => {
      const tabs = ['s1', 's2', 's3', 's4']
      assert.equal(getTabIdByIndex(tabs, 1), 's1')
      assert.equal(getTabIdByIndex(tabs, 2), 's2')
      assert.equal(getTabIdByIndex(tabs, 3), 's3')
      assert.equal(getTabIdByIndex(tabs, 4), 's4')
      assert.equal(getTabIdByIndex(tabs, 5), null)
      assert.equal(getTabIdByIndex(tabs, 9), 's4') // Last tab
    })

    it('returns null on empty list or invalid index', () => {
      assert.equal(getTabIdByIndex([], 1), null)
      assert.equal(getTabIdByIndex(['s1'], 0), null)
    })
  })

  describe('closeOtherTabsState', () => {
    it('keeps only the target tab and collects closed IDs', () => {
      const tabs = ['s1', 's2', 's3', 's4']
      const res = closeOtherTabsState(tabs, 's2')
      assert.deepEqual(res.nextTabs, ['s2'])
      assert.deepEqual(res.closedIds, ['s1', 's3', 's4'])
    })
  })

  describe('closeTabsToRightState', () => {
    it('closes all tabs to the right of target and collects closed IDs', () => {
      const tabs = ['s1', 's2', 's3', 's4']
      const res = closeTabsToRightState(tabs, 's2')
      assert.deepEqual(res.nextTabs, ['s1', 's2'])
      assert.deepEqual(res.closedIds, ['s3', 's4'])
    })
  })
})
