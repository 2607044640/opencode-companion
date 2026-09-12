import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SHORTCUTS, matchesShortcut, getShortcuts, createDoubleTapTracker, isEditableTarget, hasActiveOverlay } from './shortcuts'

describe('shortcuts matching and registration', () => {
  it('DEFAULT_SHORTCUTS includes tab navigation and close tab shortcuts', () => {
    assert.ok(DEFAULT_SHORTCUTS.nextTab)
    assert.equal(DEFAULT_SHORTCUTS.nextTab.key, 'Tab')
    assert.equal(DEFAULT_SHORTCUTS.nextTab.ctrlKey, true)
    assert.equal(DEFAULT_SHORTCUTS.nextTab.shiftKey, undefined)

    assert.ok(DEFAULT_SHORTCUTS.prevTab)
    assert.equal(DEFAULT_SHORTCUTS.prevTab.key, 'Tab')
    assert.equal(DEFAULT_SHORTCUTS.prevTab.ctrlKey, true)
    assert.equal(DEFAULT_SHORTCUTS.prevTab.shiftKey, true)

    assert.ok(DEFAULT_SHORTCUTS.closeActiveTab)
    assert.equal(DEFAULT_SHORTCUTS.closeActiveTab.key, 'w')
    assert.equal(DEFAULT_SHORTCUTS.closeActiveTab.ctrlKey, true)
  })

  it('matches Ctrl + Tab for nextTab and rejects Ctrl + Shift + Tab', () => {
    const ctrlTabEvent = {
      key: 'Tab',
      code: 'Tab',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    } as KeyboardEvent

    assert.equal(matchesShortcut(ctrlTabEvent, DEFAULT_SHORTCUTS.nextTab), true)
    assert.equal(matchesShortcut(ctrlTabEvent, DEFAULT_SHORTCUTS.prevTab), false)
  })

  it('matches Ctrl + Shift + Tab for prevTab and rejects Ctrl + Tab', () => {
    const ctrlShiftTabEvent = {
      key: 'Tab',
      code: 'Tab',
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
    } as KeyboardEvent

    assert.equal(matchesShortcut(ctrlShiftTabEvent, DEFAULT_SHORTCUTS.prevTab), true)
    assert.equal(matchesShortcut(ctrlShiftTabEvent, DEFAULT_SHORTCUTS.nextTab), false)
  })

  it('does not match Tab without Ctrl or with Alt', () => {
    const plainTab = {
      key: 'Tab',
      code: 'Tab',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    } as KeyboardEvent

    assert.equal(matchesShortcut(plainTab, DEFAULT_SHORTCUTS.nextTab), false)
    assert.equal(matchesShortcut(plainTab, DEFAULT_SHORTCUTS.prevTab), false)

    const altTab = {
      key: 'Tab',
      code: 'Tab',
      ctrlKey: true,
      shiftKey: false,
      altKey: true,
      metaKey: false,
    } as KeyboardEvent

    assert.equal(matchesShortcut(altTab, DEFAULT_SHORTCUTS.nextTab), false)
  })

  it('matches Ctrl + W for closeActiveTab', () => {
    const ctrlWEvent = {
      key: 'w',
      code: 'KeyW',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    } as KeyboardEvent

    assert.equal(matchesShortcut(ctrlWEvent, DEFAULT_SHORTCUTS.closeActiveTab), true)

    const plainW = {
      key: 'w',
      code: 'KeyW',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    } as KeyboardEvent

    assert.equal(matchesShortcut(plainW, DEFAULT_SHORTCUTS.closeActiveTab), false)
  })

  it('matches Ctrl + Shift + T for reopenClosedTab', () => {
    const ctrlShiftTEvent = {
      key: 't',
      code: 'KeyT',
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
    } as KeyboardEvent

    assert.equal(matchesShortcut(ctrlShiftTEvent, DEFAULT_SHORTCUTS.reopenClosedTab), true)

    const plainT = {
      key: 't',
      code: 'KeyT',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    } as KeyboardEvent

    assert.equal(matchesShortcut(plainT, DEFAULT_SHORTCUTS.reopenClosedTab), false)
  })

  it('getShortcuts() populates newly introduced tab shortcuts if missing in storage', () => {
    const shortcuts = getShortcuts()
    assert.ok(shortcuts.reopenClosedTab)
    assert.ok(shortcuts.nextTab)
    assert.ok(shortcuts.prevTab)
    assert.ok(shortcuts.closeActiveTab)
    assert.ok(shortcuts.prevDialogue)
    assert.ok(shortcuts.nextDialogue)
    assert.ok(shortcuts.jumpToTop)
    assert.ok(shortcuts.jumpToBottom)
  })

  it('DEFAULT_SHORTCUTS defines jumpToTop and jumpToBottom as double-press shortcuts', () => {
    assert.equal(DEFAULT_SHORTCUTS.prevDialogue.key, 'ArrowUp')
    assert.equal(DEFAULT_SHORTCUTS.nextDialogue.key, 'ArrowDown')
    assert.equal(DEFAULT_SHORTCUTS.jumpToTop.kind, 'double-press')
    assert.equal(DEFAULT_SHORTCUTS.jumpToTop.key, 'ArrowUp')
    assert.equal(DEFAULT_SHORTCUTS.jumpToTop.tapCount, 2)

    assert.equal(DEFAULT_SHORTCUTS.jumpToBottom.kind, 'double-press')
    assert.equal(DEFAULT_SHORTCUTS.jumpToBottom.key, 'ArrowDown')
    assert.equal(DEFAULT_SHORTCUTS.jumpToBottom.tapCount, 2)
  })

  it('createDoubleTapTracker triggers on rapid second press and rejects single/slow/repeat', () => {
    const tracker = createDoubleTapTracker()

    const upEvent = {
      key: 'ArrowUp',
      repeat: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    } as KeyboardEvent

    // 1. First tap should not trigger
    const firstRes = tracker.check(upEvent, DEFAULT_SHORTCUTS.jumpToTop)
    assert.equal(firstRes, false)

    // 2. Immediate second tap (repeat=true) should be ignored
    const repeatRes = tracker.check({ ...upEvent, repeat: true } as KeyboardEvent, DEFAULT_SHORTCUTS.jumpToTop)
    assert.equal(repeatRes, false)

    // 3. Different key tap resets state
    const wrongKeyRes = tracker.check({ ...upEvent, key: 'ArrowDown' } as KeyboardEvent, DEFAULT_SHORTCUTS.jumpToTop)
    assert.equal(wrongKeyRes, false)

    // 4. Valid rapid second tap with same key triggers true
    const tracker2 = createDoubleTapTracker()
    assert.equal(tracker2.check(upEvent, DEFAULT_SHORTCUTS.jumpToTop), false)
    assert.equal(tracker2.check(upEvent, DEFAULT_SHORTCUTS.jumpToTop), true)
  })

  it('isEditableTarget correctly identifies inputs, textareas, and contenteditable', () => {
    assert.equal(isEditableTarget(null), false)
    assert.equal(isEditableTarget({} as any), false)

    // Mock elements using plain objects matching tagName and isContentEditable
    const mockTextarea = { tagName: 'TEXTAREA', isContentEditable: false }
    assert.equal(isEditableTarget(mockTextarea as any), true)

    const mockInput = { tagName: 'INPUT', isContentEditable: false }
    assert.equal(isEditableTarget(mockInput as any), true)

    const mockDiv = { tagName: 'DIV', isContentEditable: false }
    assert.equal(isEditableTarget(mockDiv as any), false)

    const mockEditableDiv = { tagName: 'DIV', isContentEditable: true }
    assert.equal(isEditableTarget(mockEditableDiv as any), true)
  })

  it('hasActiveOverlay accurately detects presence of modal backdrops, dialogs, and overlays', () => {
    // 1. Without document / in non-DOM environment
    assert.equal(hasActiveOverlay(undefined), false)

    // 2. Empty mock document without overlays
    const emptyDoc = {
      querySelector: (_selector: string) => null,
    } as unknown as Document
    assert.equal(hasActiveOverlay(emptyDoc), false)

    // 3. Mock document with role="dialog"
    const dialogDoc = {
      querySelector: (selector: string) => (selector.includes('[role="dialog"]') ? {} : null),
    } as unknown as Document
    assert.equal(hasActiveOverlay(dialogDoc), true)

    // 4. Mock document with .fixed.inset-0
    const fixedInsetDoc = {
      querySelector: (selector: string) => (selector.includes('.fixed.inset-0') ? {} : null),
    } as unknown as Document
    assert.equal(hasActiveOverlay(fixedInsetDoc), true)

    // 5. Mock document with data-modal
    const dataModalDoc = {
      querySelector: (selector: string) => (selector.includes('[data-modal]') ? {} : null),
    } as unknown as Document
    assert.equal(hasActiveOverlay(dataModalDoc), true)
  })
})
