import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  LineChart,
  X,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Trash2,
  Calendar,
  Layers,
  Filter,
  Eye,
  EyeOff,
  Coins,
  Clock,
  DollarSign,
  RotateCcw,
} from 'lucide-react'
import {
  getRelayHistory,
  clearRelayHistory,
  computeTotalSpent,
  resetRelayAccumulatedSpent,
  filterHistoryByRange,
  formatDelta,
  type RelayBalanceSnapshot,
} from '../../utils/relay-history'
import { type RelayProvider } from '../../utils/relay-billing'
import { formatTimeAgo } from '../../utils/time'
import { useI18n } from '../../utils/i18n'

export interface RelayCostAnalyticsModalProps {
  isOpen: boolean
  onClose: () => void
  providers: RelayProvider[]
  onRefreshAll?: () => Promise<void>
  isRefreshing?: boolean
}

export const PROVIDER_PALETTE = [
  '#38bdf8', // sky-400
  '#34d399', // emerald-400
  '#a78bfa', // purple-400
  '#fbbf24', // amber-400
  '#fb7185', // rose-400
  '#22d3ee', // cyan-400
  '#818cf8', // indigo-400
  '#f472b6', // pink-400
]

export function getProviderColor(index: number): string {
  return PROVIDER_PALETTE[index % PROVIDER_PALETTE.length]
}

export function generateSmoothSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

export const RelayCostAnalyticsModal: React.FC<RelayCostAnalyticsModalProps> = ({
  isOpen,
  onClose,
  providers,
  onRefreshAll,
  isRefreshing = false,
}) => {
  const { isZh } = useI18n()
  const [history, setHistory] = useState<RelayBalanceSnapshot[]>(() => getRelayHistory())
  const [curveMode, setCurveMode] = useState<'single' | 'multi'>('single')
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | 'all'>('24h')
  const [disabledProviders, setDisabledProviders] = useState<Record<string, boolean>>({})
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null)
  const chartSvgRef = useRef<SVGSVGElement>(null)

  // Reload history on updates
  useEffect(() => {
    const load = () => setHistory(getRelayHistory())
    load()
    window.addEventListener('opencode-relay-history-updated', load)
    window.addEventListener('storage', load)
    return () => {
      window.removeEventListener('opencode-relay-history-updated', load)
      window.removeEventListener('storage', load)
    }
  }, [])

  // Filter history by selected time range
  const filteredHistory = useMemo(() => {
    return filterHistoryByRange(history, timeRange)
  }, [history, timeRange])

  // Discover all distinct provider IDs seen in history and active providers
  const allProviderMetas = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const p of providers) {
      map.set(p.id, { id: p.id, name: p.name || p.id })
    }
    for (const snap of history) {
      if (snap.providers) {
        for (const [id, prov] of Object.entries(snap.providers)) {
          if (!map.has(id)) {
            map.set(id, { id, name: prov.name || id })
          }
        }
      }
    }
    return Array.from(map.values())
  }, [providers, history])

  const totalSpent = useMemo(() => computeTotalSpent(filteredHistory), [filteredHistory])

  const handleResetSpent = () => {
    if (
      confirm(
        isZh
          ? '确定要清零当前区间累计扣费吗？\n(这会将历史记录中的扣费差额归零，但保留所有采样点的余额走势曲线)'
          : 'Reset accumulated spent counter to $0.00? (Keeps balance history curves intact)'
      )
    ) {
      const updated = resetRelayAccumulatedSpent()
      setHistory(updated)
    }
  }

  const latestSnapshot = filteredHistory.length > 0 ? filteredHistory[filteredHistory.length - 1] : null
  const latestDelta = latestSnapshot?.delta ?? 0

  // Chart Dimensions
  const svgWidth = 840
  const svgHeight = 320
  const padLeft = 65
  const padRight = 30
  const padTop = 30
  const padBottom = 45
  const chartW = svgWidth - padLeft - padRight
  const chartH = svgHeight - padTop - padBottom

  // Chart Min/Max Range Calculations
  const chartMetrics = useMemo(() => {
    if (filteredHistory.length === 0) {
      return { minVal: 0, maxVal: 10, ticksY: [0, 2.5, 5, 7.5, 10] }
    }

    let min = Infinity
    let max = -Infinity

    if (curveMode === 'single') {
      for (const s of filteredHistory) {
        min = Math.min(min, s.totalNormalizedUsd)
        max = Math.max(max, s.totalNormalizedUsd)
      }
    } else {
      // Multi-line mode: compute bounds over active/enabled providers
      let hasVal = false
      for (const s of filteredHistory) {
        for (const [id, prov] of Object.entries(s.providers || {})) {
          if (!disabledProviders[id]) {
            hasVal = true
            min = Math.min(min, prov.balance)
            max = Math.max(max, prov.balance)
          }
        }
      }
      if (!hasVal) {
        min = 0
        max = 10
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0
      max = 10
    }

    if (min === max) {
      min = Math.max(0, min - 1)
      max = max + 1
    } else {
      const pad = (max - min) * 0.08
      min = Math.max(0, min - pad)
      max = max + pad
    }

    const step = (max - min) / 4
    const ticksY = [
      Number((max).toFixed(2)),
      Number((max - step).toFixed(2)),
      Number((max - step * 2).toFixed(2)),
      Number((max - step * 3).toFixed(2)),
      Number((min).toFixed(2)),
    ]

    return { minVal: min, maxVal: max, ticksY }
  }, [filteredHistory, curveMode, disabledProviders])

  // Coordinate mapping helper
  const getX = (index: number, total: number) => {
    if (total <= 1) return padLeft + chartW / 2
    return padLeft + (index / (total - 1)) * chartW
  }

  const getY = (val: number) => {
    const { minVal, maxVal } = chartMetrics
    if (maxVal === minVal) return padTop + chartH / 2
    const ratio = (val - minVal) / (maxVal - minVal)
    return padTop + chartH - ratio * chartH
  }

  // Generate SVG Points for Single Total Line
  const singleLinePoints = useMemo(() => {
    if (filteredHistory.length === 0) return []
    return filteredHistory.map((s, idx) => ({
      x: getX(idx, filteredHistory.length),
      y: getY(s.totalNormalizedUsd),
      snapshot: s,
    }))
  }, [filteredHistory, chartMetrics])

  // Generate SVG Points for Multi Lines (by provider)
  const multiLineSeries = useMemo(() => {
    if (filteredHistory.length === 0) return []

    return allProviderMetas
      .filter((meta) => !disabledProviders[meta.id])
      .map((meta, provIndex) => {
        const points = filteredHistory.map((s, idx) => {
          const val = s.providers?.[meta.id]?.balance ?? 0
          return {
            x: getX(idx, filteredHistory.length),
            y: getY(val),
            val,
            snapshot: s,
          }
        })

        return {
          id: meta.id,
          name: meta.name,
          color: getProviderColor(provIndex),
          points,
        }
      })
  }, [filteredHistory, allProviderMetas, disabledProviders, chartMetrics])

  // Single line paths (stroke + fill)
  const singlePath = useMemo(() => generateSmoothSvgPath(singleLinePoints), [singleLinePoints])
  const singleFillPath = useMemo(() => {
    if (singleLinePoints.length <= 1) return ''
    const firstX = singleLinePoints[0].x
    const lastX = singleLinePoints[singleLinePoints.length - 1].x
    const bottomY = padTop + chartH
    return `${singlePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`
  }, [singlePath, singleLinePoints, padTop, chartH])

  // SVG Mouse Move Crosshair Handler
  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!chartSvgRef.current || filteredHistory.length === 0) return
    const rect = chartSvgRef.current.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * svgWidth
    const mouseY = ((e.clientY - rect.top) / rect.height) * svgHeight

    // Find closest data point by X coordinate
    let closestIdx = 0
    let closestDist = Infinity

    for (let i = 0; i < filteredHistory.length; i++) {
      const px = getX(i, filteredHistory.length)
      const dist = Math.abs(mouseX - px)
      if (dist < closestDist) {
        closestDist = dist
        closestIdx = i
      }
    }

    setHoverIndex(closestIdx)
    setHoverPosition({ x: mouseX, y: mouseY })
  }

  const handleSvgMouseLeave = () => {
    setHoverIndex(null)
    setHoverPosition(null)
  }

  const hoveredSnapshot = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < filteredHistory.length
    ? filteredHistory[hoverIndex]
    : null

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-floating-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-5xl h-[86vh] max-h-[820px] bg-[#0e1015] border border-[#272b35] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100 animate-in zoom-in-95 duration-150 select-none">
        {/* 1. Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#222631] bg-[#12141c]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-950/70 border border-sky-800/60 flex items-center justify-center text-sky-400 shadow-sm shadow-sky-950">
              <LineChart className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-100">
                  {isZh ? '中转站额度与消费走势分析' : 'Relay Quota & Cost Analytics'}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-sky-950/60 border border-sky-700/50 text-[10px] font-mono text-sky-300">
                  Live
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                {isZh
                  ? '追踪每次刷新中转站后的实时余额变动、单次扣费与历史趋势曲线'
                  : 'Track real-time balance changes, interval costs, and trend curves upon each refresh'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRefreshAll && (
              <button
                type="button"
                onClick={() => onRefreshAll()}
                disabled={isRefreshing}
                className="px-3 py-1.5 rounded-lg bg-[#181c26] hover:bg-[#202533] border border-[#2c3242] text-xs font-medium text-zinc-200 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="立即刷新所有中转站额度并记录走势点"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : 'text-zinc-400'}`} />
                <span>{isZh ? '刷新额度' : 'Refresh'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    isZh
                      ? '确定要清空中转站消费走势历史记录与累计扣费吗？'
                      : 'Clear all balance history snapshots and accumulated spent?'
                  )
                ) {
                  clearRelayHistory()
                  setHistory([])
                }
              }}
              className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-[#1a1418] rounded-lg transition-colors cursor-pointer"
              title={isZh ? '清空全部历史走势与累计扣费' : 'Clear All History & Spent'}
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer ml-1"
              aria-label="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Top Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3.5 bg-[#101218] border-b border-[#1f232d]">
          {/* Card 1: Current Total Balance */}
          <div className="p-3 rounded-xl bg-[#141720] border border-[#242936] shadow-inner">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>{isZh ? '当前总额度' : 'Total Balance'}</span>
              <Coins className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
              ${latestSnapshot ? latestSnapshot.totalNormalizedUsd.toFixed(2) : '0.00'}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
              {providers.length} {isZh ? '个中转站接入' : 'providers active'}
            </div>
          </div>

          {/* Card 2: Recent Delta Cost */}
          <div className="p-3 rounded-xl bg-[#141720] border border-[#242936] shadow-inner">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>{isZh ? '最近单次扣费' : 'Recent Delta'}</span>
              <DollarSign className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className={`text-lg font-bold font-mono mt-1 ${latestDelta < 0 ? 'text-sky-300' : 'text-zinc-200'}`}>
              {formatDelta(latestDelta)}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5 truncate" title={latestSnapshot ? new Date(latestSnapshot.timestamp).toLocaleString() : ''}>
              {latestSnapshot ? `${formatTimeAgo(latestSnapshot.timestamp)} (${new Date(latestSnapshot.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})` : '--:--'}
            </div>
          </div>

          {/* Card 3: Tracked Period Spent */}
          <div className="p-3 rounded-xl bg-[#141720] border border-[#242936] shadow-inner relative group">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>{isZh ? '区间累计扣费' : 'Total Spent'}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleResetSpent}
                  className="p-1 text-zinc-500 hover:text-amber-400 hover:bg-zinc-800/60 rounded transition-all cursor-pointer opacity-70 group-hover:opacity-100"
                  title={isZh ? '清零/重置累计扣费 (保留走势曲线)' : 'Reset Spent Counter (Keeps curves)'}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              </div>
            </div>
            <div className="text-lg font-bold font-mono text-rose-300 mt-1 flex items-baseline justify-between">
              <span>-${totalSpent.toFixed(totalSpent < 0.01 && totalSpent > 0 ? 4 : 2)}</span>
              {totalSpent > 0 && (
                <button
                  type="button"
                  onClick={handleResetSpent}
                  className="text-[11px] font-sans font-normal text-zinc-500 hover:text-amber-400 hover:underline cursor-pointer opacity-80 group-hover:opacity-100 transition-opacity"
                  title={isZh ? '点击清零累计扣费' : 'Reset accumulated spent'}
                >
                  {isZh ? '清零' : 'Reset'}
                </button>
              )}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              {filteredHistory.length} {isZh ? '次采样统计' : 'samples tracked'}
            </div>
          </div>

          {/* Card 4: Sampling Points */}
          <div className="p-3 rounded-xl bg-[#141720] border border-[#242936] shadow-inner">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>{isZh ? '记录采样点数' : 'Data Points'}</span>
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
              {filteredHistory.length}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              {isZh ? '自动截留最近 500 点' : 'Auto prunes to 500'}
            </div>
          </div>
        </div>

        {/* 3. Control & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 bg-[#12141c] border-b border-[#20242f] text-xs">
          {/* Left: Curve Display Mode ("一段线" vs "多段线") */}
          <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-[#181a24] border border-[#292e3d]">
            <button
              type="button"
              onClick={() => setCurveMode('single')}
              className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 font-medium cursor-pointer ${
                curveMode === 'single'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
              title="展示总余额走势的一段连续曲线"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{isZh ? '总额度走势 (一段线)' : 'Total Line'}</span>
            </button>

            <button
              type="button"
              onClick={() => setCurveMode('multi')}
              className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 font-medium cursor-pointer ${
                curveMode === 'multi'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
              title="切换为各中转站分开的多段独立曲线"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isZh ? '中转站分开 (多段线)' : 'Split Lines'}</span>
            </button>
          </div>

          {/* Center/Right: Time Range Selectors */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 text-xs flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              <span>{isZh ? '范围:' : 'Range:'}</span>
            </span>

            {(['1h', '24h', '7d', 'all'] as const).map((r) => {
              const label =
                r === '1h'
                  ? isZh ? '1小时' : '1h'
                  : r === '24h'
                  ? isZh ? '24小时' : '24h'
                  : r === '7d'
                  ? isZh ? '7天' : '7d'
                  : isZh ? '全部' : 'All'

              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setTimeRange(r)}
                  className={`px-2.5 py-1 rounded text-xs font-medium font-mono transition-all cursor-pointer ${
                    timeRange === r
                      ? 'bg-zinc-700 text-white border border-zinc-500 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* 4. Provider Filter Chips ("也可以分类，不看哪些线") */}
        {allProviderMetas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-6 py-2 bg-[#0d0f14] border-b border-[#1c202a] text-xs">
            <span className="text-zinc-400 flex items-center gap-1 text-[11px] shrink-0">
              <Filter className="w-3 h-3 text-zinc-500" />
              <span>{isZh ? '曲线分类筛选:' : 'Filter Providers:'}</span>
            </span>

            {allProviderMetas.map((meta, idx) => {
              const isHidden = Boolean(disabledProviders[meta.id])
              const color = getProviderColor(idx)

              return (
                <button
                  key={meta.id}
                  type="button"
                  onClick={() => {
                    setDisabledProviders((prev) => ({
                      ...prev,
                      [meta.id]: !prev[meta.id],
                    }))
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono transition-all border cursor-pointer ${
                    isHidden
                      ? 'bg-zinc-900/60 border-zinc-800 text-zinc-500 opacity-60 line-through'
                      : 'bg-[#151822] border-zinc-700/80 text-zinc-200 shadow-sm'
                  }`}
                  title={isHidden ? `点击显示此中转站折线 (${meta.name})` : `点击隐藏此中转站折线 (${meta.name})`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: isHidden ? '#52525b' : color }}
                  />
                  <span className="truncate max-w-[140px]">{meta.name}</span>
                  {isHidden ? (
                    <EyeOff className="w-3 h-3 text-zinc-500 ml-0.5" />
                  ) : (
                    <Eye className="w-3 h-3 text-sky-400 ml-0.5" />
                  )}
                </button>
              )
            })}

            {/* Quick Actions */}
            <div className="flex items-center gap-1.5 ml-auto text-[11px]">
              <button
                type="button"
                onClick={() => setDisabledProviders({})}
                className="text-sky-400 hover:text-sky-300 cursor-pointer"
              >
                {isZh ? '全选' : 'Select All'}
              </button>
              <span className="text-zinc-600">|</span>
              <button
                type="button"
                onClick={() => {
                  const allDisabled: Record<string, boolean> = {}
                  for (const m of allProviderMetas) {
                    allDisabled[m.id] = true
                  }
                  setDisabledProviders(allDisabled)
                }}
                className="text-zinc-400 hover:text-zinc-300 cursor-pointer"
              >
                {isZh ? '全部隐藏' : 'Hide All'}
              </button>
            </div>
          </div>
        )}

        {/* 5. SVG Interactive Chart Area */}
        <div className="relative flex-1 min-h-0 bg-[#0d0f14] p-4 flex flex-col justify-center">
          {filteredHistory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 select-none">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
                <LineChart className="w-6 h-6 text-zinc-500" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">
                {isZh ? '暂无该时间区间的走势记录' : 'No Balance History In Range'}
              </h3>
              <p className="text-xs text-zinc-400 max-w-sm mb-4">
                {isZh
                  ? '点击左下角或右上角刷新按钮后，系统将自动记录各中转站余额并生成连续平滑曲线。'
                  : 'Click the refresh button to record provider balances and generate trend curves.'}
              </p>
              {onRefreshAll && (
                <button
                  type="button"
                  onClick={() => onRefreshAll()}
                  disabled={isRefreshing}
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>{isZh ? '立即采样记录当前额度' : 'Record Initial Snapshot'}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="relative w-full h-full flex flex-col">
              <svg
                ref={chartSvgRef}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-full overflow-visible"
                onMouseMove={handleSvgMouseMove}
                onMouseLeave={handleSvgMouseLeave}
              >
                <defs>
                  {/* Sky blue gradient for Single Line mode */}
                  <linearGradient id="singleLineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Grid Lines & Tick Labels */}
                {chartMetrics.ticksY.map((tickVal, tIdx) => {
                  const y = getY(tickVal)
                  return (
                    <g key={tIdx} className="text-zinc-600">
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={padLeft + chartW}
                        y2={y}
                        stroke="#1f242e"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                      />
                      <text
                        x={padLeft - 8}
                        y={y + 4}
                        textAnchor="end"
                        className="text-[10px] font-mono fill-zinc-500 select-none"
                      >
                        ${tickVal.toFixed(2)}
                      </text>
                    </g>
                  )
                })}

                {/* X-Axis Time Labels */}
                {filteredHistory.map((s, idx) => {
                  // Only render up to ~6 time ticks to avoid crowding
                  const step = Math.max(1, Math.floor(filteredHistory.length / 5))
                  const isVisibleTick = idx === 0 || idx === filteredHistory.length - 1 || idx % step === 0
                  if (!isVisibleTick) return null

                  const x = getX(idx, filteredHistory.length)
                  const timeStr = new Date(s.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })

                  return (
                    <text
                      key={s.id}
                      x={x}
                      y={padTop + chartH + 20}
                      textAnchor="middle"
                      className="text-[10px] font-mono fill-zinc-500 select-none"
                    >
                      {timeStr}
                    </text>
                  )
                })}

                {/* Baseline Axis Line */}
                <line
                  x1={padLeft}
                  y1={padTop + chartH}
                  x2={padLeft + chartW}
                  y2={padTop + chartH}
                  stroke="#272c38"
                  strokeWidth="1"
                />

                {/* --- Mode 1: Single Line ("一段线") --- */}
                {curveMode === 'single' && (
                  <>
                    {/* Area fill */}
                    {singleFillPath && (
                      <path d={singleFillPath} fill="url(#singleLineAreaGrad)" />
                    )}

                    {/* Smooth curve stroke */}
                    {singlePath && (
                      <path
                        d={singlePath}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* Circular points on single line */}
                    {singleLinePoints.map((pt, pIdx) => {
                      const isHovered = hoverIndex === pIdx
                      return (
                        <circle
                          key={pIdx}
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 5 : 3}
                          fill={isHovered ? '#ffffff' : '#38bdf8'}
                          stroke="#0e1015"
                          strokeWidth="2"
                          className="transition-all duration-75"
                        />
                      )
                    })}
                  </>
                )}

                {/* --- Mode 2: Multi Lines ("多段线，多个中转站分开") --- */}
                {curveMode === 'multi' &&
                  multiLineSeries.map((series) => {
                    const pathD = generateSmoothSvgPath(series.points)
                    if (!pathD) return null

                    return (
                      <g key={series.id}>
                        <path
                          d={pathD}
                          fill="none"
                          stroke={series.color}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={0.9}
                        />
                        {series.points.map((pt, pIdx) => {
                          const isHovered = hoverIndex === pIdx
                          return (
                            <circle
                              key={pIdx}
                              cx={pt.x}
                              cy={pt.y}
                              r={isHovered ? 4.5 : 2.5}
                              fill={series.color}
                              stroke="#0e1015"
                              strokeWidth="1.5"
                            />
                          )
                        })}
                      </g>
                    )
                  })}

                {/* Crosshair Vertical Guide Line on Hover */}
                {hoverIndex !== null && hoverPosition && (
                  <line
                    x1={getX(hoverIndex, filteredHistory.length)}
                    y1={padTop}
                    x2={getX(hoverIndex, filteredHistory.length)}
                    y2={padTop + chartH}
                    stroke="#38bdf8"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    className="opacity-75"
                  />
                )}
              </svg>

              {/* Floating Tooltip Card */}
              {hoveredSnapshot && hoverPosition && (
                <div
                  className="absolute z-20 pointer-events-none p-3 rounded-xl bg-[#141720]/95 backdrop-blur-md border border-[#2b3140] shadow-2xl text-xs space-y-1.5 transition-all duration-75"
                  style={{
                    left: `${Math.min(chartW - 60, Math.max(10, hoverPosition.x - 70))}px`,
                    top: '15px',
                    minWidth: '220px',
                  }}
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#252a36] text-[11px] text-zinc-400">
                    <span className="font-mono" title={new Date(hoveredSnapshot.timestamp).toLocaleString()}>
                      {formatTimeAgo(hoveredSnapshot.timestamp)} ({new Date(hoveredSnapshot.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300">
                      {hoveredSnapshot.trigger === 'manual_click'
                        ? isZh ? '手动点击' : 'Manual'
                        : isZh ? '自动刷新' : 'Auto'}
                    </span>
                  </div>

                  {curveMode === 'single' ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">{isZh ? '总余额' : 'Total'}:</span>
                        <span className="font-mono font-bold text-sky-300">
                          ${hoveredSnapshot.totalNormalizedUsd.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">{isZh ? '单次扣费' : 'Cost Delta'}:</span>
                        <span className={`font-mono font-bold ${hoveredSnapshot.delta < 0 ? 'text-sky-300' : 'text-zinc-300'}`}>
                          {formatDelta(hoveredSnapshot.delta)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-[160px] overflow-y-auto no-scrollbar">
                      {allProviderMetas
                        .filter((m) => !disabledProviders[m.id])
                        .map((m, idx) => {
                          const bal = hoveredSnapshot.providers?.[m.id]?.balance ?? 0
                          const color = getProviderColor(idx)
                          return (
                            <div key={m.id} className="flex items-center justify-between text-[11px]">
                              <span className="flex items-center gap-1.5 text-zinc-300 truncate max-w-[120px]">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                <span>{m.name}</span>
                              </span>
                              <span className="font-mono font-semibold text-zinc-100">
                                ${bal.toFixed(2)}
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 6. Recent Snapshot Log Table (Footer / History List) */}
        <div className="h-44 border-t border-[#222631] bg-[#11131a] flex flex-col overflow-hidden text-xs">
          <div className="flex items-center justify-between px-6 py-2 border-b border-[#1d212b] bg-[#131620] text-zinc-400 text-[11px]">
            <span className="font-semibold text-zinc-200">{isZh ? '刷新日志与扣费流水' : 'Balance Audit Log'}</span>
            <span>{isZh ? `共 ${filteredHistory.length} 轮采样` : `${filteredHistory.length} records`}</span>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-2">
            <table className="w-full text-left font-mono text-[11px]">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800 pb-1">
                  <th className="py-1">{isZh ? '采样时间' : 'Time'}</th>
                  <th className="py-1">{isZh ? '触发方式' : 'Trigger'}</th>
                  <th className="py-1">{isZh ? '刷新后总余额' : 'Balance'}</th>
                  <th className="py-1">{isZh ? '单次扣费差额 (浅蓝色)' : 'Delta Cost'}</th>
                  <th className="py-1 text-right">{isZh ? '中转站数' : 'Providers'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c202a]">
                {filteredHistory
                  .slice()
                  .reverse()
                  .slice(0, 50)
                  .map((snap) => (
                    <tr key={snap.id} className="hover:bg-[#161922] transition-colors">
                      <td className="py-1.5 text-zinc-300">
                        <div className="flex items-center gap-1.5" title={new Date(snap.timestamp).toLocaleString()}>
                          <span className="font-semibold text-zinc-200">
                            {formatTimeAgo(snap.timestamp)}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono font-normal">
                            ({new Date(snap.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
                          </span>
                        </div>
                      </td>
                      <td className="py-1.5 text-zinc-400">
                        {snap.trigger === 'manual_click' ? (
                          <span className="text-sky-400 font-sans">{isZh ? '图标点击' : 'Click'}</span>
                        ) : (
                          <span className="text-zinc-500 font-sans">{isZh ? '10m 定时' : 'Timer'}</span>
                        )}
                      </td>
                      <td className="py-1.5 text-zinc-100 font-bold">
                        ${snap.totalNormalizedUsd.toFixed(2)}
                      </td>
                      <td className="py-1.5 font-bold">
                        <span className={snap.delta < 0 ? 'text-sky-300' : 'text-zinc-400'}>
                          {formatDelta(snap.delta)}
                        </span>
                      </td>
                      <td className="py-1.5 text-right text-zinc-400">
                        {Object.keys(snap.providers || {}).length}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
