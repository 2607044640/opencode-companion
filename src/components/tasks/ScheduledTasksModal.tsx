import { useState, useEffect, useCallback } from 'react'
import {
  Clock,
  Plus,
  Play,
  Trash2,
  X,
  RotateCw,
  Folder,
  Bot,
  Power,
} from 'lucide-react'
import type { Project } from '../../types/opencode'
import {
  type ScheduledTask,
  type ScheduleType,
  getScheduledTasks,
  addScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  formatCountdown,
} from '../../utils/scheduler'
import { matchCanonicalWorkspace } from '../../services/api'
import { useI18n } from '../../utils/i18n'

interface ScheduledTasksModalProps {
  isOpen: boolean
  onClose: () => void
  projects: Project[]
  onRunTaskNow?: (task: ScheduledTask) => Promise<void>
}

export function ScheduledTasksModal({
  isOpen,
  onClose,
  projects,
  onRunTaskNow,
}: ScheduledTasksModalProps) {
  const { lang } = useI18n()
  const isZh = lang === 'zh-CN'

  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [isCreating, setIsCreating] = useState<boolean>(false)
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null)

  // Form State
  const [formTitle, setFormTitle] = useState('')
  const [formPrompt, setFormPrompt] = useState('')
  const [formType, setFormType] = useState<ScheduleType>('once')
  const [formDelayMinutes, setFormDelayMinutes] = useState(60)
  const [formDailyTime, setFormDailyTime] = useState('09:00')
  const [formIntervalMinutes, setFormIntervalMinutes] = useState(120)
  const [formCronExpr, setFormCronExpr] = useState('0 9 * * *')
  const [formDirectory, setFormDirectory] = useState<string>('')
  const [formAgent, setFormAgent] = useState<string>('build')

  const canonicalProjects = projects.filter(
    (p) => p.id !== 'global' && Boolean(matchCanonicalWorkspace(p.worktree, p.name))
  )

  const reloadTasks = useCallback(() => {
    setTasks(getScheduledTasks())
  }, [])

  useEffect(() => {
    if (isOpen) {
      reloadTasks()
      setIsCreating(false)
      if (canonicalProjects.length > 0 && !formDirectory) {
        setFormDirectory(canonicalProjects[0].worktree)
      }
    }
  }, [isOpen, reloadTasks])

  // Live timer tick for countdowns
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now())
  useEffect(() => {
    if (!isOpen) return
    const interval = setInterval(() => setNowTimestamp(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [isOpen])

  // Esc hotkey
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCreating) {
          setIsCreating(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isCreating, onClose])

  if (!isOpen) return null

  const handleApplyPreset = (preset: '1hour' | 'daily9' | 'interval2h') => {
    setIsCreating(true)
    if (preset === '1hour') {
      setFormTitle(isZh ? '1 小时后自动巡检' : 'Auto-inspect in 1 hour')
      setFormPrompt(isZh ? '请检查当前工程最新改动与运行状态，输出检查结果。' : 'Please check current project modifications and status.')
      setFormType('once')
      setFormDelayMinutes(60)
    } else if (preset === 'daily9') {
      setFormTitle(isZh ? '每天 09:00 每日晨检' : 'Daily 09:00 Morning Check')
      setFormPrompt(isZh ? '每日健康巡检：检查代码仓库、定时备份与最新依赖。' : 'Daily health check: repository, backups, and dependencies.')
      setFormType('daily')
      setFormDailyTime('09:00')
    } else if (preset === 'interval2h') {
      setFormTitle(isZh ? '每 2 小时定时自检' : 'Self-check every 2 hours')
      setFormPrompt(isZh ? '定时自检系统状态与活跃任务进度。' : 'Periodic self-check of system state and active tasks.')
      setFormType('interval')
      setFormIntervalMinutes(120)
    }
  }

  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim() || !formPrompt.trim()) return

    addScheduledTask({
      title: formTitle.trim(),
      prompt: formPrompt.trim(),
      directory: formDirectory || canonicalProjects[0]?.worktree,
      agent: formAgent || 'build',
      scheduleType: formType,
      delayMs: formDelayMinutes * 60_000,
      dailyTime: formDailyTime,
      intervalMinutes: formIntervalMinutes,
      cronExpr: formCronExpr,
      enabled: true,
    })

    setIsCreating(false)
    setFormTitle('')
    setFormPrompt('')
    reloadTasks()
  }

  const handleToggleEnable = (task: ScheduledTask) => {
    updateScheduledTask(task.id, { enabled: !task.enabled })
    reloadTasks()
  }

  const handleDelete = (task: ScheduledTask) => {
    if (confirm(isZh ? `确定要删除任务 "${task.title}" 吗？` : `Delete scheduled task "${task.title}"?`)) {
      deleteScheduledTask(task.id)
      reloadTasks()
    }
  }

  const handleRunNow = async (task: ScheduledTask) => {
    if (!onRunTaskNow) return
    try {
      setRunningTaskId(task.id)
      await onRunTaskNow(task)
      reloadTasks()
    } catch (err) {
      console.error('Failed to run scheduled task manually:', err)
    } finally {
      setRunningTaskId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl border border-[#272a30] bg-[#111317] text-[#e6edf3] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#21242b] bg-[#14171d]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#f0f6fc]">
                {isZh ? '计划任务 (Scheduled Tasks)' : 'Scheduled Tasks'}
              </h2>
              <p className="text-[11px] text-[#8b949e]">
                {isZh
                  ? '支持定时执行、延时任务（如1小时后）与每日自动调度（如每天09:00）'
                  : 'Automated task scheduling, delayed runs (e.g. in 1 hour), and daily recurring jobs (e.g. 09:00 AM)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isCreating && (
              <button
                onClick={() => {
                  setIsCreating(true)
                  setFormTitle('')
                  setFormPrompt('')
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium transition-colors shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isZh ? '新建任务' : 'New Task'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21242b] rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Quick Presets Banner */}
          {!isCreating && (
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-[#21242b] bg-[#161920]">
              <span className="text-xs font-medium text-[#8b949e] flex items-center gap-1 mr-1">
                <RotateCw className="w-3 h-3 text-orange-400" />
                {isZh ? '常用预设：' : 'Quick Presets:'}
              </span>
              <button
                onClick={() => handleApplyPreset('1hour')}
                className="px-2.5 py-1 text-xs rounded bg-[#1f232b] hover:bg-[#2b313c] text-zinc-200 border border-[#2c313a] transition-colors cursor-pointer"
              >
                ⏱ {isZh ? '1 小时后执行' : 'In 1 Hour'}
              </button>
              <button
                onClick={() => handleApplyPreset('daily9')}
                className="px-2.5 py-1 text-xs rounded bg-[#1f232b] hover:bg-[#2b313c] text-zinc-200 border border-[#2c313a] transition-colors cursor-pointer"
              >
                📅 {isZh ? '每天 09:00 晨检' : 'Daily at 09:00 AM'}
              </button>
              <button
                onClick={() => handleApplyPreset('interval2h')}
                className="px-2.5 py-1 text-xs rounded bg-[#1f232b] hover:bg-[#2b313c] text-zinc-200 border border-[#2c313a] transition-colors cursor-pointer"
              >
                🔄 {isZh ? '每 2 小时自检' : 'Every 2 Hours'}
              </button>
            </div>
          )}

          {/* Creation / Edit Form */}
          {isCreating ? (
            <form onSubmit={handleSaveTask} className="p-4 rounded-xl border border-orange-500/30 bg-[#161920] space-y-4">
              <div className="flex items-center justify-between border-b border-[#262a34] pb-2">
                <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
                  {isZh ? '配置新定时任务' : 'Configure New Scheduled Task'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-xs text-[#8b949e] hover:text-[#f0f6fc]"
                >
                  {isZh ? '取消' : 'Cancel'}
                </button>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">
                  {isZh ? '任务名称' : 'Task Title'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={isZh ? '例如：自动化每日构建与巡检' : 'e.g. Automated daily build & inspection'}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-[#111317] border border-[#272a30] text-xs text-[#f0f6fc] px-3 py-2 rounded-md focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Schedule Type Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#8b949e] mb-1">
                    {isZh ? '调度方式' : 'Schedule Type'}
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as ScheduleType)}
                    className="w-full bg-[#111317] border border-[#272a30] text-xs text-[#f0f6fc] px-3 py-2 rounded-md focus:outline-none focus:border-orange-500"
                  >
                    <option value="once">{isZh ? '延迟单次执行 (Once / Delay)' : 'Run Once / Delay'}</option>
                    <option value="daily">{isZh ? '每日固定时间 (Daily Recurring)' : 'Daily Recurring'}</option>
                    <option value="interval">{isZh ? '固定循环间隔 (Interval)' : 'Interval'}</option>
                    <option value="cron">{isZh ? 'Cron 表达式 (Advanced Cron)' : 'Advanced Cron'}</option>
                  </select>
                </div>

                {/* Specific trigger parameter */}
                <div>
                  {formType === 'once' && (
                    <>
                      <label className="block text-xs text-[#8b949e] mb-1">
                        {isZh ? '执行延时 (分钟)' : 'Delay (Minutes)'}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="10080"
                          value={formDelayMinutes}
                          onChange={(e) => setFormDelayMinutes(parseInt(e.target.value, 10) || 60)}
                          className="flex-1 bg-[#111317] border border-[#272a30] text-xs text-[#f0f6fc] px-3 py-2 rounded-md focus:outline-none focus:border-orange-500"
                        />
                        <span className="text-xs text-zinc-400">
                          {formDelayMinutes === 60 ? (isZh ? '1 小时后' : '1 hr') : `${formDelayMinutes}m`}
                        </span>
                      </div>
                    </>
                  )}

                  {formType === 'daily' && (
                    <>
                      <label className="block text-xs text-[#8b949e] mb-1">
                        {isZh ? '每日执行时间 (HH:MM)' : 'Daily Run Time (HH:MM)'}
                      </label>
                      <input
                        type="time"
                        value={formDailyTime}
                        onChange={(e) => setFormDailyTime(e.target.value)}
                        className="w-full bg-[#111317] border border-[#272a30] text-xs text-[#f0f6fc] px-3 py-2 rounded-md focus:outline-none focus:border-orange-500"
                      />
                    </>
                  )}

                  {formType === 'interval' && (
                    <>
                      <label className="block text-xs text-[#8b949e] mb-1">
                        {isZh ? '循环间隔 (分钟)' : 'Interval (Minutes)'}
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="1440"
                        value={formIntervalMinutes}
                        onChange={(e) => setFormIntervalMinutes(parseInt(e.target.value, 10) || 60)}
                        className="w-full bg-[#111317] border border-[#272a30] text-xs text-[#f0f6fc] px-3 py-2 rounded-md focus:outline-none focus:border-orange-500"
                      />
                    </>
                  )}

                  {formType === 'cron' && (
                    <>
                      <label className="block text-xs text-[#8b949e] mb-1">
                        {isZh ? 'Cron 表达式 (分 时 日 月 周)' : 'Cron Expression (min hour dom month dow)'}
                      </label>
                      <input
                        type="text"
                        placeholder="0 9 * * *"
                        value={formCronExpr}
                        onChange={(e) => setFormCronExpr(e.target.value)}
                        className="w-full bg-[#111317] border border-[#272a30] text-xs text-[#f0f6fc] px-3 py-2 rounded-md focus:outline-none focus:border-orange-500 font-mono"
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Target Project / Directory & Agent */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#8b949e] mb-1">
                    {isZh ? '绑定工程工作区' : 'Target Workspace'}
                  </label>
                  <select
                    value={formDirectory}
                    onChange={(e) => setFormDirectory(e.target.value)}
                    className="w-full bg-[#111317] border border-[#272a30] text-xs text-[#f0f6fc] px-3 py-2 rounded-md focus:outline-none focus:border-orange-500"
                  >
                    {canonicalProjects.map((p) => {
                      const canonical = matchCanonicalWorkspace(p.worktree, p.name)
                      return (
                        <option key={p.id} value={p.worktree}>
                          {canonical?.name || p.name || p.worktree}
                        </option>
                      )
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[#8b949e] mb-1">
                    {isZh ? '执行智能体 (Agent)' : 'Primary Agent'}
                  </label>
                  <select
                    value={formAgent}
                    onChange={(e) => setFormAgent(e.target.value)}
                    className="w-full bg-[#111317] border border-[#272a30] text-xs text-[#f0f6fc] px-3 py-2 rounded-md focus:outline-none focus:border-orange-500"
                  >
                    <option value="build">build</option>
                    <option value="plan">plan</option>
                    <option value="scout">scout</option>
                  </select>
                </div>
              </div>

              {/* Prompt Textarea */}
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">
                  {isZh ? '执行指令 (Prompt)' : 'Execution Prompt'}
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder={isZh ? '在此输入触发时自动发送给 OpenCode 的 Prompt 指令...' : 'Enter the prompt instruction to dispatch automatically to OpenCode...'}
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  className="w-full bg-[#111317] border border-[#272a30] text-xs text-[#f0f6fc] p-3 rounded-md focus:outline-none focus:border-orange-500 font-sans"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-[#21242b] transition-colors"
                >
                  {isZh ? '取消' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium transition-colors shadow-sm cursor-pointer"
                >
                  {isZh ? '保存并启动任务' : 'Save & Schedule Task'}
                </button>
              </div>
            </form>
          ) : null}

          {/* Task List */}
          <div className="space-y-2.5">
            {tasks.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-[#242832] rounded-xl">
                <Clock className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-xs text-zinc-400 mb-1">
                  {isZh ? '暂无已配置的计划任务' : 'No scheduled tasks configured'}
                </p>
                <p className="text-[11px] text-zinc-600">
                  {isZh ? '点击上方预设或“新建任务”即可开启自动化调度' : 'Click a preset above or "New Task" to create one.'}
                </p>
              </div>
            ) : (
              tasks.map((task) => {
                const isRunning = runningTaskId === task.id
                const countdown = formatCountdown(task.nextRun, nowTimestamp, isZh)
                const dirName = task.directory ? task.directory.split('/').filter(Boolean).pop() || task.directory : 'Default'

                return (
                  <div
                    key={task.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border transition-all ${
                      task.enabled
                        ? 'border-[#292e39] bg-[#14171d] hover:border-orange-500/40'
                        : 'border-[#1f2229] bg-[#0e1014] opacity-60'
                    }`}
                  >
                    <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            task.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                          }`}
                        />
                        <h3 className="text-xs font-medium text-[#f0f6fc] truncate">
                          {task.title}
                        </h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono border border-zinc-700">
                          {task.scheduleType === 'once'
                            ? (isZh ? '单次' : 'Once')
                            : task.scheduleType === 'daily'
                            ? (isZh ? `每天 ${task.dailyTime || '09:00'}` : `Daily ${task.dailyTime || '09:00'}`)
                            : task.scheduleType === 'interval'
                            ? (isZh ? `每 ${task.intervalMinutes}m` : `Every ${task.intervalMinutes}m`)
                            : 'Cron'}
                        </span>
                      </div>

                      <p className="text-[11px] text-zinc-400 line-clamp-1 font-mono bg-[#0c0d10] px-2 py-1 rounded border border-[#1a1d24]">
                        {task.prompt}
                      </p>

                      <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Folder className="w-3 h-3 text-zinc-400" />
                          {dirName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Bot className="w-3 h-3 text-zinc-400" />
                          {task.agent || 'build'}
                        </span>
                        <span className="flex items-center gap-1 text-orange-400 font-medium">
                          <Clock className="w-3 h-3" />
                          {task.enabled ? countdown : (isZh ? '已停用' : 'Paused')}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#21242b]">
                      <button
                        onClick={() => handleRunNow(task)}
                        disabled={isRunning}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md bg-[#1d222b] hover:bg-orange-600 hover:text-white text-zinc-300 transition-colors border border-zinc-700 cursor-pointer disabled:opacity-50"
                        title={isZh ? '立即触发执行一次' : 'Trigger execution immediately'}
                      >
                        {isRunning ? (
                          <RotateCw className="w-3.5 h-3.5 animate-spin text-orange-400" />
                        ) : (
                          <Play className="w-3.5 h-3.5 text-orange-400" />
                        )}
                        <span>{isZh ? '立即执行' : 'Run Now'}</span>
                      </button>

                      <button
                        onClick={() => handleToggleEnable(task)}
                        className={`p-1.5 rounded-md text-xs border transition-colors cursor-pointer ${
                          task.enabled
                            ? 'text-emerald-400 border-emerald-800/60 bg-emerald-950/30 hover:bg-emerald-950/60'
                            : 'text-zinc-500 border-zinc-800 bg-zinc-900 hover:text-zinc-300'
                        }`}
                        title={task.enabled ? (isZh ? '点击暂停调度' : 'Click to pause') : (isZh ? '点击启用调度' : 'Click to enable')}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDelete(task)}
                        className="p-1.5 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors border border-transparent hover:border-rose-900 cursor-pointer"
                        title={isZh ? '删除任务' : 'Delete task'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
