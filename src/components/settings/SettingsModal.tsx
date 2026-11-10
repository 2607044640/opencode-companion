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
import {
  getShortcuts,
  resetShortcuts,
  saveShortcuts,
  filterShortcutKeys,
  SHORTCUT_CATEGORIES,
  DEFAULT_SHORTCUTS,
  type ShortcutsMap,
  type ShortcutItem,
  type ShortcutFilterCategory,
  type ShortcutCategory,
  type RecordedKeyFilter,
} from '../../utils/shortcuts'
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
  const [shortcutCategory, setShortcutCategory] = useState<ShortcutFilterCategory>('all')
  const [isRecordingFilterKey, setIsRecordingFilterKey] = useState(false)
  const [recordedFilter, setRecordedFilter] = useState<RecordedKeyFilter | null>(null)
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
        ...shortcuts[recordingKey],
        key: e.key,
        ctrlKey: hasCtrl || undefined,
        shiftKey: hasShift || undefined,
        altKey: hasAlt || undefined,
        description: shortcuts[recordingKey].description,
        category: shortcuts[recordingKey].category || DEFAULT_SHORTCUTS[recordingKey]?.category || 'general',
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

  // Interactive keystroke filter recorder
  useEffect(() => {
    if (!isRecordingFilterKey) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Ignore standalone modifier presses
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return
      }

      // Escape cancels recording
      if (e.key === 'Escape') {
        setIsRecordingFilterKey(false)
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

      setRecordedFilter({
        key: e.key,
        ctrlKey: hasCtrl || undefined,
        shiftKey: hasShift || undefined,
        altKey: hasAlt || undefined,
        label,
      })
      setIsRecordingFilterKey(false)
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [isRecordingFilterKey])

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

  const filteredShortcuts = filterShortcutKeys(shortcuts, shortcutCategory, shortcutSearch, recordedFilter)

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
                <Coins className="w-4 h-4 text-sky-400" />
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
                <Archive className="w-4 h-4 text-sky-400" />
                <span>{isZh ? '已归档会话' : 'Archived Sessions'}</span>
              </button>
            </div>

            {/* Bottom Profile Card (Image 1 & 2 footer) */}
            <div className="p-3 border-t border-[#21242a] flex items-center gap-2.5 bg-[#0a0c0f]">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0">
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

                  {/* Stealth UI Chrome Mode (Prompt, Sidebar & Topbar) */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#21242b] bg-[#151820]">
                    <div>
                      <div className="text-xs font-medium text-zinc-200">
                        {tr('全局界面半隐形悬浮显现 (沉浸阅读)', 'Stealth UI Chrome (Dim when idle)', 'Transparente Benutzeroberfläche')}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {tr(
                          '平时将输入框、左侧栏与上方顶栏保持半透明隐形（透明度更低更沉浸），鼠标移入或聚焦时完全显现，减少视觉干扰',
                          'Keep prompt input, left sidebar, and top header semi-translucent when idle (lower opacity for deeper immersion); fully reveals on hover or focus',
                          'Eingabeleiste, Seitenleiste und obere Leiste im Ruhezustand transparent halten; bei Hover/Fokus vollständig sichtbar'
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !(prefs.translucentUiChrome ?? prefs.translucentPromptInput)
                        updatePreferences({ translucentUiChrome: next, translucentPromptInput: next })
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                        (prefs.translucentUiChrome ?? prefs.translucentPromptInput) ? 'bg-blue-600' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          (prefs.translucentUiChrome ?? prefs.translucentPromptInput) ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Fold Nav Rail Top Buttons into Bottom Menu */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#21242b] bg-[#151820]">
                    <div>
                      <div className="text-xs font-medium text-zinc-200">
                        {tr('折叠左上角导航按钮至左下角', 'Fold Nav Rail Top Buttons into Bottom Menu', 'Obere Navigations-Buttons ins untere Menü')}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {tr(
                          '收起侧边栏时，将左上角的展开侧栏、看板与顶部栏按钮隐藏，并折叠收纳进左下角“···”快捷菜单中',
                          'When sidebar is collapsed, hide top navigation buttons (sidebar toggle, board, top bar) and fold them into the bottom-left "···" shortcut menu',
                          'Versteckt obere Navigationsschaltflächen bei eingeklappter Seitenleiste und bündelt sie im "···"-Menü'
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updatePreferences({ collapseNavRailTopButtons: !prefs.collapseNavRailTopButtons })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                        prefs.collapseNavRailTopButtons ? 'bg-blue-600' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          prefs.collapseNavRailTopButtons ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Lighter Window Title Bar (PWA / Edge App Mode) */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#21242b] bg-[#151820]">
                    <div>
                      <div className="text-xs font-medium text-zinc-200">
                        {tr('顶部窗口标题栏浅色主题', 'Lighter Window Titlebar', 'Helle Fenster-Titelleiste')}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {tr(
                          '默认开启。在 Windows / Edge 应用模式下将外部顶部标题栏由纯黑调整为优雅浅石板色调，使整体界面更开阔协调',
                          'Enabled by default. Styles the external window titlebar with a modern lighter slate tone instead of pure black in Edge app mode',
                          'Standardmäßig aktiviert. Färbt die Titelleiste im helleren Schieferton statt reinem Schwarz'
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updatePreferences({ lightTitlebar: !(prefs.lightTitlebar ?? true) })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                        (prefs.lightTitlebar ?? true) ? 'bg-blue-600' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          (prefs.lightTitlebar ?? true) ? 'translate-x-6' : 'translate-x-1'
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

                {/* Auto Collapse Long AI Responses */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">{tr('自动折叠超长 AI 回答', 'Auto Collapse Long AI Responses', 'Lange KI-Antworten automatisch einklappen')}</div>
                    <div className="text-[11px] text-zinc-500">{tr('超长模型回答默认折叠显示，可通过右侧长按钮或快捷键展开', 'Long responses collapsed by default, expandable via right button or shortcut', 'Lange Antworten standardmäßig einklappen')}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.autoCollapseResponse ?? true}
                    onChange={(e) => updatePreferences({ autoCollapseResponse: e.target.checked })}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* 10-Minute Relay Quota Auto Refresh */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">
                      {tr('每 10 分钟自动刷新中转站额度', 'Auto-refresh relay quota every 10 minutes', 'Relay-Guthaben alle 10 Minuten aktualisieren')}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {tr(
                        '默认禁用。开启后，在伴侣端打开且前台处于活跃状态时，每 10 分钟自动刷新各中转站最新额度并记录走势点',
                        'Disabled by default. When enabled, auto-refreshes relay quota every 10 minutes when the app is active and in foreground',
                        'Standardmäßig deaktiviert. Wenn aktiviert, wird das Guthaben alle 10 Minuten aktualisiert'
                      )}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(prefs.autoRefreshRelayQuota)}
                    onChange={(e) => updatePreferences({ autoRefreshRelayQuota: e.target.checked })}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Dialogue Expand / Collapse Quick Actions & Shortcuts */}
                <div className="flex items-center justify-between py-2.5 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">{tr('对话全屏伸缩快捷键', 'Dialogue Expand / Collapse Shortcuts', 'Dialog-Ein-/Ausklappen-Tastenkombinationen')}</div>
                    <div className="text-[11px] text-zinc-500">{tr('快捷键：Ctrl+Shift+O 展开所有对话，Ctrl+Shift+C 收缩所有对话', 'Shortcuts: Ctrl+Shift+O to expand all dialogues, Ctrl+Shift+C to collapse all', 'Tastenkombination: Ctrl+Shift+O zum Ausklappen, Ctrl+Shift+C zum Einklappen')}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('opencode-expand-all-dialogues'))}
                      className="px-2.5 py-1 text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Ctrl + Shift + O"
                    >
                      <span>{tr('展开全部', 'Expand All', 'Alle ausklappen')}</span>
                      <kbd className="px-1 py-0.2 rounded bg-zinc-900 border border-zinc-700 text-[10px] font-mono text-zinc-400">Ctrl+Shift+O</kbd>
                    </button>
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('opencode-collapse-all-dialogues'))}
                      className="px-2.5 py-1 text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Ctrl + Shift + C"
                    >
                      <span>{tr('收缩全部', 'Collapse All', 'Alle einklappen')}</span>
                      <kbd className="px-1 py-0.2 rounded bg-zinc-900 border border-zinc-700 text-[10px] font-mono text-zinc-400">Ctrl+Shift+C</kbd>
                    </button>
                  </div>
                </div>

                {/* Mouse Side Buttons & Alt+Click Session Navigation (Antigravity parity) */}
                <div className="flex items-center justify-between py-2.5 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">{tr('鼠标侧键与 Alt+点击导航会话历史', 'Mouse Side Buttons & Alt+Click Session Navigation', 'Maus-Seitentasten & Alt+Klick Sitzungsnavigation')}</div>
                    <div className="text-[11px] text-zinc-500">{tr('对齐 Antigravity 体验。支持鼠标侧键（后退/前进）、Alt+左键（后退）、Alt+右键（前进）以及 Alt+←/→ 在会话历史记录间快速穿梭', 'Antigravity parity. Supports mouse side buttons (Back/Forward), Alt+Left Click (Back), Alt+Right Click (Forward), and Alt+←/→ to navigate session history', 'Antigravity-kompatibel. Unterstützt Seitentasten, Alt+Klick und Alt+Pfeiltasten zur Sitzungsnavigation')}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={prefs.mouseSideButtonNavigation ?? true}
                      onChange={(e) => updatePreferences({ mouseSideButtonNavigation: e.target.checked })}
                      className="rounded border-zinc-700 bg-zinc-900 text-sky-500 focus:ring-sky-500/20 w-4 h-4 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Mouse Upper Side Button: Toggle Dialogue in Center of Screen */}
                <div className="flex items-center justify-between py-2.5 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">{tr('伸缩屏幕中央对话 (Ctrl+Shift+D)', 'Toggle Center Dialogue (Ctrl+Shift+D)', 'Dialog in Bildschirmmitte umschalten')}</div>
                    <div className="text-[11px] text-zinc-500">{tr('按下 Ctrl+Shift+D 自动判断并展开/折叠屏幕最中间的对话块', 'Press Ctrl+Shift+D to automatically toggle the dialogue block in the center of your screen', 'Ctrl+Shift+D drücken, um den Dialog in der Bildschirmmitte ein-/auszuklappen')}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('opencode-toggle-center-dialogue'))}
                      className="px-2.5 py-1 text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Ctrl + Shift + D"
                    >
                      <span>{tr('测试切换', 'Test Toggle', 'Testen')}</span>
                      <kbd className="px-1 py-0.2 rounded bg-zinc-900 border border-zinc-700 text-[10px] font-mono text-zinc-400">Ctrl+Shift+D</kbd>
                    </button>
                  </div>
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

                {/* Fold Nav Rail Top Buttons into Bottom Menu */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">
                      {tr('折叠左上角导航按钮至左下角', 'Fold Nav Rail Top Buttons into Bottom Menu', 'Obere Navigations-Buttons ins untere Menü')}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {tr(
                        '收起侧边栏时，将左上角的展开侧栏、看板与顶部栏按钮隐藏，并折叠收纳进左下角“···”快捷菜单中',
                        'When sidebar is collapsed, hide top navigation buttons (sidebar toggle, board, top bar) and fold them into the bottom-left "···" shortcut menu',
                        'Versteckt obere Navigationsschaltflächen bei eingeklappter Seitenleiste und bündelt sie im "···"-Menü'
                      )}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.collapseNavRailTopButtons ?? false}
                    onChange={(e) => updatePreferences({ collapseNavRailTopButtons: e.target.checked })}
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

                {/* Show Timeline Zoom Widget */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">{t.settings.showTimelineZoomWidgetLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.showTimelineZoomWidgetDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.showTimelineZoomWidget ?? false}
                    onChange={(e) => updatePreferences({ showTimelineZoomWidget: e.target.checked })}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Stealth UI Chrome Mode (Prompt, Sidebar & Topbar) */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">
                      {tr('全局界面半隐形悬浮显现 (沉浸阅读)', 'Stealth UI Chrome (Dim when idle)', 'Transparente Benutzeroberfläche')}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {tr(
                        '平时将输入框、左侧栏与上方顶栏保持半透明隐形（透明度更低更沉浸），鼠标移入或聚焦时完全显现，减少视觉干扰',
                        'Keep prompt input, left sidebar, and top header semi-translucent when idle (lower opacity for deeper immersion); fully reveals on mouse hover or focus to minimize visual distraction',
                        'Eingabeleiste, Seitenleiste und obere Leiste im Ruhezustand transparent halten; wird bei Mauszeigerkontakt oder Fokus vollständig sichtbar'
                      )}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(prefs.translucentUiChrome ?? prefs.translucentPromptInput)}
                    onChange={(e) => updatePreferences({ translucentUiChrome: e.target.checked, translucentPromptInput: e.target.checked })}
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
                    <div className="text-xs text-zinc-300 font-medium">{t.settings.floatingDiffViewLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.floatingDiffViewDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.floatingDiffView !== false}
                    onChange={(e) => updatePreferences({ floatingDiffView: e.target.checked })}
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
                    <Lock className="w-4 h-4 text-sky-400" />
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
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
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
              <div className="space-y-4 text-sm text-zinc-300">
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#21242b] bg-[#151820]">
                  <div>
                    <div className="text-xs font-medium text-zinc-200">
                      {tr('每 10 分钟自动刷新中转站额度', 'Auto-refresh relay quota every 10 minutes', 'Relay-Guthaben alle 10 Minuten aktualisieren')}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {tr(
                        '默认禁用。开启后，在伴侣端处于前台时，每 10 分钟自动向各中转站请求一次最新额度并记录走势点',
                        'Disabled by default. When enabled, auto-refreshes relay quota every 10 minutes when the app is active in foreground',
                        'Standardmäßig deaktiviert. Wenn aktiviert, wird das Guthaben alle 10 Minuten aktualisiert'
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updatePreferences({ autoRefreshRelayQuota: !prefs.autoRefreshRelayQuota })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                      prefs.autoRefreshRelayQuota ? 'bg-blue-600' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        prefs.autoRefreshRelayQuota ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="space-y-1.5 text-xs text-zinc-400">
                  <p>中转站额度、Key 和兑换地址已并入模型路由悬浮面板（Ctrl+Shift+3）的「中转额度」页。</p>
                  <p className="text-[11px] text-zinc-500">顶栏金币按钮的设置入口也会打开那一页。这里不再单独维护一份。</p>
                </div>
              </div>
            )}

            {/* 5. CUSTOMIZATIONS TAB (Shortcuts Manager) */}
            {activeTab === 'customizations' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">Keyboard Shortcuts & Customizations</h3>
                    <p className="text-[11px] text-zinc-400">
                      Configure custom keyboard shortcuts and execution preferences.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsResetConfirmOpen(true)}
                    className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    Reset All
                  </button>
                </div>

                {/* Search Bar with Keystroke Recording Filter */}
                <div className="flex items-center gap-2">
                  <div
                    className={`relative flex-1 flex items-center bg-[#161820] border rounded-xl transition-all ${
                      isRecordingFilterKey
                        ? 'border-sky-500 ring-2 ring-sky-500/20 shadow-lg'
                        : 'border-[#272a32] focus-within:border-zinc-500'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5 absolute left-3 text-zinc-500 pointer-events-none" />

                    {recordedFilter ? (
                      <div className="flex items-center gap-1.5 pl-8 pr-2 py-1.5 w-full">
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono text-xs shadow-xs">
                          <Keyboard className="w-3 h-3 text-sky-400" />
                          <span>{recordedFilter.label}</span>
                          <button
                            type="button"
                            onClick={() => setRecordedFilter(null)}
                            className="ml-1 hover:text-white hover:bg-sky-500/30 rounded p-0.5 cursor-pointer transition-colors"
                            title={isZh ? '清除按键筛选' : 'Clear key filter'}
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                        <input
                          type="text"
                          placeholder={isZh ? '叠加文字搜索...' : 'Filter further by text...'}
                          value={shortcutSearch}
                          onChange={(e) => setShortcutSearch(e.target.value)}
                          className="flex-1 bg-transparent text-xs text-zinc-200 outline-none px-1"
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder={
                          isRecordingFilterKey
                            ? isZh
                              ? '请在键盘上按下快捷键组合 (如 Ctrl+Shift+A，按 Esc 取消)...'
                              : 'Press key combination (e.g. Ctrl+Shift+A, Esc to cancel)...'
                            : isZh
                            ? '搜索快捷键，或点击右侧按钮按键筛选...'
                            : 'Search shortcuts, or record keystroke to filter...'
                        }
                        value={shortcutSearch}
                        onChange={(e) => setShortcutSearch(e.target.value)}
                        readOnly={isRecordingFilterKey}
                        className="w-full bg-transparent text-xs text-zinc-200 pl-8 pr-10 py-2 outline-none"
                      />
                    )}

                    {/* Clear Text button if text search exists */}
                    {shortcutSearch && !recordedFilter && (
                      <button
                        type="button"
                        onClick={() => setShortcutSearch('')}
                        className="absolute right-2.5 text-zinc-500 hover:text-zinc-300 p-0.5 cursor-pointer"
                        title={isZh ? '清空输入' : 'Clear text'}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Keystroke Recorder Filter Button */}
                  <button
                    type="button"
                    onClick={() => setIsRecordingFilterKey((prev) => !prev)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer shrink-0 border ${
                      isRecordingFilterKey
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-md animate-pulse'
                        : recordedFilter
                        ? 'bg-sky-950/40 text-sky-300 border-sky-800 hover:bg-sky-900/50'
                        : 'bg-[#181a22] text-zinc-300 border-[#272a32] hover:bg-[#20232d] hover:text-white'
                    }`}
                    title={isZh ? '按下快捷键直接筛选对应功能 (如 Ctrl+Shift+A)' : 'Record keystrokes to filter (e.g. Ctrl+Shift+A)'}
                  >
                    <Keyboard
                      className={`w-3.5 h-3.5 ${
                        isRecordingFilterKey ? 'animate-bounce text-sky-400' : 'text-zinc-400'
                      }`}
                    />
                    <span>
                      {isRecordingFilterKey
                        ? isZh
                          ? '正在监听按键...'
                          : 'Listening...'
                        : isZh
                        ? '按快捷键筛选'
                        : 'Record Keys'}
                    </span>
                  </button>
                </div>

                {/* Category Filter Tabs (All / Map / Dialogue / Tabs / General) */}
                <div
                  className="flex flex-wrap items-center gap-1.5 bg-[#14171f] p-1.5 rounded-xl border border-[#232733]"
                  role="tablist"
                  aria-label="Shortcut Categories"
                >
                  {SHORTCUT_CATEGORIES.map((cat) => {
                    const count = filterShortcutKeys(shortcuts, cat.id, shortcutSearch, recordedFilter).length
                    const isActive = shortcutCategory === cat.id
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        data-shortcut-category={cat.id}
                        onClick={() => setShortcutCategory(cat.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                          isActive
                            ? cat.id === 'map'
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                              : 'bg-[#282d3d] text-white border border-zinc-600/60 shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1c202b] border border-transparent'
                        }`}
                      >
                        <span>{isZh ? cat.labelZh : cat.labelEn}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                            isActive
                              ? cat.id === 'map'
                                ? 'bg-cyan-500/30 text-cyan-200'
                                : 'bg-zinc-700/80 text-zinc-200'
                              : 'bg-zinc-800/80 text-zinc-500'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Shortcuts List */}
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {filteredShortcuts.length === 0 ? (
                    <div className="py-8 text-center text-xs text-zinc-500 border border-dashed border-[#232733] rounded-xl space-y-1">
                      <div>{isZh ? '该分类下暂无匹配的快捷键' : 'No matching shortcuts in this category'}</div>
                      {recordedFilter && (
                        <div>
                          <button
                            type="button"
                            onClick={() => setRecordedFilter(null)}
                            className="text-sky-400 hover:underline text-[11px] cursor-pointer inline-block mt-1"
                          >
                            {isZh ? `清除按键筛选「${recordedFilter.label}」` : `Clear key filter "${recordedFilter.label}"`}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    filteredShortcuts.map((key) => {
                      const item = shortcuts[key]
                      const isRecording = recordingKey === key
                      const itemCat: ShortcutCategory =
                        item.category || DEFAULT_SHORTCUTS[key]?.category || 'general'
                      const badgeStyles: Record<ShortcutCategory, string> = {
                        map: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
                        dialogue: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                        workspace: 'bg-zinc-800 text-zinc-300 border-zinc-700/60',
                        general: 'bg-zinc-500/15 text-zinc-400 border-zinc-600/30',
                      }
                      const badgeLabels: Record<ShortcutCategory, string> = {
                        map: isZh ? 'Map 地图' : 'Map',
                        dialogue: isZh ? 'Dialogue 对话' : 'Dialogue',
                        workspace: isZh ? 'Tabs 标签' : 'Tabs',
                        general: isZh ? 'General 通用' : 'General',
                      }

                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between p-3 rounded-xl border border-[#21242b] bg-[#151820] hover:border-zinc-700 transition-colors"
                        >
                          <div className="min-w-0 pr-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium text-zinc-200">{item.description}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${badgeStyles[itemCat]}`}
                              >
                                {badgeLabels[itemCat]}
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{key}</div>
                          </div>

                          <button
                            onClick={() => setRecordingKey(isRecording ? null : key)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer shrink-0 ${
                              isRecording
                                ? 'bg-sky-600 text-white animate-pulse border border-sky-400'
                                : 'bg-[#20232d] text-zinc-300 border border-zinc-700 hover:bg-[#2b2f3d]'
                            }`}
                          >
                            {isRecording ? 'Press keys...' : item.label}
                          </button>
                        </div>
                      )
                    })
                  )}
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
