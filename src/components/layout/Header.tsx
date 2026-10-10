import { useState, useEffect } from 'react'
import {
  X,
  Plus,
  PanelLeftClose,
  PanelLeft,
  Coins,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Loader2,
  Folder,
  BookmarkPlus,
  Network,
} from 'lucide-react'
import type { Message, Project, Session, SessionStatusPayload } from '../../types/opencode'
import { CopyExportButton } from '../chat/CopyExportButton'
import { useI18n } from '../../utils/i18n'
import { TabContextMenu } from './TabContextMenu'
import { RelayHubDropdown } from './RelayHubDropdown'
import { DaemonStatusDot } from './DaemonStatusDot'
import type { SettingsTab } from '../settings/SettingsModal'
import { resolveSessionProject } from '../../utils/session-workspace'
import { api } from '../../services/api'
import { TokenProgressRing } from './TokenProgressRing'
import {
  getTokenLimit,
  getTokenThreshold,
  getTokenColorClasses,
  formatTokenLimit,
  calculateOpenCodeContextUsage,
  type ModelProfilesData,
} from '../../utils/token-limit'

interface HeaderProps {
  projects?: Project[]
  sessions: Session[]
  openTabIds: string[]
  activeSessionId: string | null
  activeSession: Session | null
  sessionStatus: SessionStatusPayload
  /** False until the daemon run map answers. Hide idle and retry chrome. */
  runKnown?: boolean
  messages?: Message[]
  unreadSessionIds?: string[]
  onSelectTab: (sessionId: string) => void
  onCloseTab: (sessionId: string) => void
  onCloseOtherTabs?: (sessionId: string) => void
  onCloseTabsToRight?: (sessionId: string) => void
  onReopenClosedTab?: () => void
  canReopenClosedTab?: boolean
  onNewSession: () => void
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  onToggleMap?: () => void
  onOpenMapAndLocate?: (sessionId?: string) => void
  onAddSessionToMap?: (sessionId: string) => void
  onOpenSearch?: () => void
  onToggleZenMode?: () => void
  zenShortcutLabel?: string
  /** Returns full session JSON string for the active session */
  onGetSessionJson?: () => Promise<string>
  onUpdateSessionTitle?: (sessionId: string, newTitle: string) => void
  onShowInMap?: (sessionId: string) => void
  onOpenSettings?: (tab?: SettingsTab) => void
  onDaemonRestored?: () => void
  onDaemonLost?: () => void
}

function formatTokens(n: number | undefined): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

export function Header({
  projects = [],
  sessions,
  openTabIds,
  activeSessionId,
  activeSession,
  sessionStatus,
  runKnown = true,
  messages,
  unreadSessionIds,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onReopenClosedTab,
  canReopenClosedTab,
  onNewSession,
  isSidebarOpen,
  onToggleSidebar,
  onToggleMap,
  onOpenMapAndLocate,
  onAddSessionToMap,
  onGetSessionJson,
  onUpdateSessionTitle,
  onShowInMap,
  onOpenSettings,
  onDaemonRestored,
  onDaemonLost,
}: HeaderProps) {
  const { lang, t } = useI18n()
  const isZh = lang.startsWith('zh')
  const tokens = activeSession?.tokens

  const [contextMenu, setContextMenu] = useState<{
    tabId: string
    title: string
    x: number
    y: number
  } | null>(null)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  // 1. Dynamic Model Profile & Operational Context Ceiling
  // SSOT: C:\AICore\skills\OpenCodeDataControl\scripts\data\model_profiles.json
  const [modelProfiles, setModelProfiles] = useState<ModelProfilesData | null>(null)

  useEffect(() => {
    let isMounted = true
    api.getModelProfiles().then((res) => {
      if (isMounted && res && res.ok) {
        setModelProfiles(res)
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

  // Resolve current active model ID and context ceiling (Grok 4.7 strictly 500k)
  const currentModelId =
    activeSession?.model?.id ||
    'grok-4.7'

  const tokenLimit = getTokenLimit(currentModelId, modelProfiles)

  // Active window: largest prompt (input + cache) in the current user turn.
  // Turns after session.revert.messageID are excluded. session.tokens is the bill, shown separately.
  const revertMessageId = activeSession?.revert?.messageID
  const opencodeContext = calculateOpenCodeContextUsage(messages, tokenLimit, revertMessageId)
  const officialTokens = opencodeContext.total
  const contextPercent = opencodeContext.usagePercent
  const contextThreshold = getTokenThreshold(contextPercent)
  const tokenColors = getTokenColorClasses(contextThreshold)

  // 3. Calculate Cumulative Lifetime Billed Tokens B across all 5 dimensions
  // Formula: B = input + output + reasoning + cache.read + cache.write
  const billedTokens = tokens
    ? (tokens.input || 0) +
      (tokens.output || 0) +
      (tokens.reasoning || 0) +
      (tokens.cache?.read || 0) +
      (tokens.cache?.write || 0)
    : 0

  useEffect(() => {
    setEditingTabId(null)
  }, [activeSessionId])

  return (
    <header className="h-12 border-b border-[#24272b] bg-[#0f1115] flex items-center justify-between px-3 gap-3 select-none shrink-0">
      {/* Left: Sidebar Toggle, Daemon Live Status Dot & Multi-Session Tabs */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto no-scrollbar">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1d22] rounded transition-colors shrink-0"
          title={isSidebarOpen ? t.header.hideSidebar : t.header.showSidebar}
        >
          {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
        </button>

        {/* WSL Daemon Live Connection Status Dot with Exponential Backoff */}
        <DaemonStatusDot
          onRestored={onDaemonRestored}
          onLost={onDaemonLost}
          isZh={isZh}
        />

        {/* Tab Items */}
        <div
          onWheel={(e) => {
            if (e.deltaY !== 0 && e.currentTarget) {
              e.currentTarget.scrollLeft += e.deltaY
            }
          }}
          onDoubleClick={(e) => {
            if (e.target === e.currentTarget) {
              onNewSession()
            }
          }}
          className="flex items-center gap-1 overflow-x-auto no-scrollbar"
        >
          {openTabIds.map((tabId) => {
            const isDraft = tabId === '__draft__'
            const session = isDraft ? null : sessions.find((s) => s.id === tabId)
            const isActive = activeSessionId === tabId
            const rawTitle = isDraft ? null : (session?.title && session.title.trim())
            const title = isDraft
              ? (isZh ? '新会话' : 'New session')
              : (rawTitle || (isZh ? '正在加载…' : 'Loading…'))
            const projectBadge = session ? resolveSessionProject(session, projects) : null
            const tabBadge = isDraft ? '+' : (projectBadge?.abbreviation || 'OP')
            const isEditing = !isDraft && editingTabId === tabId
            const handleCommitTitle = () => {
              const trimmed = editingTitle.trim()
              if (trimmed && trimmed !== title) {
                onUpdateSessionTitle?.(tabId, trimmed)
              }
              setEditingTabId(null)
            }

            return (
              <div
                key={tabId}
                onClick={() => {
                  if (isActive && !isDraft) {
                    setEditingTabId(tabId)
                    setEditingTitle(title)
                  } else {
                    onSelectTab(tabId)
                  }
                }}
                onContextMenu={(e) => {
                  if (isDraft) return
                  e.preventDefault()
                  e.stopPropagation()
                  setContextMenu({
                    tabId,
                    title,
                    x: e.clientX,
                    y: e.clientY,
                  })
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                    e.stopPropagation()
                    onCloseTab(tabId)
                  }
                }}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                  }
                }}
                className={`group flex items-center gap-2 px-3 py-1.5 text-xs rounded-t-md cursor-pointer border-t-2 transition-all max-w-[200px] shrink-0 ${
                  isActive
                    ? 'bg-[#16181d] text-[#e6edf3] border-t-orange-500 font-medium border-x border-[#272a30]'
                    : 'bg-[#121418]/80 text-[#8b949e] border-t-transparent hover:bg-[#181b20] hover:text-[#c9d1d9] border-x border-[#1a1d24]'
                }`}
              >
                {/* Project / Folder 2-letter icon badge (e.g. OB, AP, AI) */}
                <span
                  className="min-w-[18px] h-3.5 px-0.5 shrink-0 rounded text-[9px] font-bold font-mono tracking-tight flex items-center justify-center select-none shadow-sm bg-amber-950/80 text-amber-400 border border-amber-800/40"
                  title={projectBadge ? (isZh ? `所属工程: ${projectBadge.name}` : `Project: ${projectBadge.name}`) : undefined}
                >
                  {tabBadge}
                </span>

                {/* Unread marker (blue dot) */}
                {!isDraft && Boolean(unreadSessionIds?.includes(tabId)) && (
                  <span
                    className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] ring-1 ring-blue-400/50 shrink-0 animate-pulse"
                    title={isZh ? '新消息未读' : 'Unread response'}
                  />
                )}

                {isEditing ? (
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing || e.keyCode === 229) return
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        e.stopPropagation()
                        handleCommitTitle()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        e.stopPropagation()
                        setEditingTabId(null)
                      }
                    }}
                    onBlur={handleCommitTitle}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    autoFocus
                    className="bg-[#0f1115] text-[#e6edf3] border border-orange-500/80 rounded px-1.5 py-0.5 text-xs outline-none flex-1 min-w-[70px] max-w-[140px] focus:ring-1 focus:ring-orange-500/50"
                  />
                ) : (
                  <span
                    className="truncate flex-1"
                    title={title}
                    onClick={(e) => {
                      if (isActive) {
                        e.stopPropagation()
                        setEditingTabId(tabId)
                        setEditingTitle(title)
                      }
                    }}
                  >
                    {title}
                  </span>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tabId)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 hover:bg-zinc-800 rounded transition-opacity"
                  title={isActive ? `${t.header.closeTab} (Ctrl+W)` : t.header.closeTab}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}

          <button
            onClick={onNewSession}
            className="p-1.5 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1d22] rounded transition-colors shrink-0"
            title={t.header.newTab}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right: Streamlined Utility Cluster (Tokens, Session Copy, Status, Security) */}
      <div className="relative z-10 flex items-center gap-2 shrink-0">
        {/* Working Directory Chip */}
        {activeSession?.directory && (
          <div
            className="hidden xl:flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#14161a] border border-[#23272e] text-[11px] text-zinc-400 font-mono select-none"
            title={`${t.header.workspaceDir}: ${activeSession.directory}`}
          >
            <Folder className="w-3 h-3 text-zinc-500 shrink-0" />
            <span className="max-w-[120px] truncate">{activeSession.directory.split('/').filter(Boolean).pop()}</span>
          </div>
        )}

        {/* Compact Official Token Stats Badge with Hover Breakdown Card */}
        {(officialTokens > 0 || tokens) && (
          <div className="relative group/tokens shrink-0">
            <div
              tabIndex={0}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#14161c] hover:bg-[#1c1f26] border border-[#272a31] hover:border-zinc-600/70 text-[11px] font-mono text-zinc-300 hover:text-white transition-all cursor-pointer select-none shadow-sm"
              title={`${isZh ? '当前窗口（回退去掉边界后的轮次，不退账单）' : 'Context window (revert drops later turns, not the bill)'}: ${officialTokens.toLocaleString()} / ${formatTokenLimit(tokenLimit)} (${contextPercent}%)`}
            >
              <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <TokenProgressRing
                percent={contextPercent}
                threshold={contextThreshold}
                title={`${isZh ? '官方当前轮使用率' : 'Active window usage'}: ${contextPercent}% (${formatTokens(officialTokens)} / ${formatTokenLimit(tokenLimit)})`}
              />
              <div className="flex items-center gap-1">
                <span className="text-zinc-400 text-[10px]">{isZh ? '窗口' : 'Tokens'}</span>
                <span className="text-sky-300 font-semibold">{formatTokens(officialTokens)}</span>
                <span className="text-zinc-500 font-normal">/</span>
                <span className={`${tokenColors.badgeText} font-medium`}>{formatTokenLimit(tokenLimit)}</span>
                <span className="text-zinc-500 text-[10px]">({contextPercent}%)</span>
              </div>
            </div>

            {/* Floating Breakdown Card on Hover */}
            <div className="pointer-events-none absolute right-0 top-full mt-1.5 z-50 w-72 rounded-xl border border-[#2a2e38] bg-[#12141a]/95 backdrop-blur-md p-3.5 shadow-2xl opacity-0 translate-y-1 group-hover/tokens:opacity-100 group-hover/tokens:translate-y-0 group-hover/tokens:pointer-events-auto transition-all duration-200 text-xs">
              <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-zinc-800/80">
                <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  {isZh ? 'Token（窗口 / 历史账单）' : t.header.tokenBreakdownTitle}
                </span>
                <span className="text-[10px] font-mono text-sky-300/90 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded">
                  {officialTokens.toLocaleString()} ({contextPercent}%)
                </span>
              </div>

              {/* Account 1: Active Context Window W (OpenCode Official) */}
              <div className="mb-2.5">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-semibold text-sky-400 flex items-center gap-1.5">
                    <TokenProgressRing
                      percent={contextPercent}
                      threshold={contextThreshold}
                      size={13}
                    />
                    <span>{t.header.tokenActiveContext}</span>
                  </span>
                  <span className={`font-mono font-bold ${tokenColors.badgeText} ${tokenColors.badgeBg} border ${tokenColors.badgeBorder} px-1.5 py-0.5 rounded text-[10px]`}>
                    {formatTokens(officialTokens)} / {formatTokenLimit(tokenLimit)} ({contextPercent}%)
                  </span>
                </div>
                {/* Horizontal progress bar with dynamic threshold color */}
                <div className="w-full h-1 bg-zinc-800/80 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full transition-all duration-300 ${tokenColors.bg}`}
                    style={{ width: `${Math.min(Math.max(contextPercent, 0), 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1.5 leading-tight">
                  <span>{t.header.tokenContextDesc}</span>
                  <span className="font-mono text-zinc-400 shrink-0 ml-1">
                    {isZh ? '上限' : 'Limit'}: {formatTokenLimit(tokenLimit)}
                  </span>
                </div>
                {officialTokens > 0 ? (
                  <div className="space-y-1 font-mono text-[10px] bg-zinc-900/60 rounded-lg p-2 border border-zinc-800/50">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>{t.header.tokenPrompt}</span>
                      <span className="text-zinc-200">{opencodeContext.input.toLocaleString()}</span>
                    </div>
                    {opencodeContext.output > 0 && (
                      <div className="flex items-center justify-between text-zinc-400">
                        <span>{t.header.tokenCompletion}</span>
                        <span className="text-zinc-200">{opencodeContext.output.toLocaleString()}</span>
                      </div>
                    )}
                    {opencodeContext.reasoning > 0 && (
                      <div className="flex items-center justify-between text-purple-400/90">
                        <span>{isZh ? '思考推理' : 'Reasoning'}</span>
                        <span className="font-semibold">{opencodeContext.reasoning.toLocaleString()}</span>
                      </div>
                    )}
                    {opencodeContext.cacheRead > 0 && (
                      <div className="flex items-center justify-between text-emerald-400/90">
                        <span>{t.header.tokenCacheRead}</span>
                        <span className="font-semibold">{opencodeContext.cacheRead.toLocaleString()}</span>
                      </div>
                    )}
                    {opencodeContext.cacheWrite > 0 && (
                      <div className="flex items-center justify-between text-sky-400/90">
                        <span>{t.header.tokenCacheWrite}</span>
                        <span className="font-semibold">{opencodeContext.cacheWrite.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-zinc-500 italic px-1">
                    {isZh ? '等待首轮助手回复...' : 'Awaiting first assistant reply...'}
                  </div>
                )}
              </div>

              {/* Account 2: Cumulative Billed Tokens B */}
              {tokens && (
                <div className="pt-2 border-t border-zinc-800/80">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold text-zinc-300">
                      {t.header.tokenBilledTotal}
                    </span>
                    <span className="font-mono font-bold text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[10px]">
                      {formatTokens(billedTokens)}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mb-1.5 leading-tight">
                    {t.header.tokenBilledDesc}
                  </p>
                  <div className="space-y-1 font-mono text-[10px] bg-zinc-900/60 rounded-lg p-2 border border-zinc-800/50">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>{t.header.tokenPrompt}</span>
                      <span className="text-zinc-200 font-semibold">{formatTokens(tokens.input)}</span>
                    </div>
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>{t.header.tokenCompletion}</span>
                      <span className="text-zinc-200 font-semibold">{formatTokens(tokens.output)}</span>
                    </div>
                    {(tokens.reasoning || 0) > 0 && (
                      <div className="flex items-center justify-between text-purple-400/90">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          {t.header.tokensReasoning}
                        </span>
                        <span className="font-semibold">{formatTokens(tokens.reasoning)}</span>
                      </div>
                    )}
                    {(tokens.cache?.read || 0) > 0 && (
                      <div className="flex items-center justify-between text-emerald-400/90">
                        <span>{t.header.tokenCacheRead}</span>
                        <span className="font-semibold">{formatTokens(tokens.cache?.read)}</span>
                      </div>
                    )}
                    {(tokens.cache?.write || 0) > 0 && (
                      <div className="flex items-center justify-between text-sky-400/90">
                        <span>{t.header.tokenCacheWrite}</span>
                        <span className="font-semibold">{formatTokens(tokens.cache?.write)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeSession?.directory && (
                <div className="mt-2.5 pt-2 border-t border-zinc-800/80 text-[10px] text-zinc-400 truncate">
                  <span className="text-zinc-500">{t.header.workspaceDir}: </span>
                  <span className="text-zinc-300 font-mono" title={activeSession.directory}>
                    {activeSession.directory.split('/').filter(Boolean).pop() || activeSession.directory}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Silent Add to Map Button (Alt+M) */}
        {activeSessionId && onAddSessionToMap && (
          <button
            onClick={() => onAddSessionToMap(activeSessionId)}
            className="p-1.5 text-zinc-400 hover:text-amber-400 hover:bg-[#1a1d22] rounded transition-colors shrink-0"
            title="放入蓝图地图 (Alt+M)"
            aria-label="放入蓝图地图 (Alt+M)"
          >
            <BookmarkPlus className="w-4 h-4" />
          </button>
        )}

        {/* Open Map & Locate Active Session Button (Ctrl+M) */}
        {onOpenMapAndLocate && (
          <button
            onClick={() => onOpenMapAndLocate(activeSessionId || undefined)}
            className="p-1.5 text-zinc-400 hover:text-sky-400 hover:bg-[#1a1d22] rounded transition-colors shrink-0"
            title="在蓝图地图中定位当前会话 (Ctrl+M)"
            aria-label="在蓝图地图中定位当前会话 (Ctrl+M)"
          >
            <Network className="w-4 h-4" />
          </button>
        )}

        {/* Compact Session Copy / Export Button */}
        {onGetSessionJson && (
          <CopyExportButton
            getSessionJson={onGetSessionJson}
            sessionId={activeSessionId}
            compact
          />
        )}

        {/* Real-Time Relay Quota & Billing Hub Capsule (中转站额度与账单监视器) */}
        <RelayHubDropdown onOpenSettings={() => onOpenSettings?.('relays')} />

        {/* Realtime Ambient Status Indicator with Instant Tooltip */}
        <div className="relative group/status flex items-center shrink-0">
          {!runKnown ? (
            <div
              tabIndex={0}
              className="flex items-center gap-1.5 px-2 py-1 text-zinc-400 rounded-md"
              aria-label={t.header.confirming}
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
              <span className="hidden sm:inline text-[11px]">{t.header.confirming}</span>
            </div>
          ) : sessionStatus.type === 'busy' ? (
            <div
              tabIndex={0}
              className="flex items-center justify-center p-1.5 text-purple-400 hover:text-purple-300 rounded-md transition-colors cursor-default"
              aria-label={t.header.generating}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
              </span>
            </div>
          ) : sessionStatus.type === 'retry' ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300 font-medium">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">{t.header.retrying(sessionStatus.attempt || 1)}</span>
            </div>
          ) : (
            <div
              tabIndex={0}
              className="flex items-center justify-center p-1.5 text-zinc-500 hover:text-emerald-400 rounded-md transition-colors cursor-default"
              aria-label={`${t.header.idle} · ${t.header.backendReady} (127.0.0.1)`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-25" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500/80" />
              </span>
            </div>
          )}

          {/* Immediate floating tooltip on hover for ambient status */}
          <div className="pointer-events-none absolute right-0 top-full mt-1.5 z-50 whitespace-nowrap rounded-md bg-[#12141a]/95 backdrop-blur-md border border-[#2a2e38] px-2 py-1 text-[11px] font-medium text-zinc-200 shadow-xl opacity-0 translate-y-1 group-hover/status:opacity-100 group-hover/status:translate-y-0 transition-all duration-150">
            {!runKnown
              ? t.header.confirming
              : sessionStatus.type === 'busy'
              ? t.header.generating
              : sessionStatus.type === 'retry'
                ? t.header.retrying(sessionStatus.attempt || 1)
                : `${t.header.idle} · ${t.header.backendReady} (127.0.0.1)`}
          </div>
        </div>

        {/* Loopback Security Indicator (Persistent faint ShieldCheck, overlay chip on hover/focus) */}
        <div
          tabIndex={0}
          aria-label={t.header.securityBoundary}
          title={t.header.securityBoundary}
          className="group/sec relative flex shrink-0 items-center rounded px-1.5 py-1 opacity-70 [@media(hover:hover)]:opacity-40 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none cursor-default motion-reduce:transition-none transition-opacity duration-200"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 group-hover/sec:opacity-0 transition-opacity" aria-hidden="true" />
          <div
            className="pointer-events-none absolute right-0 top-1/2 z-20 flex items-center gap-1.5 whitespace-nowrap rounded bg-[#16181e] border border-[#272a31] px-2 py-1 font-mono text-[10px] text-zinc-400 opacity-0 -translate-y-1/2 shadow-lg transition-all duration-200 motion-reduce:transition-none group-hover/sec:opacity-100 group-focus-visible/sec:opacity-100"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>127.0.0.1</span>
          </div>
        </div>
      </div>

      {/* Tab Right-Click Context Menu */}
      {contextMenu && (
        <TabContextMenu
          tabId={contextMenu.tabId}
          sessionTitle={contextMenu.title}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCloseTab={onCloseTab}
          onCloseOtherTabs={onCloseOtherTabs || (() => {})}
          onCloseTabsToRight={onCloseTabsToRight || (() => {})}
          onReopenClosedTab={onReopenClosedTab || (() => {})}
          canReopen={Boolean(canReopenClosedTab)}
          onRename={(targetId) => {
            const target = sessions.find((s) => s.id === targetId)
            setEditingTabId(targetId)
            setEditingTitle(target?.title || '')
          }}
          onShowInMap={() => {
            if (onShowInMap) {
              onShowInMap(contextMenu.tabId)
            } else if (onToggleMap) {
              onToggleMap()
            }
          }}
        />
      )}
    </header>
  )
}
