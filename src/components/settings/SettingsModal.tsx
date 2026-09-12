import { useState, useEffect } from 'react'
import {
  X,
  Sliders,
  Keyboard,
  Server,
  Cpu,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Search,
} from 'lucide-react'
import { api, BASE_URL, getAuthToken, setAuthToken } from '../../services/api'
import { getShortcuts, resetShortcuts, saveShortcuts, type ShortcutsMap, type ShortcutItem } from '../../utils/shortcuts'
import { usePreferences } from '../../utils/preferences'
import { useI18n, type SupportedLanguage } from '../../utils/i18n'
import { CountdownConfirmDialog } from '../common/CountdownConfirmDialog'
import type { ProviderInfo } from '../../types/opencode'
import { ManageModelsContent } from '../models/ManageModelsModal'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { prefs, updatePreferences } = usePreferences()
  const { lang, setLanguage, t } = useI18n()
  const [activeTab, setActiveTab] = useState<'general' | 'shortcuts' | 'servers' | 'models'>('general')
  const [autoAccept, setAutoAccept] = useState(false)
  const [expandShell, setExpandShell] = useState(false)
  const [expandEdit, setExpandEdit] = useState(false)

  const [testingHealth, setTestingHealth] = useState(false)
  const [healthStatus, setHealthStatus] = useState<string | null>(null)
  const [authToken, setAuthTokenState] = useState(getAuthToken())
  const [shortcuts, setShortcuts] = useState<ShortcutsMap>(getShortcuts())
  const [recordingKey, setRecordingKey] = useState<keyof ShortcutsMap | null>(null)
  const [shortcutCategory, setShortcutCategory] = useState<'all' | 'general' | 'map'>('all')
  const [shortcutSearch, setShortcutSearch] = useState('')
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false)
  const [providers, setProviders] = useState<ProviderInfo[]>([])

  useEffect(() => {
    if (isOpen) {
      api.getProviders().then(setProviders).catch(() => {})
    }
  }, [isOpen])

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

  const handleTestConnection = async () => {
    setTestingHealth(true)
    setHealthStatus(null)
    try {
      const ok = await api.checkHealth(5000)
      setHealthStatus(ok ? 'connected' : 'error')
    } catch {
      setHealthStatus('error')
    } finally {
      setTestingHealth(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-modal="settings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs select-none"
    >
      <div className="w-[780px] h-[520px] bg-[#111317] border border-[#272a31] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="h-12 px-4 border-b border-[#21242a] flex items-center justify-between bg-[#14161c]">
          <span className="font-semibold text-zinc-200 text-sm">{t.settings.title}</span>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Layout (Replicating Image 3) */}
        <div className="flex-1 flex flex-row min-h-0">
          {/* Left Navigation (Exact Replicate of Image 3) */}
          <div className="w-52 border-r border-[#21242a] bg-[#0d0f12] p-3 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Desktop Section */}
              <div>
                <div className="px-2 text-[10px] font-semibold text-zinc-500 uppercase mb-1">
                  {t.settings.desktopSection}
                </div>
                <button
                  onClick={() => setActiveTab('general')}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                    activeTab === 'general'
                      ? 'bg-[#1e2229] text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#16181d]'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{t.settings.generalTab}</span>
                </button>
                <button
                  onClick={() => setActiveTab('shortcuts')}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                    activeTab === 'shortcuts'
                      ? 'bg-[#1e2229] text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#16181d]'
                  }`}
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>{t.settings.shortcutsTab}</span>
                </button>
              </div>

              {/* Server Section */}
              <div>
                <div className="px-2 text-[10px] font-semibold text-zinc-500 uppercase mb-1">
                  {t.settings.serverSection}
                </div>
                <button
                  onClick={() => setActiveTab('servers')}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                    activeTab === 'servers'
                      ? 'bg-[#1e2229] text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#16181d]'
                  }`}
                >
                  <Server className="w-3.5 h-3.5" />
                  <span>{t.settings.daemonTab}</span>
                </button>
                <button
                  onClick={() => setActiveTab('models')}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                    activeTab === 'models'
                      ? 'bg-[#1e2229] text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#16181d]'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>{t.settings.modelsTab}</span>
                </button>
              </div>
            </div>

            {/* Version Tag (Image 3 footer) */}
            <div className="p-2 text-[10px] text-zinc-500 border-t border-zinc-800/60 font-mono">
              OpenCode Desktop v1.18.22
            </div>
          </div>

          {/* Right Content Panel */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'general' && (
              <div className="space-y-6 max-w-lg">
                <h3 className="text-sm font-semibold text-zinc-100">{t.settings.generalTab}</h3>

                {/* Language */}
                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">{t.settings.languageLabel}</label>
                  <p className="text-[11px] text-zinc-500">{t.settings.languageDesc}</p>
                  <select
                    value={lang}
                    onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                    className="w-full bg-[#16191f] border border-[#2c3038] text-zinc-200 rounded-md px-2.5 py-1.5 mt-1 focus:outline-none focus:border-zinc-500"
                  >
                    <option value="zh-CN">简体中文 (Simplified Chinese)</option>
                    <option value="en-US">English</option>
                  </select>
                </div>

                {/* Auto Accept Permissions */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-zinc-300 font-medium">{t.settings.autoAcceptLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.autoAcceptDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoAccept}
                    onChange={(e) => setAutoAccept(e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-purple-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Show Reasoning Summaries */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-zinc-300 font-medium">{t.settings.showReasoningLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.showReasoningDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.showReasoning}
                    onChange={(e) => updatePreferences({ showReasoning: e.target.checked })}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-purple-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Auto Collapse Long User Prompts */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-zinc-300 font-medium">{t.settings.autoCollapsePromptLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.autoCollapsePromptDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.autoCollapsePrompt}
                    onChange={(e) => updatePreferences({ autoCollapsePrompt: e.target.checked })}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-purple-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Show Timeline Quick-Jump Buttons */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-zinc-300 font-medium">{t.settings.showTimelineQuickJumpLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.showTimelineQuickJumpDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.showTimelineQuickJump ?? true}
                    onChange={(e) => updatePreferences({ showTimelineQuickJump: e.target.checked })}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-purple-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Collapse Tool Batches */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-zinc-300 font-medium">{t.settings.collapseToolBatchLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.collapseToolBatchDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.collapseToolBatch}
                    onChange={(e) => updatePreferences({ collapseToolBatch: e.target.checked })}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-purple-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Expand Shell Tool Parts */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-zinc-300 font-medium">{t.settings.expandShellLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.expandShellDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={expandShell}
                    onChange={(e) => setExpandShell(e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-purple-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Expand Edit Tool Parts */}
                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <div className="text-zinc-300 font-medium">{t.settings.expandEditLabel}</div>
                    <div className="text-[11px] text-zinc-500">{t.settings.expandEditDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={expandEdit}
                    onChange={(e) => setExpandEdit(e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-purple-600 focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {activeTab === 'servers' && (
              <div className="space-y-4 max-w-lg">
                <h3 className="text-sm font-semibold text-zinc-100">{t.settings.daemonTitle}</h3>

                {/* Connection Box */}
                <div className="p-3 bg-[#16181e] border border-[#2c3038] rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-zinc-300">
                      {t.settings.targetEndpoint}: <code className="text-orange-400 font-mono">{BASE_URL}</code>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded">
                      <ShieldCheck className="w-3 h-3" />
                      {t.settings.locked127}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {t.settings.daemonLoopbackDesc}
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={handleTestConnection}
                      disabled={testingHealth}
                      className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1.5 font-medium transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testingHealth ? 'animate-spin' : ''}`} />
                      <span>{t.settings.testHealth}</span>
                    </button>

                    {healthStatus === 'connected' && (
                      <span className="flex items-center gap-1 text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t.settings.onlineReady}
                      </span>
                    )}

                    {healthStatus === 'error' && (
                      <span className="flex items-center gap-1 text-rose-400 font-medium">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {t.settings.unreachable}
                      </span>
                    )}
                  </div>
                </div>

                {/* Security Advisory Warning Card */}
                <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-lg space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{t.settings.threatWarningTitle}</span>
                  </div>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    {t.settings.threatWarningDesc}
                  </p>
                </div>

                {/* Optional Proxy Auth Token */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                    <Lock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{t.settings.proxyTokenTitle}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    {t.settings.proxyTokenDesc}
                  </p>
                  <input
                    type="password"
                    placeholder={t.settings.proxyTokenPlaceholder}
                    value={authToken}
                    onChange={(e) => {
                      const val = e.target.value
                      setAuthTokenState(val)
                      setAuthToken(val)
                    }}
                    className="w-full bg-[#16191f] border border-[#2c3038] text-zinc-200 rounded-md px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="space-y-4 max-w-xl">
                {/* Header & Reset Button */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">{t.settings.shortcutsTitle}</h3>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{t.settings.shortcutsDesc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsResetConfirmOpen(true)}
                    className="px-2.5 py-1 rounded-md bg-zinc-800/80 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-300 text-xs font-medium transition-colors border border-zinc-700/60 hover:border-rose-800/60 cursor-pointer"
                  >
                    {t.settings.resetShortcutsBtn}
                  </button>
                </div>

                {/* Filter & Search Bar */}
                <div className="flex items-center gap-2 pt-1 pb-1">
                  {/* Category Pills */}
                  <div className="flex items-center bg-[#15181e] p-0.5 rounded-lg border border-[#272a31]">
                    <button
                      type="button"
                      onClick={() => setShortcutCategory('all')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        shortcutCategory === 'all'
                          ? 'bg-[#222731] text-white shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {t.settings.categoryAll}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShortcutCategory('general')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        shortcutCategory === 'general'
                          ? 'bg-[#222731] text-white shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {t.settings.categoryGeneral}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShortcutCategory('map')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        shortcutCategory === 'map'
                          ? 'bg-[#222731] text-cyan-300 shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {t.settings.categoryMap}
                    </button>
                  </div>

                  {/* Search Input */}
                  <div className="flex-1 relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      placeholder={t.settings.searchShortcutsPlaceholder}
                      value={shortcutSearch}
                      onChange={(e) => setShortcutSearch(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1 bg-[#15181e] border border-[#272a31] rounded-lg text-zinc-200 text-xs placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
                    />
                    {shortcutSearch && (
                      <button
                        type="button"
                        onClick={() => setShortcutSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-[10px]"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Shortcuts List */}
                <div className="space-y-2 max-h-[310px] overflow-y-auto pr-1">
                  {(
                    [
                      'zenMode',
                      'toggleSidebar',
                      'newSession',
                      'nextTab',
                      'prevTab',
                      'closeActiveTab',
                      'reopenClosedTab',
                      'focusSearch',
                      'sendMessage',
                      'newLine',
                      'toggleMap',
                      'openSettings',
                      'prevDialogue',
                      'nextDialogue',
                      'jumpToTop',
                      'jumpToBottom',
                      'mapUndo',
                      'mapRedo',
                      'mapFocus',
                      'mapCommentGroup',
                      'mapSelectAll',
                      'mapHome',
                      'mapRearrange',
                    ] as (keyof ShortcutsMap)[]
                  )
                    .filter((key) => {
                      const item = shortcuts[key]
                      if (!item) return false
                      const cat = item.category ?? 'general'
                      if (shortcutCategory !== 'all' && cat !== shortcutCategory) {
                        return false
                      }
                      if (shortcutSearch.trim()) {
                        const q = shortcutSearch.toLowerCase()
                        return (
                          item.description.toLowerCase().includes(q) ||
                          item.label.toLowerCase().includes(q) ||
                          key.toLowerCase().includes(q)
                        )
                      }
                      return true
                    })
                    .map((key) => {
                      const item = shortcuts[key]
                      if (!item) return null
                      const isRecording = recordingKey === key
                      const isMap = item.category === 'map'

                      return (
                        <div
                          key={key}
                          className={`flex items-center justify-between p-2.5 rounded-lg bg-[#16181e] border transition-colors ${
                            isRecording ? 'border-orange-500/80 bg-orange-950/20' : 'border-[#272a30]'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-200 font-medium text-xs">{item.description}</span>
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                                  isMap
                                    ? 'bg-cyan-950/80 text-cyan-400 border border-cyan-800/40'
                                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700/40'
                                }`}
                              >
                                {isMap ? t.settings.tagMap : t.settings.tagGlobal}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-500">
                              {key === 'zenMode' && (lang === 'zh-CN' ? '切换沉浸式全屏对话阅读模式 (F11 或 Esc 退出)' : 'Toggle immersive full-screen zen reading mode (F11 or Esc to exit)')}
                              {key === 'toggleSidebar' && (lang === 'zh-CN' ? '展开/收起左侧工程与会话列表边栏' : 'Toggle left project and session sidebar')}
                              {key === 'newSession' && (lang === 'zh-CN' ? '在当前激活的工程下开启全新对话会话' : 'Create a new conversation session in active project')}
                              {key === 'focusSearch' && (lang === 'zh-CN' ? '唤起 A1 标准悬浮会话全局搜索窗' : 'Open floating session search modal')}
                              {key === 'sendMessage' && (lang === 'zh-CN' ? '在提示词输入框中发送消息或触发执行' : 'Send message or submit prompt in input box')}
                              {key === 'newLine' && (lang === 'zh-CN' ? '在提示词输入框中插入换行符不发送' : 'Insert a newline without sending')}
                              {key === 'toggleMap' && (lang === 'zh-CN' ? '打开或关闭对话拓扑蓝图全屏悬浮地图' : 'Toggle conversation blueprint topology map')}
                              {key === 'openSettings' && (lang === 'zh-CN' ? '打开桌面端全局配置与快捷键面板' : 'Open settings and shortcut configuration')}
                              {key === 'mapUndo' && (lang === 'zh-CN' ? '撤销上一次卡片拖拽、布局或编辑操作' : 'Undo last card drag, layout, or edit on canvas')}
                              {key === 'mapRedo' && (lang === 'zh-CN' ? '重做撤销的历史变动' : 'Redo previously undone canvas action')}
                              {key === 'mapFocus' && (lang === 'zh-CN' ? '视野平滑聚焦至选中卡片或全景缩放适配' : 'Smoothly focus viewport on selected card or fit view')}
                              {key === 'mapCommentGroup' && (lang === 'zh-CN' ? '将当前选中的所有卡片包裹为蓝图注释气泡' : 'Wrap selected cards in a blueprint comment group')}
                              {key === 'mapSelectAll' && (lang === 'zh-CN' ? '选中当前蓝图画布上的全部会话卡片' : 'Select all session cards on the map canvas')}
                              {key === 'mapHome' && (lang === 'zh-CN' ? '平滑回到蓝图坐标系原点概览' : 'Smoothly return to coordinate origin overview')}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            {isRecording ? (
                              <span className="px-2.5 py-1 rounded bg-orange-600/30 border border-orange-500/60 text-xs font-mono text-orange-300 animate-pulse">
                                {t.settings.pressKeyPrompt}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setRecordingKey(key)}
                                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 text-xs font-mono text-zinc-300 hover:text-white shadow-xs transition-colors cursor-pointer"
                                title={t.settings.clickToRebind}
                              >
                                {item.label}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {activeTab === 'models' && (
              <div className="h-full flex flex-col -m-6">
                <ManageModelsContent
                  providers={providers}
                  showHeaderActions={false}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reusable Countdown Confirm Dialog for Destructive Reset Action */}
      <CountdownConfirmDialog
        isOpen={isResetConfirmOpen}
        title={t.settings.resetModalTitle}
        description={
          <div className="space-y-2">
            <p className="text-zinc-200">{t.settings.resetModalDesc1}</p>
            <p className="text-zinc-400 text-[11px]">
              {t.settings.resetModalDesc2}
            </p>
          </div>
        }
        confirmText={t.settings.resetModalConfirm}
        cancelText={t.common.cancel}
        countdownSeconds={2}
        isDestructive={true}
        onConfirm={() => {
          const def = resetShortcuts()
          setShortcuts(def)
        }}
        onClose={() => setIsResetConfirmOpen(false)}
      />
    </div>
  )
}
