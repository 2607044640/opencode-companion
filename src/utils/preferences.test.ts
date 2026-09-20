import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PREFERENCES,
  THEME_PRESETS,
  DEFAULT_THEME_COLORS,
  UserPreferences,
} from './preferences'

describe('Preferences Utilities (preferences.ts)', () => {
  it('contains valid default preferences matching Antigravity spec', () => {
    assert.equal(DEFAULT_PREFERENCES.verboseAgentChat, true)
    assert.equal(DEFAULT_PREFERENCES.collapseSidebarOnStartup, false)
    assert.equal(DEFAULT_PREFERENCES.autoGitCheckpoint, true)
    assert.equal(DEFAULT_PREFERENCES.floatingDiffView, true)
    assert.equal(DEFAULT_PREFERENCES.conversationWidth, 'default')
    assert.equal(DEFAULT_PREFERENCES.themeMode, 'dark')
    assert.equal(DEFAULT_PREFERENCES.darkThemePreset, 'default-dark')
    assert.deepEqual(DEFAULT_PREFERENCES.themeColors, DEFAULT_THEME_COLORS)
    assert.equal(DEFAULT_PREFERENCES.userProfile?.name, 'Developer')
    assert.equal(DEFAULT_PREFERENCES.userProfile?.email, 'developer@example.com')
  })

  it('provides rich built-in theme presets with valid hex colors', () => {
    assert.ok(THEME_PRESETS['default-dark'])
    assert.ok(THEME_PRESETS['github-dark'])
    assert.ok(THEME_PRESETS['dracula'])

    for (const [key, preset] of Object.entries(THEME_PRESETS)) {
      assert.ok(preset.label, `Preset ${key} must have label`)
      assert.match(preset.colors.background, /^#[0-9A-Fa-f]{6}$/)
      assert.match(preset.colors.foreground, /^#[0-9A-Fa-f]{6}$/)
      assert.match(preset.colors.accent, /^#[0-9A-Fa-f]{6}$/)
    }
  })
})
