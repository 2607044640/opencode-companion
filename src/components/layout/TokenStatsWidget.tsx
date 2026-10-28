import React, { useState, useEffect, useRef } from 'react'
import { Coins, Sparkles } from 'lucide-react'
import type { Message, Session } from '../../types/opencode'
import { useI18n } from '../../utils/i18n'
import { TokenProgressRing } from './TokenProgressRing'
import {
  getTokenLimit,
  getTokenThreshold,
  getTokenColorClasses,
  formatTokenLimit,
  calculateOpenCodeContextUsage,
  type ModelProfilesData,
} from '../../utils/token-limit'

interface TokenStatsWidgetProps {
  activeSession?: Session | null
  messages?: Message[]
  compact?: boolean
  popoverPlacement?: 'right' | 'top' | 'bottom'
}

function formatTokens(n: number | undefined): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

export function TokenStatsWidget({
  activeSession,
  messages = [],
  compact = false,
  popoverPlacement = 'right',
}: TokenStatsWidgetProps) {
  const { lang, t } = useI18n()
  const isZh = lang.startsWith('zh')
  const tokens = activeSession?.tokens
  const [modelProfiles, setModelProfiles] = useState<ModelProfilesData | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let isMounted = true
    const fetchProfiles = async () => {
      try {
        const res = await fetch('/api/model-profiles')
        if (res.ok && isMounted) {
          const data = (await res.json()) as ModelProfilesData
          setModelProfiles(data)
        }
      } catch {}
    }
    fetchProfiles()
    return () => {
      isMounted = false
    }
  }, [])

  // Resolve current active model ID and context ceiling
  const currentModelId = activeSession?.model?.id || 'gpt-6.1-sol'
  const tokenLimit = getTokenLimit(currentModelId, modelProfiles)

  // Active window calculations
  const revertMessageId = activeSession?.revert?.messageID
  const opencodeContext = calculateOpenCodeContextUsage(messages, tokenLimit, revertMessageId)
  const officialTokens = opencodeContext.total
  const contextPercent = opencodeContext.usagePercent
  const contextThreshold = getTokenThreshold(contextPercent)
  const tokenColors = getTokenColorClasses(contextThreshold)

  const billedTokens = tokens
    ? (tokens.input || 0) +
      (tokens.output || 0) +
      (tokens.reasoning || 0) +
      (tokens.cache?.read || 0) +
      (tokens.cache?.write || 0)
    : 0

  // Close on outside click if opened by click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  const tooltipTitle = `${isZh ? '当前窗口' : 'Context window'}: ${officialTokens.toLocaleString()} / ${formatTokenLimit(tokenLimit)} (${contextPercent}%)`

  const popoverStyle: React.CSSProperties =
    popoverPlacement === 'right'
      ? { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '10px' }
      : popoverPlacement === 'top'
      ? { bottom: '100%', left: '0', marginBottom: '8px' }
      : { top: '100%', left: '0', marginTop: '8px' }

  return (
    <div
      ref={containerRef}
      className="relative group/tokens shrink-0"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {compact ? (
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer select-none ${
            isOpen
              ? 'bg-[#1e222a] border border-zinc-500 shadow-md'
              : 'bg-[#14161c] hover:bg-[#1c1f26] border border-[#272a31] hover:border-zinc-600'
          }`}
          title={tooltipTitle}
          aria-label={tooltipTitle}
        >
          <div className="relative flex items-center justify-center">
            <TokenProgressRing
              percent={contextPercent}
              threshold={contextThreshold}
              size={26}
              showPercentText
              title={tooltipTitle}
            />
          </div>
        </button>
      ) : (
        <div
          tabIndex={0}
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#14161c] hover:bg-[#1c1f26] border border-[#272a31] hover:border-zinc-600/70 text-[11px] font-mono text-zinc-300 hover:text-white transition-all cursor-pointer select-none shadow-sm"
          title={tooltipTitle}
        >
          <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <TokenProgressRing
            percent={contextPercent}
            threshold={contextThreshold}
            title={`${isZh ? '官方当前轮使用率' : 'Active window usage'}: ${contextPercent}% (${formatTokens(officialTokens)} / ${formatTokenLimit(tokenLimit)})`}
          />
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-zinc-400 text-[10px] shrink-0">{isZh ? '窗口' : 'Tokens'}</span>
            <span className="text-sky-300 font-semibold truncate">{formatTokens(officialTokens)}</span>
            <span className="text-zinc-500 font-normal">/</span>
            <span className={`${tokenColors.badgeText} font-medium shrink-0`}>
              {formatTokenLimit(tokenLimit)}
            </span>
            <span className="text-zinc-500 text-[10px] shrink-0">({contextPercent}%)</span>
          </div>
        </div>
      )}

      {/* Floating Breakdown Card */}
      {isOpen && (
        <div
          style={popoverStyle}
          className="absolute z-50 w-72 rounded-xl border border-[#2a2e38] bg-[#12141a]/98 backdrop-blur-md p-3.5 shadow-2xl text-xs select-none animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-zinc-800/80">
            <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              {isZh ? 'Token（窗口 / 历史账单）' : t.header.tokenBreakdownTitle}
            </span>
            <span className="text-[10px] font-mono text-sky-300/90 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded">
              {officialTokens.toLocaleString()} ({contextPercent}%)
            </span>
          </div>

          {/* Account 1: Active Context Window W */}
          <div className="mb-2.5">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-semibold text-sky-400 flex items-center gap-1.5">
                <TokenProgressRing percent={contextPercent} threshold={contextThreshold} size={13} />
                <span>{t.header.tokenActiveContext}</span>
              </span>
              <span
                className={`font-mono font-bold ${tokenColors.badgeText} ${tokenColors.badgeBg} border ${tokenColors.badgeBorder} px-1.5 py-0.5 rounded text-[10px]`}
              >
                {formatTokens(officialTokens)} / {formatTokenLimit(tokenLimit)} ({contextPercent}%)
              </span>
            </div>

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
                <span className="font-semibold text-zinc-300">{t.header.tokenBilledTotal}</span>
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
      )}
    </div>
  )
}
