import { useState, useEffect } from 'react'
import {
  X,
  Sliders,
  AppWindow,
  Palette,
  Cpu,
  Keyboard,
  Globe,
  Monitor,
  Sun,
  Moon,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Lock,
  Search,
  Coins,
  Archive,
} from 'lucide-react'
import { api, BASE_URL, getAuthToken, setAuthToken } from '../../services/api'
import { getShortcuts, resetShortcuts, saveShortcuts, type ShortcutsMap, type ShortcutItem } from '../../utils/shortcuts'
import {
  usePreferences,
  THEME_PRESETS,
  DEFAULT_THEME_COLORS,
  type ConversationWidth,
} from '../../utils/preferences'
import { useI18n, type LanguagePreference } from '../../utils/i18n'
import { CountdownConfirmDialog } from '../common/CountdownConfirmDialog'
import type { ProviderInfo } from '../../types/opencode'
import { ManageModelsContent } from '../models/ManageModelsModal'
import { RelayHubSettings } from './RelayHubSettings'
import { ArchivedSessionsSettings } from './ArchivedSessionsSettings'

export type SettingsTab =
  | 'general'
  | 'application'
  | 'appearance'
  | 'models'
  | 'relays'
  | 'customizations'
  | 'browser'
  | 'archived'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: SettingsTab
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, initialTab }) => {
  const { prefs, updatePreferences } = usePreferences()
  const { lang, preferenceLang, setLanguage, t, tr } = useI18n()
  const isZh = lang === 'zh-CN'

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'appearance')
  const [autoAccept, setAutoAccept] = useState(false)
  const [expandShell, setExpandShell] = useState(false)
  const [expandEdit, setExpandEdit] = useState(false)

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab)
    }
  }, [isOpen, initialTab])

  // Daemon / Application state
  const [testingHealth, setTestingHealth] = useState(false)
  const [healthStatus, setHealthStatus] = useState<string | null>(null)
  const [authToken, setAuthTokenState] = useState(getAuthToken())

  // Shortcuts / Customizations state
  const [shortcuts, setShortcuts] = useState<ShortcutsMap>(getShortcuts())
  const [recordingKey, setRecordingKey] = useState<keyof ShortcutsMap | null>(null)
  const [shortcutSearch, setShortcutSearch] = useState('')
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false)

  // Models state
  const [providers, setProviders] = useState<ProviderInfo[]>([])

  useEffect(() => {
    if (isOpen) {
      api.getProviders().then(setProviders).catch(() => {})
    }
  }, [isOpen])

  // Sync theme variables to document root
  useEffect(() => {
    if (prefs.themeColors) {
      document.documentElement.style.setProperty('--theme-bg', prefs.themeColors.background)
      document.documentElement.style.setProperty('--theme-fg', prefs.themeColors.foreground)
      document.documentElement.style.setProperty('--theme-accent', prefs.themeColors.accent)
    }
  }, [prefs.themeColors])

  // Interactive keyboard shortcut recorder (M5)
  useEffect(() => {
    if (!recordingKey) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return
      }

      if (e.key === 'Escape') {
        setRecordingKey(null)
        return
      }

      const hasCtrl = e.ctrlKey || e.metaKey
      const hasShift = e.shiftKey
      const hasAlt = e.altKey

      const parts: string[] = []
      if (hasCtrl) parts.push('Ctrl')
      if (hasAlt) parts.push('Alt')
      if (hasShift) parts.push('Shift')
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key)
      const label = parts.join(' + ')

      const updatedShortcut: ShortcutItem = {
        key: e.key,
        ctrlKey: hasCtrl || undefined,
        shiftKey: hasShift || undefined,
        altKey: hasAlt || undefined,
        description: shortcuts[recordingKey].description,
        label,
      }

      const next = {
        ...shortcuts,
        [recordingKey]: updatedShortcut,
      }

      setShortcuts(next)
      saveShortcuts(next)
      setRecordingKey(null)
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [recordingKey, shortcuts])

  if (!isOpen) return null

  const handleTestHealth = async () => {
    setTestingHealth(true)
    setHealthStatus(null)
    try {
      const healthy = await api.checkHealth()
      setHealthStatus(healthy ? 'ok' : 'error')
    } catch {
      setHealthStatus('error')
    } finally {
      setTestingHealth(false)
    }
  }

  const handleSaveToken = () => {
    setAuthToken(authToken)
    alert(isZh ? '授权令牌已保存' : 'Auth token saved successfully')
  }

  const handleSelectPreset = (presetKey: string) => {
    if (THEME_PRESETS[presetKey]) {
      const preset = THEME_PRESETS[presetKey]
      updatePreferences({
        darkThemePreset: presetKey,
        themeColors: { ...preset.colors },
      })
    } else if (presetKey === 'custom') {
      updatePreferences({ darkThemePreset: 'custom' })
    }
  }

  const handleResetPreset = () => {
    updatePreferences({
      darkThemePreset: 'default-dark',
      themeColors: { ...DEFAULT_THEME_COLORS },
    })
  }

  const handleColorChange = (key: 'background' | 'foreground' | 'accent', val: string) => {
    updatePreferences({
      darkThemePreset: 'custom',
      themeColors: {
        ...prefs.themeColors,
        [key]: val,
      },
    })
  }

  const filteredShortcuts = (Object.keys(shortcuts) as Array<keyof ShortcutsMap>).filter((k) => {
    const item = shortcuts[k]
    const matchesQuery =
      !shortcutSearch.trim() ||
      item.description.toLowerCase().includes(shortcutSearch.toLowerCase()) ||
      item.label.toLowerCase().includes(shortcutSearch.toLowerCase()) ||
      k.toLowerCase().includes(shortcutSearch.toLowerCase())
    return matchesQuery
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-4xl h-[640px] flex flex-col rounded-2xl border border-[#272a32] bg-[#111317] text-[#e6edf3] shadow-2xl overflow-hidden">
        {/* Modal Header Bar */}
        <div className="h-12 px-5 flex items-center justify-between border-b border-[#21242a] bg-[#14171d]">
          <div className="flex items-center gap-2 text-zinc-300 font-semibold text-xs tracking-wide">
            <span>Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Left Sidebar + Right Content */}
        <div className="flex-1 flex flex-row min-h-0">
          {/* Left Navigation (Exact replicate of Antigravity Settings in Image 1) */}
          <div className="w-52 border-r border-[#21242a] bg-[#0d0f13] flex flex-col justify-between select-none">
            <div className="p-3 space-y-1">
              <div className="px-2 py-1 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                Settings
              </div>

              <button
                onClick={() => setActiveTab('general')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'general'
                    ? 'bg-[#252834] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#16181f]'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>General</span>
              </button>

              <button
                onClick={() => setActiveTab('application')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'application'
                    ? 'bg-[#252834] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#16181f]'
                }`}
              >
                <AppWindow className="w-4 h-4" />
                <span>Application</span>
              </button>

              <button
                onClick={() => setActiveTab('appearance')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'appearance'
                    ? 'bg-[#252834] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#16181f]'
                }`}
              >
                <Palette className="w-4 h-4" />
                <span>Appearance</span>
              </button>

              <button
                onClick={() => setActiveTab('models')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'models'
                    ? 'bg-[#252834] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#16181f]'
                }`}
              >
                <Cpu className="w-4 h-4" />
                <span>Models</span>
              </button>

              <button
                onClick={() => setActiveTab('relays')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'relays'
                    ? 'bg-[#252834] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#16181f]'
                }`}
              >
                <Coins className="w-4 h-4 text-amber-400" />
                <span>{isZh ? '中转站额度' : 'Relay Hub'}</span>
              </button>

              <button
                onClick={() => setActiveTab('customizations')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'customizations'
                    ? 'bg-[#252834] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#16181f]'
                }`}
              >
                <Keyboard className="w-4 h-4" />
                <span>Customizations</span>
              </button>

              <button
                onClick={() => setActiveTab('browser')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'browser'
                    ? 'bg-[#252834] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#16181f]'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>Browser</span>
              </button>

              <button
                onClick={() => setActiveTab('archived')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'archived'
                    ? 'bg-[#252834] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#16181f]'
                }`}
              >
                <Archive className="w-4 h-4 text-amber-400" />
                <span>{isZh ? '已归档会话' : 'Archived Sessions'}</span>
              </button>
            </div>

            {/* Bottom Profile Card (Image 1 & 2 footer) */}
            <div className="p-3 border-t border-[#21242a] flex items-center gap-2.5 bg-[#0a0c0f]">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-tr from-amber-500 to-indigo-500 flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0">
                <span>SJ</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-zinc-200 truncate">
                  {prefs.userProfile?.name || 'Developer'}
                </div>
                <div className="text-[10px] text-zinc-500 truncate">
                  {prefs.userProfile?.email || 'developer@example.com'}
                </div>
              </div>
            </div>
          </div>

          {/* Right Content Panel */}
          <div className="flex-1 p-7 overflow-y-auto bg-[#111317]">
            {/* 1. APPEARANCE TAB (Image 1 & Image 2) */}
            {activeTab === 'appearance' && (
              <div className="space-y-8 max-w-2xl">
                <div>
                  <h2 className="text-lg font-semibold text-[#f0f6fc]">Appearance</h2>
                  <p className="text-xs text-[#8b949e] mt-0.5">
                    Configure the agent's visual theme and display preferences.
                  </p>
                </div>

                {/* Section: Chat Settings */}
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Chat Settings
                  </h3>

                  {/* Verbose Agent Chat */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#21242b] bg-[#151820]">
                    <div>
                      <div className="text-xs font-medium text-zinc-200">Verbose Agent Chat</div>
                      <div className="text-[11px] text-zinc-500">
                        Display and preserve intermediate thinking steps.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updatePreferences({ verboseAgentChat: !prefs.verboseAgentChat })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                        prefs.verboseAgentChat ? 'bg-blue-600' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          prefs.verboseAgentChat ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Conversation Width */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#21242b] bg-[#151820]">
                    <div>
                      <div className="text-xs font-medium text-zinc-200">Conversation Width</div>
                      <div className="text-[11px] text-zinc-500">
                        Configure the maximum width of the conversation panel.
                      </div>
                    </div>

                    {/* Segmented Control: [Default] [Narrow] [Wide] */}
                    <div className="flex items-center bg-[#1b1e27] p-1 rounded-lg border border-[#272b36]">
                      {(['default', 'narrow', 'wide'] as ConversationWidth[]).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => updatePreferences({ conversationWidth: w })}
                          className={`px-3 py-1 text-xs rounded-md capitalize transition-all cursor-pointer ${
                            (prefs.conversationWidth || 'default') === w
                              ? 'bg-[#2b3040] text-white font-medium shadow-sm'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Section: Appearance (Theme Mode) */}
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Appearance
                  </h3>

                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#21242b] bg-[#151820]">
                    <div>
                      <div className="text-xs font-medium text-zinc-200">Theme</div>
                      <div className="text-[11px] text-zinc-500">
                        Select UI color theme mode.
                      </div>
                    </div>

                    {/* Segmented Control: [System] [Light] [Dark] */}
                    <div className="flex items-center bg-[#1b1e27] p-1 rounded-lg border border-[#272b36]">
                      <button
                        type="button"
                        onClick={() => updatePreferences({ themeMode: 'system' })}
                        className={`p-1.5 rounded-md transition-all cursor-pointer ${
                          prefs.themeMode === 'system'
                            ? 'bg-[#2b3040] text-white shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="System Theme"
                      >
                        <Monitor className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updatePreferences({ themeMode: 'light' })}
                        className={`p-1.5 rounded-md transition-all cursor-pointer ${
                          prefs.themeMode === 'light'
                            ? 'bg-[#2b3040] text-white shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Light Theme"
                      >
                        <Sun className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updatePreferences({ themeMode: 'dark' })}
                        className={`p-1.5 rounded-md transition-all cursor-pointer ${
                          prefs.themeMode === 'dark'
                            ? 'bg-[#2b3040] text-white shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Dark Theme"
                      >
                        <Moon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section: Dark Theme Customization (Image 1 & 2) */}
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Dark Theme
                  </h3>

                  {/* Preset Selector */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#21242b] bg-[#151820]">
                    <div className="text-xs font-medium text-zinc-200">Preset</div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetPreset}
                        className="p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Reset to Default Dark"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>

                      <select
                        value={prefs.darkThemePreset || 'default-dark'}
                        onChange={(e) => handleSelectPreset(e.target.value)}
                        className="bg-[#1b1e27] border border-[#272b36] text-xs text-zinc-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-zinc-500 cursor-pointer"
                      >
                        {Object.entries(THEME_PRESETS).map(([key, preset]) => (
                          <option key={key} value={key}>
                            {preset.label}
                          </option>
                        ))}
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                  </div>

                  {/* Background Color Row */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#21242b] bg-[#151820]">
                    <div className="text-xs font-medium text-zinc-200">Background</div>
                    <div className="flex items-center gap-2.5 bg-[#1b1e27] px-3 py-1.5 rounded-lg border border-[#272b36]">
                      <div
                        className="w-4 h-4 rounded border border-zinc-700 shadow-inner shrink-0"
                        style={{ backgroundColor: prefs.themeColors?.background || '#1A1B26' }}
                      />
                      <input
                        type="text"
                        value={prefs.themeColors?.background || '#1A1B26'}
                        onChange={(e) => handleColorChange('background', e.target.value)}
                        className="w-20 bg-transparent text-xs font-mono text-zinc-300 outline-none uppercase"
                      />
                    </div>
                  </div>

                  {/* Foreground Color Row */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#21242b] bg-[#151820]">
                    <div className="text-xs font-medium text-zinc-200">Foreground</div>
                    <div className="flex items-center gap-2.5 bg-[#1b1e27] px-3 py-1.5 rounded-lg border border-[#272b36]">
                      <div
                        className="w-4 h-4 rounded border border-zinc-700 shadow-inner shrink-0"
                        style={{ backgroundColor: prefs.themeColors?.foreground || '#A9B1D6' }}
                      />
                      <input
                        type="text"
                        value={prefs.themeColors?.foreground || '#A9B1D6'}
                        onChange={(e) => handleColorChange('foreground', e.target.value)}
                        className="w-20 bg-transparent text-xs font-mono text-zinc-300 outline-none uppercase"
                      />
                    </div>
                  </div>

                  {/* Accent Color Row */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#21242b] bg-[#151820]">
                    <div className="text-xs font-medium text-zinc-200">Accent</div>
                    <div className="flex items-center gap-2.5 bg-[#1b1e27] px-3 py-1.5 rounded-lg border border-[#272b36]">
                      <div
                        className="w-4 h-4 rounded border border-zinc-700 shadow-inner shrink-0"
                        style={{ backgroundColor: prefs.themeColors?.accent || '#7AA2F7' }}
                      />
                      <input
                        type="text"
                        value={prefs.themeColors?.accent || '#7AA2F7'}
                        onChange={(e) => handleColorChange('accent', e.target.value)}
                        className="w-20 bg-transparent text-xs font-mono text-zinc-300 outline-none uppercase"
                      />
                    </div>
                  </div>

                  {/* Live Code Preview Box (Image 2) */}
                  <div className="mt-4 p-4 rounded-xl border border-[#252834] bg-[#13151b] space-y-2">
                    <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                      Theme Code Preview
                    </div>
                    <pre
                      className="p-3.5 rounded-lg font-mono text-xs leading-relaxed overflow-x-auto shadow-inner border border-white/5"
                      style={{
                        backgroundColor: prefs.themeColors?.background || '#1A1B26',
                        color: prefs.themeColors?.foreground || '#A9B1D6',
                      }}
                    >
                      <span className="text-zinc-500">// Greet a user by name</span>
                      {'\n'}
                      <span style={{ color: prefs.themeColors?.accent || '#7AA2F7' }}>const</span>{' '}
                      <span className="text-blue-400">greet</span> = (
                      <span style={{ color: prefs.themeColors?.foreground || '#A9B1D6' }}>name</span>:{' '}
                      <span className="text-cyan-400">string</span>) =&gt; {'{\n'}
                      {'  '}<span style={{ color: prefs.themeColors?.accent || '#7AA2F7' }}>return</span>{' '}
                      <span className="text-emerald-400">`Hello, ${'{'}name{'}'}!`</span>;{'\n'}
                      {'}'};
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* 2. GENERAL TAB */}
            {activeTab === 'general' && (
              <div className="space-y-6 max-w-lg">
                <h3 className="text-sm font-semibold text-zinc-100">{t.settings.generalTab}</h3>

                {/* Language */}
                <div className="space-y-1">
                  <label className="text-xs text-zinc-300 font-medium">{t.settings.languageLabel}</label>
                  <p className="text-[11px] text-zinc-500">{t.settings.languageDesc}</p>
                  <select
                    value={preferenceLang}
                    onChange={(e) => setLanguage(e.target.value as LanguagePreference)}
                    className="w-full bg-[#16191f] border border-[#2c3038] text-xs text-zinc-200 rounded-md px-2.5 py-1.5 mt-1 focus:outline-none focus:border-zinc-500"
                  >
                    <option value="system">{tr('跟随系统 (System Default)', 'System Default', 'Systemstandard (System Default)')}</option>
                    <option value="zh-CN">简体中文 (Simplified Chinese)</option>
                    <option value="en-US">English</option>
                    <option value="de-DE">Deutsch (German)</option>
                  </select>
                </div>

                {/* Auto Accept Permissions */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">{t.settings.autoAcceptLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.autoAcceptDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoAccept}
                    onChange={(e) => setAutoAccept(e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Show Reasoning Summaries */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">{t.settings.showReasoningLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.showReasoningDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.showReasoning}
                    onChange={(e) => updatePreferences({ showReasoning: e.target.checked })}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Auto Collapse Long User Prompts */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">{t.settings.autoCollapsePromptLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.autoCollapsePromptDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.autoCollapsePrompt}
                    onChange={(e) => updatePreferences({ autoCollapsePrompt: e.target.checked })}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Collapse Left Sidebar on Startup */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">{t.settings.collapseSidebarOnStartupLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.collapseSidebarOnStartupDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.collapseSidebarOnStartup || false}
                    onChange={(e) => updatePreferences({ collapseSidebarOnStartup: e.target.checked })}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Show Timeline Quick-Jump Buttons */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">{t.settings.showTimelineQuickJumpLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.showTimelineQuickJumpDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.showTimelineQuickJump ?? true}
                    onChange={(e) => updatePreferences({ showTimelineQuickJump: e.target.checked })}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Collapse Tool Batches */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">{t.settings.collapseToolBatchLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.collapseToolBatchDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.collapseToolBatch}
                    onChange={(e) => updatePreferences({ collapseToolBatch: e.target.checked })}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">{t.settings.autoGitCheckpointLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.autoGitCheckpointDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.autoGitCheckpoint !== false}
                    onChange={(e) => updatePreferences({ autoGitCheckpoint: e.target.checked })}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Expand Shell Tool Parts */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">{t.settings.expandShellLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.expandShellDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={expandShell}
                    onChange={(e) => setExpandShell(e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Expand Edit Tool Parts */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">{t.settings.expandEditLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.expandEditDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={expandEdit}
                    onChange={(e) => setExpandEdit(e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* 3. APPLICATION TAB */}
            {activeTab === 'application' && (
              <div className="space-y-6 max-w-lg">
                <h3 className="text-sm font-semibold text-zinc-100">Application & Daemon Server</h3>

                {/* Daemon Status Card */}
                <div className="p-4 rounded-xl border border-[#272a32] bg-[#161820] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-200">OpenCode Daemon</span>
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Active (WSL2)
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono bg-[#0e1014] p-2.5 rounded-lg border border-[#21242b]">
                    {BASE_URL}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleTestHealth}
                      disabled={testingHealth}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#212530] hover:bg-[#2b3040] text-xs font-medium transition-colors border border-zinc-700 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testingHealth ? 'animate-spin' : ''}`} />
                      <span>{testingHealth ? 'Testing...' : 'Test Connection'}</span>
                    </button>
                    {healthStatus === 'ok' && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Connected
                      </span>
                    )}
                    {healthStatus === 'error' && (
                      <span className="flex items-center gap-1 text-xs text-rose-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Failed to connect
                      </span>
                    )}
                  </div>
                </div>

                {/* Auth Token Card */}
                <div className="p-4 rounded-xl border border-[#272a32] bg-[#161820] space-y-3">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-semibold text-zinc-200">Daemon Auth Token</span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Optional authentication token if daemon is protected by OPENCODE_TOKEN.
                  </p>
                  <input
                    type="password"
                    placeholder="Enter auth token if required..."
                    value={authToken}
                    onChange={(e) => setAuthTokenState(e.target.value)}
                    className="w-full bg-[#0e1014] border border-[#272a32] text-xs text-zinc-200 px-3 py-2 rounded-lg font-mono focus:outline-none focus:border-zinc-500"
                  />
                  <button
                    onClick={handleSaveToken}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    Save Token
                  </button>
                </div>
              </div>
            )}

            {/* 4. MODELS TAB */}
            {activeTab === 'models' && (
              <ManageModelsContent
                providers={providers}
                onClose={() => {}}
              />
            )}

            {/* 4.5 RELAY HUB TAB */}
            {activeTab === 'relays' && (
              <RelayHubSettings />
            )}

            {/* 5. CUSTOMIZATIONS TAB (Shortcuts Manager) */}
            {activeTab === 'customizations' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">Keyboard Shortcuts & Customizations</h3>
                    <p className="text-[11px] text-zinc-400">
                      Configure custom keyboard shortcuts and execution preferences.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsResetConfirmOpen(true)}
                    className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    Reset All
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search shortcuts..."
                    value={shortcutSearch}
                    onChange={(e) => setShortcutSearch(e.target.value)}
                    className="w-full bg-[#161820] border border-[#272a32] text-xs text-zinc-200 pl-8 pr-3 py-2 rounded-xl focus:outline-none focus:border-zinc-500"
                  />
                </div>

                {/* Shortcuts List */}
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {filteredShortcuts.map((key) => {
                    const item = shortcuts[key]
                    const isRecording = recordingKey === key

                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between p-3 rounded-xl border border-[#21242b] bg-[#151820] hover:border-zinc-700 transition-colors"
                      >
                        <div>
                          <div className="text-xs font-medium text-zinc-200">{item.description}</div>
                          <div className="text-[10px] text-zinc-500 font-mono">{key}</div>
                        </div>

                        <button
                          onClick={() => setRecordingKey(isRecording ? null : key)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                            isRecording
                              ? 'bg-orange-600 text-white animate-pulse border border-orange-400'
                              : 'bg-[#20232d] text-zinc-300 border border-zinc-700 hover:bg-[#2b2f3d]'
                          }`}
                        >
                          {isRecording ? 'Press keys...' : item.label}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 6. BROWSER TAB */}
            {activeTab === 'browser' && (
              <div className="space-y-6 max-w-lg">
                <h3 className="text-sm font-semibold text-zinc-100">Browser & Automation</h3>
                <div className="p-4 rounded-xl border border-[#272a32] bg-[#161820] space-y-3">
                  <span className="text-xs font-semibold text-zinc-200">Browser Automation Profile</span>
                  <p className="text-[11px] text-zinc-400">
                    Companion browser automation uses CDP and headless Chromium for web scraping, visual verification, and deep research.
                  </p>
                  <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
                    <ShieldCheck className="w-4 h-4" />
                    BrowserAutomation Skill Active
                  </div>
                </div>
              </div>
            )}

            {/* 7. ARCHIVED SESSIONS TAB */}
            {activeTab === 'archived' && (
              <ArchivedSessionsSettings />
            )}
          </div>
        </div>
      </div>

      {/* Countdown Reset Confirm Dialog */}
      <CountdownConfirmDialog
        isOpen={isResetConfirmOpen}
        title={isZh ? '重置所有快捷键' : 'Reset All Shortcuts'}
        description={isZh ? '此操作将清除所有自定义快捷键设置并恢复系统默认值，确定继续吗？' : 'This will restore all shortcuts to factory defaults. Continue?'}
        countdownSeconds={3}
        onConfirm={() => {
          resetShortcuts()
          setShortcuts(getShortcuts())
          setIsResetConfirmOpen(false)
        }}
        onClose={() => setIsResetConfirmOpen(false)}
      />
    </div>
  )
}
