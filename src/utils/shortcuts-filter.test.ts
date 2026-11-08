import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SHORTCUTS,
  filterShortcutKeys,
  type RecordedKeyFilter,
} from './shortcuts'

describe('filterShortcutKeys with keystroke recordedFilter', () => {
  it('filters accurately by single key and modifier combinations', () => {
    // Record F11
    const f11Filter: RecordedKeyFilter = { key: 'F11', label: 'F11' }
    const f11Matches = filterShortcutKeys(DEFAULT_SHORTCUTS, 'all', '', f11Filter)
    assert.deepEqual(f11Matches, ['zenMode'])

    // Record Ctrl + M
    const ctrlMFilter: RecordedKeyFilter = { key: 'm', ctrlKey: true, label: 'Ctrl + M' }
    const ctrlMMatches = filterShortcutKeys(DEFAULT_SHORTCUTS, 'all', '', ctrlMFilter)
    assert.deepEqual(ctrlMMatches, ['toggleMap'])

    // Record Alt + M
    const altMFilter: RecordedKeyFilter = { key: 'm', altKey: true, label: 'Alt + M' }
    const altMMatches = filterShortcutKeys(DEFAULT_SHORTCUTS, 'all', '', altMFilter)
    assert.deepEqual(altMMatches, ['addSessionToMap'])

    // Record Ctrl + Shift + D
    const ctrlShiftDFilter: RecordedKeyFilter = { key: 'd', ctrlKey: true, shiftKey: true, label: 'Ctrl + Shift + D' }
    const ctrlShiftDMatches = filterShortcutKeys(DEFAULT_SHORTCUTS, 'all', '', ctrlShiftDFilter)
    assert.deepEqual(ctrlShiftDMatches, ['toggleCenterDialogue'])

    // Record non-existent shortcut
    const nonExistentFilter: RecordedKeyFilter = { key: 'x', ctrlKey: true, shiftKey: true, altKey: true, label: 'Ctrl + Alt + Shift + X' }
    const noMatches = filterShortcutKeys(DEFAULT_SHORTCUTS, 'all', '', nonExistentFilter)
    assert.deepEqual(noMatches, [])
  })

  it('combines recordedFilter with category filter', () => {
    const ctrlShiftDFilter: RecordedKeyFilter = { key: 'd', ctrlKey: true, shiftKey: true, label: 'Ctrl + Shift + D' }
    // Matching category 'dialogue'
    const dialogueMatches = filterShortcutKeys(DEFAULT_SHORTCUTS, 'dialogue', '', ctrlShiftDFilter)
    assert.deepEqual(dialogueMatches, ['toggleCenterDialogue'])

    // Non-matching category 'map'
    const mapMatches = filterShortcutKeys(DEFAULT_SHORTCUTS, 'map', '', ctrlShiftDFilter)
    assert.deepEqual(mapMatches, [])
  })
})
