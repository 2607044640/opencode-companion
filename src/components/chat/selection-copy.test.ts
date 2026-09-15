import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculatePopoverPosition,
  isValidTextSelection,
  isNodeInsideContainer,
  shouldDismissOnEscape,
  shouldDismissOnMouseDownOutside,
  shouldDismissOnCollapsedSelection,
} from './selection-copy'

describe('selection-copy utility tests', () => {
  describe('calculatePopoverPosition', () => {
    const viewport = { width: 1200, height: 800 }

    it('positions popover above the selection when there is ample top space', () => {
      const rect = {
        top: 200,
        bottom: 220,
        left: 400,
        right: 600,
        width: 200,
        height: 20,
      }

      const pos = calculatePopoverPosition(rect, viewport, {
        minMargin: 75,
        popoverHeight: 32,
        offset: 8,
      })

      assert.equal(pos.placement, 'top')
      assert.equal(pos.y, 192) // 200 - 8
      assert.equal(pos.x, 500) // 400 + 100
    })

    it('flips popover below selection when too close to viewport top', () => {
      const rect = {
        top: 25,
        bottom: 45,
        left: 300,
        right: 500,
        width: 200,
        height: 20,
      }

      const pos = calculatePopoverPosition(rect, viewport, {
        minMargin: 75,
        popoverHeight: 32,
        offset: 8,
      })

      assert.equal(pos.placement, 'bottom')
      assert.equal(pos.y, 53) // 45 + 8
      assert.equal(pos.x, 400)
    })

    it('clamps horizontal coordinate to minimum margin on left edge', () => {
      const rect = {
        top: 300,
        bottom: 320,
        left: 10,
        right: 50,
        width: 40,
        height: 20,
      }

      const pos = calculatePopoverPosition(rect, viewport, { minMargin: 75 })
      assert.equal(pos.x, 75) // Clamped to minMargin 75
    })

    it('clamps horizontal coordinate to maximum margin on right edge', () => {
      const rect = {
        top: 300,
        bottom: 320,
        left: 1180,
        right: 1200,
        width: 20,
        height: 20,
      }

      const pos = calculatePopoverPosition(rect, viewport, { minMargin: 75 })
      assert.equal(pos.x, 1125) // 1200 - 75
    })
  })

  describe('isValidTextSelection', () => {
    it('returns true for normal non-empty text', () => {
      assert.equal(isValidTextSelection('Hello world'), true)
      assert.equal(isValidTextSelection('Explicit_CrossValidation'), true)
    })

    it('returns false for empty or whitespace-only text', () => {
      assert.equal(isValidTextSelection(''), false)
      assert.equal(isValidTextSelection('   \n\t  '), false)
    })

    it('returns false when active element is INPUT or TEXTAREA', () => {
      assert.equal(isValidTextSelection('test', { tagName: 'INPUT' }), false)
      assert.equal(isValidTextSelection('test', { tagName: 'textarea' }), false)
      assert.equal(isValidTextSelection('test', { tagName: 'DIV', isContentEditable: true }), false)
    })

    it('returns true when active element is a regular div or span', () => {
      assert.equal(isValidTextSelection('test', { tagName: 'DIV', isContentEditable: false }), true)
      assert.equal(isValidTextSelection('test', { tagName: 'SPAN' }), true)
      assert.equal(isValidTextSelection('test', null), true)
    })
  })

  describe('isNodeInsideContainer', () => {
    it('returns true if container is null (global scope)', () => {
      const dummyNode = {} as unknown as Node
      assert.equal(isNodeInsideContainer(dummyNode, null), true)
    })

    it('returns false if node is null', () => {
      const dummyContainer = { contains: () => true } as unknown as HTMLElement
      assert.equal(isNodeInsideContainer(null, dummyContainer), false)
    })

    it('delegates to container.contains for checking hierarchy', () => {
      const childNode = {} as unknown as Node
      const container = {
        contains: (n: unknown) => n === childNode,
      } as unknown as HTMLElement

      assert.equal(isNodeInsideContainer(childNode, container), true)
      assert.equal(isNodeInsideContainer({} as unknown as Node, container), false)
    })
  })

  describe('shouldDismissOnEscape', () => {
    it('returns true when key is Escape and popover is visible', () => {
      assert.equal(shouldDismissOnEscape('Escape', true), true)
    })

    it('returns false when key is not Escape or popover is not visible', () => {
      assert.equal(shouldDismissOnEscape('Enter', true), false)
      assert.equal(shouldDismissOnEscape('Escape', false), false)
      assert.equal(shouldDismissOnEscape('ArrowDown', false), false)
    })
  })

  describe('shouldDismissOnMouseDownOutside', () => {
    it('returns true when mousedown occurs outside popover and popover is visible', () => {
      assert.equal(shouldDismissOnMouseDownOutside(false, true), true)
    })

    it('returns false when clicking inside popover', () => {
      assert.equal(shouldDismissOnMouseDownOutside(true, true), false)
      assert.equal(shouldDismissOnMouseDownOutside(true, false), false)
    })

    it('returns false when popover is not visible', () => {
      assert.equal(shouldDismissOnMouseDownOutside(false, false), false)
    })
  })

  describe('shouldDismissOnCollapsedSelection', () => {
    it('returns true when selection is collapsed and not copied', () => {
      assert.equal(shouldDismissOnCollapsedSelection(true, false), true)
    })

    it('returns false when selection is not collapsed', () => {
      assert.equal(shouldDismissOnCollapsedSelection(false, false), false)
      assert.equal(shouldDismissOnCollapsedSelection(false, true), false)
    })

    it('returns false when selection is collapsed but in copied state (preserving auto-dismiss)', () => {
      assert.equal(shouldDismissOnCollapsedSelection(true, true), false)
    })
  })
})

