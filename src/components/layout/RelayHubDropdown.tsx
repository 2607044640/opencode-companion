import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Coins,
  RefreshCw,
  Settings,
  ExternalLink,
  Plus,
  AlertCircle,
  LineChart,
} from 'lucide-react'
import {
  getRelayProviders,
  updateRelayProvider,
  fetchRelayQuota,
  syncRelayPresets,
  aggregateBalances,
  formatBalance,
  DEFAULT_REFRESH_INTERVAL_MS,
  type RelayProvider,
} from '../../utils/relay-billing'
import { recordRelaySnapshot } from '../../utils/relay-history'
import { usePreferences } from '../../utils/preferences'
import { formatTimeAgo } from '../../utils/time'
import { RelayCostAnalyticsModal } from './RelayCostAnalyticsModal'

interface RelayHubDropdownProps {
  onOpenSettings?: () => void
  compact?: boolean
  popoverPlacement?: 'right' | 'top' | 'bottom'
}

export const RelayHubDropdown: React.FC<RelayHubDropdownProps> = ({
  onOpenSettings,
  compact = false,
  popoverPlacement = 'bottom',
}) => {
  const { prefs } = usePreferences()
  const autoRefreshRelayQuota = Boolean(prefs.autoRefreshRelayQuota)
  const [providers, setProviders] = useState<RelayProvider[]>(() => getRelayProviders())
  const [isOpen, setIsOpen] = useState(false)
  const [isRefreshingAll, setIsRefreshingAll] = useState(false)
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false)
  const [floatingDelta, setFloatingDelta] = useState<{ id: number; text: string } | null>(null)
  const deltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPinnedRef = useRef(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return () => {
      if (deltaTimerRef.current) clearTimeout(deltaTimerRef.current)
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  // Listen for storage changes from settings modal
  const reloadProviders = useCallback(() => {
    setProviders(getRelayProviders())
  }, [])

  // Hover grace period management (prevents popover disappearing when moving mouse to top-right buttons)
  const handleMouseEnter = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    reloadProviders()
    setIsOpen(true)
  }, [reloadProviders])

  const handleMouseLeave = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
    }
    closeTimerRef.current = setTimeout(() => {
      if (!isPinnedRef.current) {
        setIsOpen(false)
      }
    }, 350)
  }, [])

  // Auto-sync presets on mount: ensures any new gateway channels (e.g. 稳定中转 Flash 3.7) are auto-imported
  useEffect(() => {
    let mounted = true
    const initPresets = async () => {
      const synced = await syncRelayPresets()
      if (!mounted) return
      setProviders(synced)

      // Auto-fetch balance on mount only when auto-refresh is explicitly enabled in preferences
      const now = Date.now()
      if (autoRefreshRelayQuota) {
        const needsFetch = synced.filter((p) => p.apiKey && (!p.lastUpdated || now - p.lastUpdated >= DEFAULT_REFRESH_INTERVAL_MS))
        if (needsFetch.length > 0) {
          for (const p of needsFetch) {
            fetchRelayQuota(p).then((res) => {
              if (!mounted) return
              if (res.ok) {
                updateRelayProvider(p.id, {
                  balance: res.balance,
                  totalQuota: res.totalQuota,
                  usedQuota: res.usedQuota,
                  isUnmetered: res.isUnmetered,
                  note: res.note,
                  status: 'ok',
                  error: undefined,
                  lastUpdated: Date.now(),
                })
              } else {
                updateRelayProvider(p.id, {
                  status: 'error',
                  error: res.error || 'Fetch failed',
                })
              }
              if (mounted) reloadProviders()
            })
          }
        }
      }
    }
    initPresets()
    return () => {
      mounted = false
    }
  }, [reloadProviders])

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'opencode_relay_providers') {
        reloadProviders()
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [reloadProviders])

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        isPinnedRef.current = false
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Refresh single provider
  const refreshProvider = async (provider: RelayProvider) => {
    updateRelayProvider(provider.id, { status: 'loading' })
    reloadProviders()

    try {
      const res = await fetchRelayQuota(provider)
      if (res.ok) {
        updateRelayProvider(provider.id, {
          balance: res.balance,
          totalQuota: res.totalQuota,
          usedQuota: res.usedQuota,
          isUnmetered: res.isUnmetered,
          note: res.note,
          status: 'ok',
          error: undefined,
          lastUpdated: Date.now(),
        })
      } else {
        updateRelayProvider(provider.id, {
          status: 'error',
          error: res.error || 'Fetch failed',
        })
      }
    } catch (err) {
      updateRelayProvider(provider.id, {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      reloadProviders()
    }
  }

  // Refresh all providers concurrently and record snapshot
  const refreshAll = useCallback(
    async (
      customList?: RelayProvider[],
      trigger: 'manual_click' | 'auto_interval' = 'auto_interval'
    ) => {
      const list = customList ?? getRelayProviders()
      if (list.length === 0) return null
      setIsRefreshingAll(true)

      // Mark all loading
      for (const p of list) {
        updateRelayProvider(p.id, { status: 'loading' })
      }
      reloadProviders()

      await Promise.allSettled(
        list.map(async (p) => {
          try {
            const res = await fetchRelayQuota(p)
            if (res.ok) {
              updateRelayProvider(p.id, {
                balance: res.balance,
                totalQuota: res.totalQuota,
                usedQuota: res.usedQuota,
                isUnmetered: res.isUnmetered,
                note: res.note,
                status: 'ok',
                error: undefined,
                lastUpdated: Date.now(),
              })
            } else {
              updateRelayProvider(p.id, {
                status: 'error',
                error: res.error || 'Fetch failed',
              })
            }
          } catch (err) {
            updateRelayProvider(p.id, {
              status: 'error',
              error: err instanceof Error ? err.message : String(err),
            })
          }
        })
      )

      const updated = getRelayProviders()
      reloadProviders()
      setIsRefreshingAll(false)

      // Record snapshot and return delta
      const snapResult = recordRelaySnapshot(updated, trigger)
      return snapResult
    },
    [reloadProviders]
  )

  // Triggered on clicking the coin icon: refreshes and plays 2-second light blue floating animation
  const handleCoinClick = async () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    reloadProviders()
    setIsOpen((prev) => {
      const next = !prev
      isPinnedRef.current = next
      return next
    })

    try {
      const snapResult = await refreshAll(undefined, 'manual_click')
      if (snapResult && snapResult.deltaFormatted) {
        setFloatingDelta({ id: Date.now(), text: snapResult.deltaFormatted })
        if (deltaTimerRef.current) clearTimeout(deltaTimerRef.current)
        deltaTimerRef.current = setTimeout(() => {
          setFloatingDelta(null)
        }, 2000)
      }
    } catch {
      // ignore
    }
  }

  // 10-minute auto refresh interval (runs strictly when enabled in preferences, app is open, and tab is visible)
  useEffect(() => {
    if (!autoRefreshRelayQuota) {
      return
    }

    let timer: ReturnType<typeof setInterval> | null = null

    const scheduleTimer = () => {
      if (timer) clearInterval(timer)
      timer = setInterval(() => {
        // Guard: only refresh if software is currently open and tab is visible
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          refreshAll()
        }
      }, DEFAULT_REFRESH_INTERVAL_MS)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible: check if oldest provider was updated >= 10 minutes ago
        const current = getRelayProviders()
        if (current.length > 0) {
          const oldest = Math.min(...current.map((p) => p.lastUpdated || 0))
          if (Date.now() - oldest >= DEFAULT_REFRESH_INTERVAL_MS) {
            refreshAll(current)
          }
        }
        scheduleTimer()
      } else {
        // Tab is hidden / software inactive: stop interval so no phantom / midnight queries run
        if (timer) {
          clearInterval(timer)
          timer = null
        }
      }
    }

    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      scheduleTimer()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refreshAll, autoRefreshRelayQuota])

  const summary = aggregateBalances(providers)

  // Format relative timestamp using unified time utility
  const formatTime = (ts?: number) => {
    return formatTimeAgo(ts, undefined, { fallback: '未更新' })
  }

  const popoverStyle: React.CSSProperties =
    popoverPlacement === 'right'
      ? { left: '100%', bottom: '0', marginLeft: '10px' }
      : popoverPlacement === 'top'
      ? { bottom: '100%', left: '0', marginBottom: '8px' }
      : { top: '100%', right: '0', marginTop: '8px' }

  return (
    <div
      className="relative shrink-0"
      ref={dropdownRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 2-Second Floating Delta Cost Animation Badge (浅蓝色扣费浮现动画) */}
      {floatingDelta && (
        <div
          key={floatingDelta.id}
          className={`pointer-events-none absolute z-[70] whitespace-nowrap px-2 py-0.5 rounded-full bg-[#0d111a]/95 border border-sky-400/80 text-sky-300 font-mono font-bold text-[11px] shadow-[0_0_16px_rgba(56,189,248,0.65)] select-none ${
            compact || popoverPlacement === 'right'
              ? 'left-full ml-3 bottom-1.5 animate-relay-cost-float-right'
              : '-top-6 left-1/2 -translate-x-1/2 animate-relay-cost-float'
          }`}
        >
          {floatingDelta.text}
        </div>
      )}

      {compact ? (
        <button
          type="button"
          onClick={handleCoinClick}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer select-none relative ${
            isOpen
              ? 'bg-[#1e222a] border border-zinc-500 text-sky-300'
              : 'bg-[#14161c] hover:bg-[#1c1f26] border border-[#272a31] text-zinc-300 hover:text-white'
          }`}
          title={`点击刷新中转站额度 (Relay Hub): ${summary.hasProviders ? summary.totalFormatted : '中转额度'}`}
          aria-expanded={isOpen}
        >
          <Coins className="w-4 h-4 text-zinc-400" />
          {summary.hasProviders && (
            <span
              className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${
                summary.hasError
                  ? 'bg-rose-500'
                  : summary.isLoading
                  ? 'bg-sky-400 animate-ping'
                  : 'bg-sky-400'
              }`}
            />
          )}
        </button>
      ) : (
        /* Top Header Capsule Button */
        <button
          type="button"
          onClick={handleCoinClick}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-mono select-none transition-all cursor-pointer shadow-sm relative ${
            isOpen
              ? 'bg-[#1e222a] border-zinc-500 text-white'
              : 'bg-[#14161c] hover:bg-[#1c1f26] border-[#272a31] hover:border-zinc-600 text-zinc-300 hover:text-white'
          }`}
          title="中转站额度与账单监视器 (Relay Hub)"
          aria-expanded={isOpen}
        >
          <Coins className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="font-medium truncate max-w-[140px]">
            {summary.hasProviders ? summary.totalFormatted : '中转额度'}
          </span>

          {/* Dynamic Status Indicator */}
          {summary.hasProviders && (
            <span className="relative flex h-1.5 w-1.5 ml-0.5">
              {summary.isLoading ? (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
              ) : null}
              <span
                className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                  summary.hasError
                    ? 'bg-rose-500'
                    : summary.isLoading
                    ? 'bg-sky-400'
                    : 'bg-sky-400'
                }`}
              />
            </span>
          )}
        </button>
      )}

      {/* Floating Popover Card (with hit bridge to prevent closing on gap movement) */}
      {isOpen && (
        <div
          style={popoverStyle}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="absolute z-50 w-80 rounded-xl border border-[#2a2e38] bg-[#12141a]/98 backdrop-blur-md p-3.5 shadow-2xl animate-in fade-in slide-in-from-top-1 duration-150 text-xs select-none before:absolute before:-left-3.5 before:top-0 before:bottom-0 before:w-4 before:content-['']"
        >
          {/* Header Row */}
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#242832]">
            <div className="flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-zinc-400" />
              <span className="font-semibold text-xs text-zinc-100">中转站额度中心</span>
              {autoRefreshRelayQuota ? (
                <span
                  className="text-[9px] text-sky-400 font-mono bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-700/60"
                  title="已开启：打开软件时每10分钟自动刷新，关闭或切换后台时不消耗资源"
                >
                  10m自动刷新
                </span>
              ) : (
                <span
                  className="text-[9px] text-zinc-500 font-mono bg-[#1c202a] px-1.5 py-0.5 rounded border border-[#2d3240]"
                  title="默认禁用：可在系统设置中开启每10分钟自动刷新"
                >
                  手动刷新
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  isPinnedRef.current = false
                  setIsAnalyticsOpen(true)
                }}
                className="p-1 text-zinc-400 hover:text-sky-300 hover:bg-[#1f232d] rounded transition-colors cursor-pointer"
                title="打开中转站额度与消费走势分析曲线 (大屏分析)"
              >
                <LineChart className="w-3.5 h-3.5" />
              </button>

              {summary.hasProviders && (
                <div className="relative">
                  <button
                    onClick={async () => {
                      const snapResult = await refreshAll(undefined, 'manual_click')
                      if (snapResult && snapResult.deltaFormatted) {
                        setFloatingDelta({ id: Date.now(), text: snapResult.deltaFormatted })
                        if (deltaTimerRef.current) clearTimeout(deltaTimerRef.current)
                        deltaTimerRef.current = setTimeout(() => {
                          setFloatingDelta(null)
                        }, 2000)
                      }
                    }}
                    disabled={isRefreshingAll}
                    className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-[#1f232d] rounded transition-colors cursor-pointer"
                    title="刷新全部中转站额度 (应用开启时每10分钟自动刷新)"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isRefreshingAll ? 'animate-spin text-sky-400' : ''}`}
                    />
                  </button>
                  {isOpen && floatingDelta && (
                    <div
                      key={`hdr-${floatingDelta.id}`}
                      className="pointer-events-none absolute -bottom-7 right-0 z-[80] whitespace-nowrap px-2 py-0.5 rounded-full bg-[#0d111a]/95 border border-sky-400/80 text-sky-300 font-mono font-bold text-[10px] shadow-[0_0_14px_rgba(56,189,248,0.65)] animate-relay-cost-float select-none"
                    >
                      {floatingDelta.text}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => {
                  setIsOpen(false)
                  isPinnedRef.current = false
                  onOpenSettings?.()
                }}
                className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-[#1f232d] rounded transition-colors cursor-pointer"
                title="中转站设置与管理"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Providers List or Empty State */}
          {!summary.hasProviders ? (
            <div className="py-5 text-center space-y-3">
              <div className="w-10 h-10 mx-auto rounded-full bg-[#1a1e27] border border-[#292e39] flex items-center justify-center text-zinc-400">
                <Coins className="w-5 h-5 text-zinc-400" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-zinc-200">暂未配置中转站</div>
                <div className="text-[11px] text-zinc-400 max-w-[220px] mx-auto leading-relaxed">
                  添加中转站 API Key，实时掌握可用余额与一键充值兑换。
                </div>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false)
                  onOpenSettings?.()
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加中转站</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5 no-scrollbar">
              {providers.map((p) => {
                const isItemLoading = p.status === 'loading'
                const isItemError = p.status === 'error'

                return (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-lg border border-[#222630] bg-[#161820] hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isItemError
                              ? 'bg-rose-500'
                              : isItemLoading
                              ? 'bg-sky-400 animate-pulse'
                              : 'bg-sky-400'
                          }`}
                        />
                        <span className="text-xs font-medium text-zinc-200 truncate" title={p.name}>
                          {p.name}
                        </span>
                      </div>

                      <div className={`text-xs font-mono font-semibold shrink-0 ${isItemError ? 'text-rose-400' : 'text-sky-300'}`}>
                        {isItemError ? (p.error?.includes('错误获取') ? '错误获取' : (p.error || '错误获取')) : formatBalance(p.balance, p.currency)}
                      </div>
                    </div>

                    {/* Metadata & Actions Row */}
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-[#1f232c]">
                      <span className="truncate max-w-[130px]" title={p.error || formatTime(p.lastUpdated)}>
                        {isItemError ? (
                          <span className="text-rose-400 flex items-center gap-1 truncate" title={p.error}>
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            {p.error || '错误获取'}
                          </span>
                        ) : (
                          `更新: ${formatTime(p.lastUpdated)}`
                        )}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.redeemUrl && (
                          <a
                            href={p.redeemUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-sky-400 hover:text-sky-300 hover:underline"
                            title="前往充值或兑换点卡"
                          >
                            <span>兑换</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}

                        <button
                          onClick={() => refreshProvider(p)}
                          disabled={isItemLoading}
                          className="p-0.5 hover:text-zinc-200 transition-colors"
                          title="刷新此中转站余额"
                        >
                          <RefreshCw
                            className={`w-2.5 h-2.5 ${isItemLoading ? 'animate-spin text-sky-400' : ''}`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Card Footer Link to Settings */}
          {summary.hasProviders && (
            <div className="mt-2.5 pt-2 border-t border-[#242832] flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 font-mono">共 {providers.length} 个中转站</span>
              <button
                onClick={() => {
                  setIsOpen(false)
                  isPinnedRef.current = false
                  onOpenSettings?.()
                }}
                className="text-sky-400 hover:text-sky-300 font-medium hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>管理中转站</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Large Floating Analytics Modal (时间-耗费多少钱的曲线表) */}
      <RelayCostAnalyticsModal
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        providers={providers}
        onRefreshAll={async () => {
          await refreshAll(undefined, 'manual_click')
        }}
        isRefreshing={isRefreshingAll}
      />
    </div>
  )
}
