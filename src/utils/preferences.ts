import { useState, useEffect } from 'react'

export type ConversationWidth = 'default' | 'narrow' | 'wide'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface ThemeColors {
  background: string
  foreground: string
  accent: string
}

export type LanguagePreference = 'system' | 'zh-CN' | 'en-US' | 'de-DE'

export interface UserPreferences {
  showReasoning: boolean
  autoCollapsePrompt: boolean
  autoCollapseResponse?: boolean
  collapseToolBatch: boolean
  collapseSidebarOnStartup?: boolean
  autoGitCheckpoint?: boolean
  floatingDiffView?: boolean
  promptCharThreshold: number
  promptLineThreshold: number
  language: LanguagePreference
  showModelSelector: boolean
  showTimelineQuickJump: boolean
  showTimelineZoomWidget?: boolean
  timelineZoom?: number
  translucentPromptInput?: boolean
  translucentUiChrome?: boolean
  collapseNavRailTopButtons?: boolean
  autoRefreshRelayQuota?: boolean
  lightTitlebar?: boolean
  mouseSideButtonNavigation?: boolean
  mouseSideButtonToggleDialogue?: boolean
  modelVisibility?: Record<string, boolean>
  providerVisibility?: Record<string, boolean>

  // Antigravity Appearance Settings
  verboseAgentChat: boolean
  conversationWidth: ConversationWidth
  themeMode: ThemeMode
  darkThemePreset: string
  themeColors: ThemeColors
  userProfile?: {
    name: string
    email: string
    avatar?: string
  }
}

export const DEFAULT_THEME_COLORS: ThemeColors = {
  background: '#1A1B26',
  foreground: '#A9B1D6',
  accent: '#7AA2F7',
}

export const THEME_PRESETS: Record<string, { label: string; colors: ThemeColors }> = {
  'default-dark': {
    label: 'Default Dark',
    colors: {
      background: '#1A1B26',
      foreground: '#A9B1D6',
      accent: '#7AA2F7',
    },
  },
  'github-dark': {
    label: 'GitHub Dark',
    colors: {
      background: '#0D1117',
      foreground: '#C9D1D9',
      accent: '#58A6FF',
    },
  },
  'one-dark-pro': {
    label: 'One Dark Pro',
    colors: {
      background: '#282C34',
      foreground: '#ABB2BF',
      accent: '#61AFEF',
    },
  },
  'dracula': {
    label: 'Dracula',
    colors: {
      background: '#282A36',
      foreground: '#F8F8F2',
      accent: '#BD93F9',
    },
  },
  'catppuccin': {
    label: 'Catppuccin Mocha',
    colors: {
      background: '#1E1E2E',
      foreground: '#CDD6F4',
      accent: '#89B4FA',
    },
  },
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  showReasoning: true,
  autoCollapsePrompt: true,
  autoCollapseResponse: true,
  collapseToolBatch: true,
  collapseSidebarOnStartup: false,
  autoGitCheckpoint: true,
  floatingDiffView: true,
  promptCharThreshold: 240,
  promptLineThreshold: 4,
  language: 'zh-CN',
  showModelSelector: true,
  showTimelineQuickJump: true,
  showTimelineZoomWidget: false,
  timelineZoom: 100,
  translucentPromptInput: false,
  translucentUiChrome: false,
  collapseNavRailTopButtons: false,
  autoRefreshRelayQuota: false,
  lightTitlebar: true,
  mouseSideButtonNavigation: true,
  mouseSideButtonToggleDialogue: false,
  modelVisibility: {},
  providerVisibility: {},
  verboseAgentChat: true,
  conversationWidth: 'default',
  themeMode: 'dark',
  darkThemePreset: 'default-dark',
  themeColors: DEFAULT_THEME_COLORS,
  userProfile: {
    name: 'Developer',
    email: 'developer@example.com',
  },
}

const STORAGE_KEY = 'opencode_companion_user_preferences'
const SIDEBAR_PREF_INITIALIZED_KEY = 'opencode_sidebar_startup_pref_initialized'
const ZOOM_WIDGET_DISABLED_KEY = 'opencode_timeline_zoom_disabled_default_v2'
const TRANSLUCENT_PROMPT_PREF_KEY = 'opencode_translucent_prompt_pref_initialized_v1'
const STEALTH_UI_CHROME_KEY = 'opencode_stealth_ui_chrome_initialized_v2'
const COLLAPSE_NAV_RAIL_TOP_BUTTONS_KEY = 'opencode_collapse_nav_rail_top_buttons_initialized_v1'
const MOUSE_SIDE_NAV_INITIALIZED_KEY = 'opencode_mouse_side_nav_pref_initialized_v1'

export function getPreferences(): UserPreferences {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      let prefs: UserPreferences = { ...DEFAULT_PREFERENCES }
      if (raw) {
        prefs = { ...prefs, ...JSON.parse(raw) }
      }
      if (prefs.autoCollapseResponse === undefined) {
        prefs.autoCollapseResponse = true
      }
      // Explicit user request: auto-enable this setting on first boot if not yet initialized
      if (!localStorage.getItem(SIDEBAR_PREF_INITIALIZED_KEY)) {
        localStorage.setItem(SIDEBAR_PREF_INITIALIZED_KEY, 'true')
        if (prefs.collapseSidebarOnStartup === undefined || prefs.collapseSidebarOnStartup === false) {
          prefs.collapseSidebarOnStartup = true
          localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
        }
      }
      // Explicit user request: disable custom timeline zoom controller by default (favor browser native zoom)
      if (!localStorage.getItem(ZOOM_WIDGET_DISABLED_KEY)) {
        localStorage.setItem(ZOOM_WIDGET_DISABLED_KEY, 'true')
        prefs.showTimelineZoomWidget = false
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
      }
      // Explicit user request: default false in schema, but auto-enable on client upon rollout
      if (!localStorage.getItem(TRANSLUCENT_PROMPT_PREF_KEY)) {
        localStorage.setItem(TRANSLUCENT_PROMPT_PREF_KEY, 'true')
        if (prefs.translucentPromptInput === undefined || prefs.translucentPromptInput === false) {
          prefs.translucentPromptInput = true
          localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
        }
      }
      // Explicit user request: default false in schema, but auto-enable on client upon rollout (stealth UI chrome for prompt, sidebar, and header)
      if (!localStorage.getItem(STEALTH_UI_CHROME_KEY)) {
        localStorage.setItem(STEALTH_UI_CHROME_KEY, 'true')
        if (prefs.translucentUiChrome === undefined || prefs.translucentUiChrome === false) {
          prefs.translucentUiChrome = true
          prefs.translucentPromptInput = true
          localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
        }
      }
      // Explicit user request: default false in schema, but auto-enable on client upon rollout (fold top 3 nav buttons into bottom menu)
      if (!localStorage.getItem(COLLAPSE_NAV_RAIL_TOP_BUTTONS_KEY)) {
        localStorage.setItem(COLLAPSE_NAV_RAIL_TOP_BUTTONS_KEY, 'true')
        if (prefs.collapseNavRailTopButtons === undefined || prefs.collapseNavRailTopButtons === false) {
          prefs.collapseNavRailTopButtons = true
          localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
        }
      }
      // Explicit user request: enable mouse side button session navigation by default
      if (!localStorage.getItem(MOUSE_SIDE_NAV_INITIALIZED_KEY)) {
        localStorage.setItem(MOUSE_SIDE_NAV_INITIALIZED_KEY, 'true')
        prefs.mouseSideButtonNavigation = true
        prefs.mouseSideButtonToggleDialogue = false
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
      }
      return prefs
    }
  } catch {
    // ignore parse failure
  }
  return DEFAULT_PREFERENCES
}

export function savePreferences(partial: Partial<UserPreferences>): UserPreferences {
  try {
    const current = getPreferences()
    const updated = { ...current, ...partial }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('preferences-changed', { detail: updated }))
    return updated
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(getPreferences)

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<UserPreferences>
      if (customEvent.detail) {
        setPrefs(customEvent.detail)
      }
    }
    window.addEventListener('preferences-changed', handler)
    return () => window.removeEventListener('preferences-changed', handler)
  }, [])

  return { prefs, updatePreferences: savePreferences }
}

export function resolveSystemLanguage(): 'zh-CN' | 'en-US' | 'de-DE' {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language.toLowerCase()
    if (lang.startsWith('zh')) return 'zh-CN'
    if (lang.startsWith('de')) return 'de-DE'
    return 'en-US'
  }
  return 'zh-CN'
}

export function resolveLanguage(pref?: LanguagePreference | string): 'zh-CN' | 'en-US' | 'de-DE' {
  if (!pref || pref === 'system') {
    return resolveSystemLanguage()
  }
  if (pref === 'de-DE' || pref === 'en-US' || pref === 'zh-CN') {
    return pref as 'zh-CN' | 'en-US' | 'de-DE'
  }
  return 'zh-CN'
}
