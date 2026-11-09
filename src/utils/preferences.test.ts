import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PREFERENCES,
  THEME_PRESETS,
  DEFAULT_THEME_COLORS,
  UserPreferences,
  getPreferences,
} from './preferences'

describe('Preferences Utilities (preferences.ts)', () => {
  it('contains valid default preferences matching Antigravity spec', () => {
    assert.equal(DEFAULT_PREFERENCES.verboseAgentChat, true)
    assert.equal(DEFAULT_PREFERENCES.collapseSidebarOnStartup, false)
    assert.equal(DEFAULT_PREFERENCES.translucentPromptInput, false)
    assert.equal(DEFAULT_PREFERENCES.translucentUiChrome, false)
    assert.equal(DEFAULT_PREFERENCES.collapseNavRailTopButtons, false)
    assert.equal(DEFAULT_PREFERENCES.autoRefreshRelayQuota, false)
    assert.equal(DEFAULT_PREFERENCES.lightTitlebar, true)
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

  it('initializes collapseNavRailTopButtons to true for user rollout when localStorage is available', () => {
    const store: Record<string, string> = {}
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = String(val)
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k]
      },
    }
    const origLocalStorage = (globalThis as any).localStorage
    try {
      ;(globalThis as any).localStorage = mockStorage
      const prefs = getPreferences()
      assert.equal(prefs.collapseNavRailTopButtons, true)
      assert.equal(store['opencode_collapse_nav_rail_top_buttons_initialized_v1'], 'true')
      assert.equal(prefs.translucentUiChrome, true)
      assert.equal(store['opencode_stealth_ui_chrome_initialized_v2'], 'true')
    } finally {
      ;(globalThis as any).localStorage = origLocalStorage
    }
  })
})
