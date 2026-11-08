import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Terminal,
  X,
  Square,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  Search,
  ArrowDown,
  Send,
  Clock,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import type { Message } from '../../types/opencode'
import {
  extractBackgroundTasks,
  formatTaskDuration,
} from '../../utils/background-tasks'
import { useI18n } from '../../utils/i18n'

export interface BackgroundTasksModalProps {
  isOpen: boolean
  onClose: () => void
  activeSessionId?: string | null
  activeSessionTitle?: string
  messages?: Message[]
  onAbortSession?: (sessionId?: string) => Promise<void> | void
  onSendInput?: (input: string) => Promise<void> | void
}

export function BackgroundTasksModal({
  isOpen,
  onClose,
  activeSessionId = '',
  activeSessionTitle = 'Current Session',
  messages = [],
  onAbortSession,
  onSendInput,
}: BackgroundTasksModalProps) {
  const { lang } = useI18n()
  const isZh = lang === 'zh-CN'

  const [activeTab, setActiveTab] = useState<'all' | 'running' | 'completed'>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [copiedLog, setCopiedLog] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  const [terminalSearch, setTerminalSearch] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [inputVal, setInputVal] = useState('')
  const [isMaximized, setIsMaximized] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const terminalViewportRef = useRef<HTMLDivElement>(null)

  // Live timer tick for running tasks duration
  useEffect(() => {
    if (!isOpen) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [isOpen])

  // Extract tasks from messages
  const allTasks = useMemo(() => {
    return extractBackgroundTasks(messages, activeSessionId || '', activeSessionTitle || '')
  }, [messages, activeSessionId, activeSessionTitle])

  // Running tasks count
  const runningCount = useMemo(() => {
    return allTasks.filter((t) => t.status === 'running' || t.status === 'pending').length
  }, [allTasks])

  // Filter tasks based on activeTab and searchFilter
  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (activeTab === 'running' && t.status !== 'running' && t.status !== 'pending') return false
      if (activeTab === 'completed' && t.status !== 'completed' && t.status !== 'error') return false
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase()
        return (
          t.command.toLowerCase().includes(q) ||
          t.tool.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [allTasks, activeTab, searchFilter])

  // Select first task by default
  useEffect(() => {
    if (filteredTasks.length > 0) {
      if (!selectedTaskId || !filteredTasks.some((t) => t.id === selectedTaskId)) {
        // Prefer running task if exists
        const running = filteredTasks.find((t) => t.status === 'running' || t.status === 'pending')
        setSelectedTaskId(running ? running.id : filteredTasks[0].id)
      }
    } else {
      setSelectedTaskId(null)
    }
  }, [filteredTasks, selectedTaskId])

  const selectedTask = useMemo(() => {
    return allTasks.find((t) => t.id === selectedTaskId) || null
  }, [allTasks, selectedTaskId])

  // Auto scroll terminal log to bottom
  useEffect(() => {
    if (autoScroll && terminalViewportRef.current) {
      terminalViewportRef.current.scrollTop = terminalViewportRef.current.scrollHeight
    }
  }, [selectedTask?.output, autoScroll])

  // Esc hotkey
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Copy terminal logs
  const handleCopyLogs = async () => {
    if (!selectedTask?.output) return
    try {
      await navigator.clipboard.writeText(selectedTask.output)
      setCopiedLog(true)
      setTimeout(() => setCopiedLog(false), 1500)
    } catch (err) {
      console.error('Failed to copy terminal log:', err)
    }
  }

  // Send input to terminal / session
  const handleSend = () => {
    const trimmed = inputVal.trim()
    if (!trimmed) return
    if (onSendInput) {
      onSendInput(trimmed)
    }
    setInputVal('')
  }

  // Kill running task / abort
  const handleKill = () => {
    if (selectedTask?.status === 'running' || selectedTask?.status === 'pending') {
      if (onAbortSession) {
        onAbortSession(selectedTask.sessionId)
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className={`bg-[#0f1117] border border-[#232733] rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isMaximized ? 'w-full h-full' : 'w-full max-w-5xl h-[85vh] max-h-[820px]'
        }`}
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#202430] bg-[#12151e] select-none shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-sky-950/70 border border-sky-800/60 flex items-center justify-center text-sky-400 shadow-sm">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-100">
                  {isZh ? '后台常驻任务与终端监控' : 'Background Tasks & Terminal Monitor'}
                </h2>
                {runningCount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-sky-950/80 text-sky-300 border border-sky-700/60 flex items-center gap-1.5 shadow-[0_0_8px_rgba(56,189,248,0.4)] animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    <span>{runningCount} {isZh ? '运行中' : 'Running'}</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-400 bg-zinc-800/80 border border-zinc-700/50">
                    {allTasks.length} {isZh ? '任务' : 'Tasks'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 truncate max-w-md mt-0.5">
                {isZh
                  ? '实时监控 Agent 长耗时编译、测试、构建与服务进程，提供动态终端日志流与进程控制。'
                  : 'Monitor live compiler, test runs, and background service processes with dynamic logs.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors cursor-pointer"
              title={isMaximized ? (isZh ? '还原窗口' : 'Restore') : (isZh ? '最大化' : 'Maximize')}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
              title={isZh ? '关闭 (Esc)' : 'Close (Esc)'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Main Split View: Left List, Right Console */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left: Task List Pane */}
          <div className="w-72 sm:w-80 border-r border-[#202430] bg-[#10131b] flex flex-col shrink-0 select-none">
            {/* Filter Tabs */}
            <div className="p-2.5 border-b border-[#202430] flex items-center justify-between gap-1">
              <div className="flex items-center bg-[#151923] p-0.5 rounded-lg border border-[#272d3b] text-xs w-full">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    activeTab === 'all'
                      ? 'bg-sky-950/70 text-sky-300 border border-sky-800/50 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {isZh ? '全部' : 'All'} ({allTasks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('running')}
                  className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    activeTab === 'running'
                      ? 'bg-sky-950/70 text-sky-300 border border-sky-800/50 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {isZh ? '运行中' : 'Running'} ({runningCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('completed')}
                  className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    activeTab === 'completed'
                      ? 'bg-sky-950/70 text-sky-300 border border-sky-800/50 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {isZh ? '已完成' : 'Done'} ({allTasks.length - runningCount})
                </button>
              </div>
            </div>

            {/* Search Input for Tasks */}
            <div className="p-2 border-b border-[#202430]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder={isZh ? '搜索任务指令…' : 'Filter commands…'}
                  className="w-full bg-[#151923] text-zinc-200 text-xs pl-8 pr-2.5 py-1.5 rounded-lg border border-[#252b38] focus:outline-none focus:border-sky-500/70 transition-colors placeholder:text-zinc-500"
                />
              </div>
            </div>

            {/* Task Cards Scroll List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {filteredTasks.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 text-xs">
                  <Terminal className="w-6 h-6 mx-auto mb-2 text-zinc-600 opacity-60" />
                  <p>{isZh ? '暂无符合条件的后台任务' : 'No tasks match filter'}</p>
                </div>
              ) : (
                filteredTasks.map((t) => {
                  const isSelected = t.id === selectedTaskId
                  const isRunning = t.status === 'running' || t.status === 'pending'
                  const isError = t.status === 'error'
                  const liveDuration = isRunning ? Math.max(0, now - t.startTime) : t.durationMs

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTaskId(t.id)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer group flex flex-col gap-1.5 ${
                        isSelected
                          ? 'bg-[#181d28] border-sky-500/60 shadow-md text-zinc-100'
                          : 'bg-[#131620] border-[#1f2430] hover:bg-[#161a25] hover:border-zinc-700/50 text-zinc-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 w-full">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isRunning ? (
                            <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />
                          ) : isError ? (
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                          <span className="text-[11px] font-mono font-semibold uppercase text-sky-300/90 truncate">
                            {t.tool}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400 shrink-0 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 text-zinc-500" />
                          <span>{formatTaskDuration(liveDuration)}</span>
                        </span>
                      </div>

                      <div className="text-xs font-mono text-zinc-300 truncate w-full" title={t.command}>
                        {t.command}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-zinc-400 w-full pt-0.5 border-t border-zinc-800/40">
                        <span className="truncate max-w-[140px]">{t.sessionTitle}</span>
                        <span className="font-mono text-zinc-400">
                          {isRunning ? (isZh ? '运行中' : 'running') : t.status}
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Right: Dynamic Terminal Console Pane */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#08090d]">
            {selectedTask ? (
              <>
                {/* Console Top Bar */}
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#1c202a] bg-[#0c0e14] select-none shrink-0 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                    <span className="font-mono text-xs text-sky-300 font-semibold uppercase shrink-0">
                      [{selectedTask.tool}]
                    </span>
                    <span className="font-mono text-xs text-zinc-200 truncate" title={selectedTask.command}>
                      {selectedTask.command}
                    </span>
                  </div>

                  {/* Terminal Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Search inside terminal */}
                    <div className="relative hidden md:block">
                      <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-2" />
                      <input
                        type="text"
                        value={terminalSearch}
                        onChange={(e) => setTerminalSearch(e.target.value)}
                        placeholder={isZh ? '搜索输出…' : 'Search output…'}
                        className="bg-[#12141c] text-zinc-200 text-[11px] pl-7 pr-2 py-1 rounded border border-[#232733] focus:outline-none focus:border-sky-500/70 w-32 focus:w-44 transition-all"
                      />
                    </div>

                    {/* Auto scroll toggle */}
                    <button
                      type="button"
                      onClick={() => setAutoScroll((prev) => !prev)}
                      className={`p-1.5 rounded-md border text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                        autoScroll
                          ? 'bg-sky-950/60 border-sky-800/60 text-sky-300'
                          : 'bg-[#151923] border-[#252b38] text-zinc-400 hover:text-zinc-200'
                      }`}
                      title={isZh ? '自动滚动至底部' : 'Auto-scroll to bottom'}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline text-[10px] font-mono">
                        {isZh ? '跟随' : 'Auto'}
                      </span>
                    </button>

                    {/* Copy All Logs */}
                    <button
                      type="button"
                      onClick={handleCopyLogs}
                      className="p-1.5 rounded-md bg-[#151923] hover:bg-[#1c2230] border border-[#252b38] text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                      title={isZh ? '复制终端日志' : 'Copy terminal output'}
                    >
                      {copiedLog ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-[10px] text-emerald-400 hidden sm:inline">{isZh ? '已复制' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[10px] hidden sm:inline">{isZh ? '复制' : 'Copy'}</span>
                        </>
                      )}
                    </button>

                    {/* Kill Process (If running) */}
                    {(selectedTask.status === 'running' || selectedTask.status === 'pending') && (
                      <button
                        type="button"
                        onClick={handleKill}
                        className="px-2.5 py-1 rounded-md bg-rose-950/70 hover:bg-rose-900/90 border border-rose-800/60 text-rose-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                        title={isZh ? '中止此后台任务 (Kill Process)' : 'Kill background process'}
                      >
                        <Square className="w-3 h-3 fill-rose-400 text-rose-400" />
                        <span className="font-semibold text-[11px]">{isZh ? '中止' : 'Kill'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Terminal Viewport */}
                <div
                  ref={terminalViewportRef}
                  className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-zinc-300 selection:bg-sky-500/30 selection:text-white space-y-1"
                >
                  <div className="text-zinc-400 select-none pb-2 mb-2 border-b border-zinc-800/40 text-[11px] flex items-center justify-between">
                    <span>$ {selectedTask.command}</span>
                    <span>
                      {isZh ? '耗时' : 'Duration'}: {formatTaskDuration(selectedTask.durationMs)}
                    </span>
                  </div>

                  {selectedTask.output ? (
                    <pre className="whitespace-pre-wrap font-mono break-all font-normal text-zinc-200">
                      {terminalSearch.trim()
                        ? selectedTask.output
                            .split('\n')
                            .filter((line) => line.toLowerCase().includes(terminalSearch.toLowerCase()))
                            .join('\n')
                        : selectedTask.output}
                    </pre>
                  ) : (
                    <div className="py-8 text-zinc-400 italic text-center">
                      {selectedTask.status === 'running'
                        ? (isZh ? '⏳ 进程正在执行中，等待输出流…' : '⏳ Process executing, waiting for stdout/stderr…')
                        : (isZh ? '(无标准输出)' : '(No stdout/stderr output)')}
                    </div>
                  )}

                  {selectedTask.error && (
                    <div className="mt-2 p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs font-mono">
                      <div className="font-semibold mb-0.5">{isZh ? '错误与退出状态:' : 'Process Error:'}</div>
                      <pre className="whitespace-pre-wrap break-all">{selectedTask.error}</pre>
                    </div>
                  )}
                </div>

                {/* Terminal Input Delivery Footer (send_input) */}
                <div className="p-2.5 border-t border-[#1c202a] bg-[#0c0e14] shrink-0">
                  <div className="flex items-center gap-2 bg-[#12151e] border border-[#232733] focus-within:border-sky-500/70 focus-within:ring-1 focus-within:ring-sky-500/20 rounded-xl px-3 py-1.5 transition-all">
                    <span className="font-mono text-sky-400 select-none font-bold">$</span>
                    <input
                      type="text"
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSend()
                        }
                      }}
                      placeholder={
                        isZh
                          ? '输入指令或回复下发至终端 (send_input，按 Enter 发送)…'
                          : 'Send input or stdin text to process (Enter to send)…'
                      }
                      className="flex-1 bg-transparent text-zinc-100 font-mono text-xs focus:outline-none placeholder:text-zinc-500"
                    />
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!inputVal.trim()}
                      className="p-1 rounded-md text-sky-400 hover:text-white hover:bg-sky-950/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      title={isZh ? '下发输入' : 'Send input'}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 text-xs p-8 text-center space-y-3">
                <Terminal className="w-10 h-10 text-zinc-500" />
                <p>{isZh ? '请从左侧选择一个后台任务查看终端输出' : 'Select a background task from the list'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
