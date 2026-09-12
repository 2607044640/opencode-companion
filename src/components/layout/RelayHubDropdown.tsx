import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Coins,
  RefreshCw,
  Settings,
  ExternalLink,
  Plus,
  AlertCircle,
} from 'lucide-react'
import {
  getRelayProviders,
  updateRelayProvider,
  fetchRelayQuota,
  aggregateBalances,
  formatBalance,
  type RelayProvider,
} from '../../utils/relay-billing'

interface RelayHubDropdownProps {
  onOpenSettings?: () => void
}

export const RelayHubDropdown: React.FC<RelayHubDropdownProps> = ({ onOpenSettings }) => {
  const [providers, setProviders] = useState<RelayProvider[]>(() => getRelayProviders())
  const [isOpen, setIsOpen] = useState(false)
  const [isRefreshingAll, setIsRefreshingAll] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Listen for storage changes from settings modal
  const reloadProviders = useCallback(() => {
    setProviders(getRelayProviders())
  }, [])

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

  // Refresh all providers concurrently
  const refreshAll = async () => {
    if (isRefreshingAll || providers.length === 0) return
    setIsRefreshingAll(true)

    // Mark all loading
    for (const p of providers) {
      updateRelayProvider(p.id, { status: 'loading' })
    }
    reloadProviders()

    await Promise.allSettled(
      providers.map(async (p) => {
        try {
          const res = await fetchRelayQuota(p)
          if (res.ok) {
            updateRelayProvider(p.id, {
              balance: res.balance,
              totalQuota: res.totalQuota,
              usedQuota: res.usedQuota,
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

    reloadProviders()
    setIsRefreshingAll(false)
  }

  const summary = aggregateBalances(providers)

  // Format relative timestamp
  const formatTime = (ts?: number) => {
    if (!ts) return '未更新'
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff < 60) return '刚刚'
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
    return `${Math.floor(diff / 3600)} 小时前`
  }

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      {/* Top Header Capsule Button */}
      <button
        type="button"
        onClick={() => {
          reloadProviders()
          setIsOpen((prev) => !prev)
        }}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-mono select-none transition-all cursor-pointer shadow-sm ${
          isOpen
            ? 'bg-[#1e222a] border-zinc-500 text-white'
            : 'bg-[#14161c] hover:bg-[#1c1f26] border-[#272a31] hover:border-zinc-600 text-zinc-300 hover:text-white'
        }`}
        title="中转站额度与账单监视器 (Relay Hub)"
        aria-expanded={isOpen}
      >
        <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="font-medium truncate max-w-[140px]">
          {summary.hasProviders ? summary.totalFormatted : '中转额度'}
        </span>

        {/* Dynamic Status Indicator */}
        {summary.hasProviders && (
          <span className="relative flex h-1.5 w-1.5 ml-0.5">
            {summary.isLoading ? (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            ) : null}
            <span
              className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                summary.hasError
                  ? 'bg-rose-500'
                  : summary.isLoading
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
            />
          </span>
        )}
      </button>

      {/* Floating Popover Card */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border border-[#2a2e38] bg-[#12141a]/95 backdrop-blur-md p-3.5 shadow-2xl animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Header Row */}
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#242832]">
            <div className="flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-xs text-zinc-100">中转站额度中心</span>
            </div>

            <div className="flex items-center gap-1">
              {summary.hasProviders && (
                <button
                  onClick={refreshAll}
                  disabled={isRefreshingAll}
                  className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-[#1f232d] rounded transition-colors"
                  title="刷新全部中转站额度"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isRefreshingAll ? 'animate-spin text-amber-400' : ''}`}
                  />
                </button>
              )}
              <button
                onClick={() => {
                  setIsOpen(false)
                  onOpenSettings?.()
                }}
                className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-[#1f232d] rounded transition-colors"
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
                <Coins className="w-5 h-5 text-amber-400/80" />
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer shadow-sm"
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
                              ? 'bg-amber-400 animate-pulse'
                              : 'bg-emerald-400'
                          }`}
                        />
                        <span className="text-xs font-medium text-zinc-200 truncate" title={p.name}>
                          {p.name}
                        </span>
                      </div>

                      <div className="text-xs font-mono font-semibold text-emerald-400 shrink-0">
                        {formatBalance(p.balance, p.currency)}
                      </div>
                    </div>

                    {/* Metadata & Actions Row */}
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-[#1f232c]">
                      <span className="truncate max-w-[130px]" title={p.error || formatTime(p.lastUpdated)}>
                        {isItemError ? (
                          <span className="text-rose-400 flex items-center gap-1 truncate">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            {p.error || '查询失败'}
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
                            className="flex items-center gap-0.5 text-blue-400 hover:text-blue-300 hover:underline"
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
                            className={`w-2.5 h-2.5 ${isItemLoading ? 'animate-spin text-amber-400' : ''}`}
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
                  onOpenSettings?.()
                }}
                className="text-blue-400 hover:text-blue-300 font-medium hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>管理中转站</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
