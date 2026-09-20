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
  collapseToolBatch: boolean
  collapseSidebarOnStartup?: boolean
  autoGitCheckpoint?: boolean
  floatingDiffView?: boolean
  promptCharThreshold: number
  promptLineThreshold: number
  language: LanguagePreference
  showModelSelector: boolean
  showTimelineQuickJump: boolean
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
  collapseToolBatch: true,
  collapseSidebarOnStartup: false,
  autoGitCheckpoint: true,
  floatingDiffView: true,
  promptCharThreshold: 240,
  promptLineThreshold: 4,
  language: 'zh-CN',
  showModelSelector: true,
  showTimelineQuickJump: true,
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

export function getPreferences(): UserPreferences {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      let prefs: UserPreferences = { ...DEFAULT_PREFERENCES }
      if (raw) {
        prefs = { ...prefs, ...JSON.parse(raw) }
      }
      // Explicit user request: auto-enable this setting on first boot if not yet initialized
      if (!localStorage.getItem(SIDEBAR_PREF_INITIALIZED_KEY)) {
        localStorage.setItem(SIDEBAR_PREF_INITIALIZED_KEY, 'true')
        if (prefs.collapseSidebarOnStartup === undefined || prefs.collapseSidebarOnStartup === false) {
          prefs.collapseSidebarOnStartup = true
          localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
        }
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
