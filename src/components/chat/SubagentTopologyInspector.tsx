import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Network,
  X,
  Bot,
  CheckCircle2,
  AlertCircle,
  Search,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ArrowRight,
  Clock,
  Maximize2,
  Minimize2,
  Send,
  MessageSquare,
  Cpu,
} from 'lucide-react'
import type { Message, Session } from '../../types/opencode'
import {
  type SubagentNode,
  extractSubagentTopology,
  formatTopologyDuration,
} from '../../utils/subagent-topology'
import { SubagentSessionModal } from './SubagentSessionModal'
import { useI18n } from '../../utils/i18n'

export interface SubagentTopologyInspectorProps {
  isOpen: boolean
  onClose: () => void
  messages?: Message[]
  activeSession?: Session | null
  childSessions?: Session[]
}

/**
 * 2x2 Antigravity-style animated matrix running dots
 */
function RunningIndicatorDots() {
  return (
    <span className="grid grid-cols-2 gap-[2px] w-2.5 h-2.5 items-center justify-center shrink-0">
      <span
        className="w-1 h-1 rounded-full bg-sky-400 animate-pulse"
        style={{ animationDuration: '0.8s', animationDelay: '0ms' }}
      />
      <span
        className="w-1 h-1 rounded-full bg-sky-400 animate-pulse"
        style={{ animationDuration: '0.8s', animationDelay: '200ms' }}
      />
      <span
        className="w-1 h-1 rounded-full bg-sky-400 animate-pulse"
        style={{ animationDuration: '0.8s', animationDelay: '600ms' }}
      />
      <span
        className="w-1 h-1 rounded-full bg-sky-400 animate-pulse"
        style={{ animationDuration: '0.8s', animationDelay: '400ms' }}
      />
    </span>
  )
}

export function SubagentTopologyInspector({
  isOpen,
  onClose,
  messages = [],
  activeSession,
  childSessions = [],
}: SubagentTopologyInspectorProps) {
  const { lang } = useI18n()
  const isZh = lang.startsWith('zh')

  const [activeTab, setActiveTab] = useState<'tree' | 'stream'>('tree')
  const [filterStatus, setFilterStatus] = useState<'all' | 'running' | 'completed'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isFloating, setIsFloating] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})
  const [selectedModalNode, setSelectedModalNode] = useState<SubagentNode | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const streamScrollRef = useRef<HTMLDivElement>(null)

  // Live ticking timer for elapsed durations
  useEffect(() => {
    if (!isOpen) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [isOpen])

  // Esc shortcut to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !selectedModalNode) {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onClose, selectedModalNode])

  // Extract topology data
  const topologyData = useMemo(() => {
    return extractSubagentTopology(messages, activeSession, childSessions, now)
  }, [messages, activeSession, childSessions, now])

  // Auto-expand all nodes when new ones appear
  useEffect(() => {
    if (!isOpen) return
    setExpandedNodes((prev) => {
      const next = { ...prev }
      for (const node of topologyData.allNodes) {
        if (next[node.id] === undefined) {
          next[node.id] = true
        }
      }
      return next
    })
  }, [isOpen, topologyData.allNodes])

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    return topologyData.allNodes.filter((node) => {
      if (filterStatus === 'running' && node.status !== 'running' && node.status !== 'pending') {
        return false
      }
      if (filterStatus === 'completed' && node.status !== 'completed') {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matched =
          node.name.toLowerCase().includes(q) ||
          node.role.toLowerCase().includes(q) ||
          node.model.toLowerCase().includes(q) ||
          node.taskDescription.toLowerCase().includes(q) ||
          node.prompt.toLowerCase().includes(q)
        if (!matched) return false
      }
      return true
    })
  }, [topologyData.allNodes, filterStatus, searchQuery])

  // Filtered communications
  const filteredCommunications = useMemo(() => {
    return topologyData.communications.filter((comm) => {
      if (filterStatus === 'running' && comm.status !== 'running' && comm.status !== 'pending') {
        return false
      }
      if (filterStatus === 'completed' && comm.status !== 'completed') {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matched =
          comm.title.toLowerCase().includes(q) ||
          comm.sourceName.toLowerCase().includes(q) ||
          comm.targetName.toLowerCase().includes(q) ||
          comm.content.toLowerCase().includes(q)
        if (!matched) return false
      }
      return true
    })
  }, [topologyData.communications, filterStatus, searchQuery])

  const toggleNodeExpand = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleCopyText = (text: string, id: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  if (!isOpen) return null

  // Header chrome
  const header = (
    <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#12151c] border-b border-[#212631] select-none shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 rounded-md bg-sky-950/60 border border-sky-800/60 flex items-center justify-center text-sky-400 shrink-0">
          <Network className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-xs text-zinc-100">
              {isZh ? '子智能体拓扑与通讯监视' : 'Subagent Topology & Monitor'}
            </span>
            {topologyData.runningCount > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-sky-950/80 border border-sky-700/60 text-[10px] text-sky-300 font-mono">
                <RunningIndicatorDots />
                <span>{topologyData.runningCount} 运行中</span>
              </span>
            )}
          </div>
          <span className="text-[10px] text-zinc-500 font-mono truncate block">
            {topologyData.totalCount} {isZh ? '个子智能体' : 'Subagents'} · {topologyData.communications.length} {isZh ? '条通讯包' : 'Packets'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 text-zinc-400">
        {/* Dock vs Floating mode toggle */}
        <button
          type="button"
          onClick={() => setIsFloating(!isFloating)}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title={isFloating ? (isZh ? '停靠到右侧' : 'Dock to side') : (isZh ? '悬浮弹窗' : 'Float window')}
        >
          {isFloating ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title={isZh ? '关闭 (Esc)' : 'Close (Esc)'}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )

  // Subheader: Tab buttons & Search & Filters
  const controlsBar = (
    <div className="px-3 py-2 bg-[#0d1017] border-b border-[#1b202a] flex flex-col gap-2 shrink-0 select-none">
      <div className="flex items-center justify-between gap-2">
        {/* Tab switch: Tree vs Stream */}
        <div className="flex items-center bg-[#151922] p-0.5 rounded-lg border border-[#222836]">
          <button
            type="button"
            onClick={() => setActiveTab('tree')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-all cursor-pointer ${
              activeTab === 'tree'
                ? 'bg-sky-950/70 text-sky-300 border border-sky-800/60 font-medium shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Network className="w-3 h-3" />
            <span>{isZh ? '拓扑树' : 'Topology Tree'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stream')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-all cursor-pointer ${
              activeTab === 'stream'
                ? 'bg-sky-950/70 text-sky-300 border border-sky-800/60 font-medium shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>{isZh ? '通讯流' : 'Packet Stream'}</span>
          </button>
        </div>

        {/* Status Filter Badges */}
        <div className="flex items-center gap-1 text-[11px] font-mono">
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
              filterStatus === 'all'
                ? 'bg-zinc-800 text-zinc-100 font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            All ({topologyData.totalCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('running')}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
              filterStatus === 'running'
                ? 'bg-sky-950/80 text-sky-300 border border-sky-800/60 font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Run ({topologyData.runningCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('completed')}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
              filterStatus === 'completed'
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Done ({topologyData.completedCount})
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={isZh ? '按智能体名称、角色、模型或指令过滤…' : 'Filter by agent name, role, prompt…'}
          className="w-full bg-[#141822] text-xs text-zinc-200 pl-8 pr-7 py-1 rounded-md border border-[#232938] focus:outline-none focus:border-sky-500/70 transition-colors placeholder:text-zinc-600"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )

  // Body content: Tree Tab vs Stream Tab
  const content = (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 bg-[#0a0c10] text-xs select-none">
      {activeTab === 'tree' ? (
        <div className="space-y-4">
          {/* 1. Master Root Node */}
          <div className="rounded-xl border border-sky-800/50 bg-[#121622] p-3 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-900/60 border border-sky-600/60 flex items-center justify-center text-sky-200 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-zinc-100 text-xs">
                      {topologyData.rootNode.name}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-sky-950/80 text-sky-300 border border-sky-800/60">
                      Master Orchestrator
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Cpu className="w-2.5 h-2.5 text-zinc-500" />
                      {topologyData.rootNode.model}
                    </span>
                    <span>·</span>
                    <span className="truncate max-w-[200px]">{topologyData.rootNode.taskDescription}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {topologyData.rootNode.status === 'running' ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-700/60 text-[10px] font-mono">
                    <RunningIndicatorDots />
                    <span>Active</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 text-[10px] font-mono">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Ready</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 2. Subagent Branching Tree */}
          {filteredNodes.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-500 gap-2 border border-dashed border-[#1e232e] rounded-xl">
              <Network className="w-8 h-8 text-zinc-600 stroke-[1.5]" />
              <p className="text-xs">
                {topologyData.totalCount === 0
                  ? isZh
                    ? '当前会话尚未派发子智能体任务'
                    : 'No subagent tasks dispatched in current session'
                  : isZh
                  ? '未找到符合过滤条件的子智能体'
                  : 'No subagents matched your filter'}
              </p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-3">
              {/* Vertical connector rail */}
              <div className="absolute left-2.5 top-0 bottom-4 w-0.5 bg-gradient-to-b from-sky-500/60 via-[#263044] to-transparent pointer-events-none" />

              {filteredNodes.map((node) => {
                const isExpanded = expandedNodes[node.id] ?? true
                const isRunning = node.status === 'running' || node.status === 'pending'
                const isError = node.status === 'error'

                return (
                  <div key={node.id} className="relative group/node">
                    {/* Horizontal rail connector to node */}
                    <div className="absolute -left-3.5 top-4 w-3.5 h-0.5 bg-[#2a3449] pointer-events-none" />

                    <div
                      className={`rounded-xl border transition-all overflow-hidden ${
                        isRunning
                          ? 'border-sky-500/70 bg-[#0f1420] shadow-[0_0_16px_rgba(56,189,248,0.15)] ring-1 ring-sky-500/30'
                          : isError
                          ? 'border-rose-800/60 bg-[#160f14]'
                          : 'border-[#232938] bg-[#11141c] hover:border-zinc-700'
                      }`}
                    >
                      {/* Node Header Row */}
                      <div
                        onClick={() => toggleNodeExpand(node.id)}
                        className="px-3 py-2 flex items-center justify-between gap-2 cursor-pointer select-none bg-[#141824]/60 hover:bg-[#181d2c]/80 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Status Icon */}
                          <div className="shrink-0">
                            {isRunning ? (
                              <RunningIndicatorDots />
                            ) : isError ? (
                              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-zinc-100 text-xs truncate">
                                {node.name}
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-800/80 text-zinc-300 border border-zinc-700/60 shrink-0">
                                {node.role}
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 shrink-0">
                                {node.model}
                              </span>
                            </div>

                            <p className="text-[11px] text-zinc-400 truncate mt-0.5 max-w-[280px]">
                              {node.taskDescription}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {formatTopologyDuration(node.durationMs)}
                          </span>

                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                          )}
                        </div>
                      </div>

                      {/* Node Expanded Detail Drawer */}
                      {isExpanded && (
                        <div className="px-3 py-2.5 space-y-2 border-t border-[#1e2330] bg-[#0c0f16] text-[11px]">
                          {/* Prompt Section */}
                          {node.prompt && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-zinc-400 text-[10px] font-semibold">
                                <span className="flex items-center gap-1">
                                  <Send className="w-2.5 h-2.5 text-sky-400" />
                                  {isZh ? '派发指令 (Dispatch Prompt)' : 'Dispatch Prompt'}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleCopyText(node.prompt, `prompt_${node.id}`)
                                  }}
                                  className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded cursor-pointer"
                                  title={isZh ? '复制指令' : 'Copy prompt'}
                                >
                                  {copiedId === `prompt_${node.id}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                              <div className="p-2 rounded-lg bg-[#12151f] border border-[#212634] text-zinc-300 font-mono text-[10px] max-h-24 overflow-y-auto leading-relaxed select-text">
                                {node.prompt}
                              </div>
                            </div>
                          )}

                          {/* Result / Output Section */}
                          {(node.cleanResult || node.rawOutput) && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-zinc-400 text-[10px] font-semibold">
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                  {isZh ? '执行汇报 (Execution Result)' : 'Execution Result'}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleCopyText(node.cleanResult || node.rawOutput, `res_${node.id}`)
                                  }}
                                  className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded cursor-pointer"
                                  title={isZh ? '复制结果' : 'Copy result'}
                                >
                                  {copiedId === `res_${node.id}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                              <div className="p-2 rounded-lg bg-[#12151f] border border-[#212634] text-zinc-300 font-mono text-[10px] max-h-36 overflow-y-auto leading-relaxed select-text whitespace-pre-wrap">
                                {node.cleanResult || node.rawOutput}
                              </div>
                            </div>
                          )}

                          {/* Action Footers: Launch SubagentSessionModal if toolPart exists */}
                          <div className="pt-1.5 flex items-center justify-between text-[10px] text-zinc-500">
                            <span>ID: {node.sessionId || node.taskId || node.partId || node.id}</span>
                            {(node.sessionId || node.toolPart) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedModalNode(node)
                                }}
                                className="flex items-center gap-1 px-2 py-1 rounded bg-sky-950/70 hover:bg-sky-900 border border-sky-700/60 text-sky-200 hover:text-white transition-colors cursor-pointer"
                              >
                                <span>{isZh ? '查看子会话详情' : 'Inspect Subagent'}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* Stream Tab: Inter-agent Packet Stream */
        <div ref={streamScrollRef} className="space-y-2.5">
          {filteredCommunications.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-500 gap-2 border border-dashed border-[#1e232e] rounded-xl">
              <MessageSquare className="w-8 h-8 text-zinc-600 stroke-[1.5]" />
              <p className="text-xs">
                {isZh ? '暂无智能体间通讯数据包' : 'No inter-agent communication packets recorded'}
              </p>
            </div>
          ) : (
            filteredCommunications.map((comm) => {
              const isDispatch = comm.direction === 'dispatch'
              const timeStr = new Date(comm.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })

              return (
                <div
                  key={comm.id}
                  className="rounded-xl border border-[#212634] bg-[#10131a] p-2.5 shadow-sm space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
                      <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-medium">
                        {comm.sourceName}
                      </span>
                      <ArrowRight className="w-2.5 h-2.5 text-sky-400" />
                      <span className="px-1.5 py-0.2 rounded bg-sky-950/80 text-sky-300 border border-sky-800/60 font-medium">
                        {comm.targetName}
                      </span>
                      <span
                        className={`px-1 py-0.2 rounded text-[9px] uppercase font-semibold ${
                          isDispatch
                            ? 'bg-blue-950 text-blue-300'
                            : 'bg-emerald-950 text-emerald-300'
                        }`}
                      >
                        {isDispatch ? 'Dispatch' : 'Report'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                      <span>{timeStr}</span>
                      {comm.durationMs !== undefined && (
                        <span>({formatTopologyDuration(comm.durationMs)})</span>
                      )}
                    </div>
                  </div>

                  <p className="font-semibold text-zinc-200 text-xs">{comm.title}</p>

                  {comm.content && (
                    <div className="p-2 rounded-lg bg-[#0a0c10] border border-[#1b202c] text-zinc-300 font-mono text-[10px] max-h-24 overflow-y-auto leading-relaxed select-text whitespace-pre-wrap">
                      {comm.content}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )

  // Floating modal vs Docked right sidebar drawer
  if (isFloating) {
    return (
      <>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !selectedModalNode) onClose()
          }}
        >
          <div
            className="flex flex-col bg-[#0c0d10] border border-[#272d3b] overflow-hidden min-w-0"
            role="dialog"
            aria-modal="true"
            aria-label="Subagent Topology Inspector"
            style={{
              width: 'min(90vw, 880px)',
              height: 'min(86vh, 850px)',
              borderRadius: '12px',
              boxShadow: '0 20px 48px rgba(0, 0, 0, 0.55)',
            }}
          >
            {header}
            {controlsBar}
            {content}
          </div>
        </div>

        {selectedModalNode && (
          <SubagentSessionModal
            isOpen={true}
            onClose={() => setSelectedModalNode(null)}
            sessionId={selectedModalNode.sessionId || selectedModalNode.taskId || selectedModalNode.partId || selectedModalNode.id}
            subagentType={selectedModalNode.subagentType}
            modelLabel={selectedModalNode.model}
            taskDescription={selectedModalNode.taskDescription}
          />
        )}
      </>
    )
  }

  return (
    <>
      <aside
        className="fixed inset-y-0 right-0 z-40 w-[420px] max-w-[92vw] flex flex-col border-l border-[#232938] bg-[#0c0d10]/98 backdrop-blur-md shadow-2xl transition-transform duration-200 ease-out"
        role="dialog"
        aria-label="Subagent Topology Inspector"
      >
        {header}
        {controlsBar}
        {content}
      </aside>

      {selectedModalNode && (
        <SubagentSessionModal
          isOpen={true}
          onClose={() => setSelectedModalNode(null)}
          sessionId={selectedModalNode.sessionId || selectedModalNode.taskId || selectedModalNode.partId || selectedModalNode.id}
          subagentType={selectedModalNode.subagentType}
          modelLabel={selectedModalNode.model}
          taskDescription={selectedModalNode.taskDescription}
        />
      )}
    </>
  )
}
