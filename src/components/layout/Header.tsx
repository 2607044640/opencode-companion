import {
  X,
  Plus,
  PanelLeftClose,
  PanelLeft,
  Coins,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ShieldCheck,
  Network,
  Search,
  Maximize2,
} from 'lucide-react'
import type { Session, SessionStatusPayload } from '../../types/opencode'
import { CopyExportButton } from '../chat/CopyExportButton'
import { RevertButton } from '../chat/RevertDialog'

interface HeaderProps {
  sessions: Session[]
  openTabIds: string[]
  activeSessionId: string | null
  activeSession: Session | null
  sessionStatus: SessionStatusPayload
  onSelectTab: (sessionId: string) => void
  onCloseTab: (sessionId: string) => void
  onNewSession: () => void
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  onToggleMap?: () => void
  onOpenSearch?: () => void
  onToggleZenMode?: () => void
  zenShortcutLabel?: string
  /** Returns full session JSON string for the active session */
  onGetSessionJson?: () => Promise<string>
  /** Open revert dialog */
  onRevert?: () => void
  /** Whether there are messages to revert */
  hasMessages?: boolean
}



function formatTokens(n: number | undefined): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

export function Header({
  sessions,
  openTabIds,
  activeSessionId,
  activeSession,
  sessionStatus,
  onSelectTab,
  onCloseTab,
  onNewSession,
  isSidebarOpen,
  onToggleSidebar,
  onToggleMap,
  onOpenSearch,
  onToggleZenMode,
  zenShortcutLabel = 'F11',
  onGetSessionJson,
  onRevert,
  hasMessages = false,
}: HeaderProps) {
  const tokens = activeSession?.tokens

  return (
    <header className="h-12 border-b border-[#24272b] bg-[#0f1115] flex items-center justify-between px-3 gap-3 select-none shrink-0">
      {/* Left: Sidebar Toggle & Multi-Session Tabs */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto no-scrollbar">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1d22] rounded transition-colors shrink-0"
          title={isSidebarOpen ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'}
        >
          {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
        </button>

        {/* Dedicated Dialogue Map Button */}
        {onToggleMap && (
          <button
            onClick={onToggleMap}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 border border-amber-800/40 rounded transition-all shrink-0 active:scale-95"
            title="打开会话白板地图 (Ctrl+M)"
          >
            <Network className="w-3.5 h-3.5 text-orange-400" />
            <span className="hidden sm:inline">地图</span>
          </button>
        )}

        {/* Dedicated Dialogue Search Button */}
        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-zinc-300 hover:text-white hover:bg-[#1a1d22] border border-[#272a31] rounded transition-all shrink-0 active:scale-95"
            title="搜索会话 (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">搜索</span>
            <kbd className="hidden md:inline px-1 py-px text-[9px] font-mono text-zinc-400 bg-zinc-800 border border-zinc-700/60 rounded">
              Ctrl+K
            </kbd>
          </button>
        )}

        {/* Dedicated Immersive Zen Reading Mode Button */}
        {onToggleZenMode && (
          <button
            onClick={onToggleZenMode}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-purple-300 hover:text-purple-200 hover:bg-purple-950/40 border border-purple-800/40 rounded transition-all shrink-0 active:scale-95"
            title={`沉浸全屏阅读 (${zenShortcutLabel})`}
          >
            <Maximize2 className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">沉浸阅读</span>
            <kbd className="hidden md:inline px-1 py-px text-[9px] font-mono text-purple-300/70 bg-purple-950/60 border border-purple-800/60 rounded">
              {zenShortcutLabel}
            </kbd>
          </button>
        )}

        {/* Copy All / Export JSON Button */}
        {onGetSessionJson && (
          <CopyExportButton
            getSessionJson={onGetSessionJson}
            sessionId={activeSessionId}
          />
        )}

        {/* Revert Last Exchange Button */}
        {onRevert && (
          <RevertButton
            hasMessages={hasMessages}
            onRevert={onRevert}
          />
        )}

        {/* Tab Items */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {openTabIds.map((tabId) => {
            const session = sessions.find((s) => s.id === tabId)
            const isActive = activeSessionId === tabId
            const title = session?.title || 'New session'
            const agentInitial = ((session?.agent || 'A').charAt(0) || 'A').toUpperCase()

            return (
              <div
                key={tabId}
                onClick={() => onSelectTab(tabId)}
                className={`group flex items-center gap-2 px-3 py-1.5 text-xs rounded-t-md cursor-pointer border-t-2 transition-all max-w-[200px] shrink-0 ${
                  isActive
                    ? 'bg-[#16181d] text-[#e6edf3] border-t-orange-500 font-medium border-x border-[#272a30]'
                    : 'bg-[#0f1115] text-[#8b949e] border-t-transparent hover:bg-[#14161a] hover:text-[#c9d1d9]'
                }`}
              >
                {/* Agent Icon badge */}
                <span className="w-3.5 h-3.5 shrink-0 rounded text-[9px] font-bold flex items-center justify-center bg-amber-950/80 text-amber-400 border border-amber-800/40">
                  {agentInitial}
                </span>

                <span className="truncate flex-1" title={title}>
                  {title}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tabId)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 hover:bg-zinc-800 rounded transition-opacity"
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}

          <button
            onClick={onNewSession}
            className="p-1.5 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1d22] rounded transition-colors shrink-0"
            title="Open new tab session"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right: Token Stats Dashboard, Status Indicator & Desktop Deep-Link */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Token Stats Dashboard */}
        {tokens && (
          <div className="hidden md:flex items-center gap-2.5 px-2.5 py-1 rounded bg-[#16181e] border border-[#272a31] text-[11px] font-mono text-[#8b949e]">
            <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span title="Prompt input tokens">
              In: <strong className="text-zinc-200">{formatTokens(tokens.input)}</strong>
            </span>
            <span className="text-zinc-600">|</span>
            <span title="Generated output tokens">
              Out: <strong className="text-zinc-200">{formatTokens(tokens.output)}</strong>
            </span>
            {tokens.reasoning > 0 && (
              <>
                <span className="text-zinc-600">|</span>
                <span title="Reasoning tokens" className="flex items-center gap-1 text-purple-400">
                  <Sparkles className="w-2.5 h-2.5" />
                  <strong>{formatTokens(tokens.reasoning)}</strong>
                </span>
              </>
            )}
            {tokens.cache?.read > 0 && (
              <>
                <span className="text-zinc-600">|</span>
                <span title="Cache read tokens" className="text-emerald-400">
                  Cache: <strong>{formatTokens(tokens.cache.read)}</strong>
                </span>
              </>
            )}
          </div>
        )}

        {/* Realtime Status Indicator */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#16181e] border border-[#272a31] text-xs">
          {sessionStatus.type === 'busy' ? (
            <span className="flex items-center gap-1.5 text-purple-400 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline">Generating...</span>
            </span>
          ) : sessionStatus.type === 'retry' ? (
            <span className="flex items-center gap-1.5 text-amber-400 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Retrying ({sessionStatus.attempt || 1})</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              <span className="hidden sm:inline text-[#8b949e]">Idle</span>
            </span>
          )}
        </div>

        {/* Loopback Security Indicator */}
        <div
          className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded bg-[#16181e] border border-[#272a31] text-xs font-mono text-zinc-400"
          title="Security Boundary: Strictly bound to 127.0.0.1 (WSL2 daemon zero-auth protected)"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] text-zinc-400">127.0.0.1</span>
        </div>
      </div>
    </header>
  )
}
