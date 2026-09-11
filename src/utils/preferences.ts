import { useState, useEffect } from 'react'

export interface UserPreferences {
  showReasoning: boolean
  autoCollapsePrompt: boolean
  collapseToolBatch: boolean
  promptCharThreshold: number
  promptLineThreshold: number
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  showReasoning: true,
  autoCollapsePrompt: true,
  collapseToolBatch: true,
  promptCharThreshold: 240,
  promptLineThreshold: 4,
}

const STORAGE_KEY = 'opencode_companion_user_preferences'

export function getPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) }
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
