import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import {
  Bot,
  Sparkles,
  Terminal,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  Check,
  X,
  Shield,
  RefreshCw,
} from 'lucide-react'
import type { Message, TextPart, ReasoningPart, ToolPart } from '../../types/opencode'
import { api } from '../../services/api'

export interface SubagentStep {
  id: string
  stepNumber: number
  type: 'prompt' | 'thought' | 'tool' | 'response'
  role: 'user' | 'assistant'
  title: string
  subtitle?: string
  status?: 'completed' | 'running' | 'error' | 'pending'
  duration?: string
  content?: string
  toolData?: {
    tool: string
    input?: Record<string, any>
    output?: string
    error?: string
  }
}

export interface SubagentSessionModalProps {
  isOpen: boolean
  sessionId: string
  subagentType?: string
  modelLabel?: string
  taskDescription?: string
  onClose: () => void
}

/**
 * Normalizes and partitions subagent messages into structured timeline steps.
 */
export function parseSubagentMessages(messages: Message[]): SubagentStep[] {
  const steps: SubagentStep[] = []
  let stepIndex = 1

  for (let mIdx = 0; mIdx < messages.length; mIdx++) {
    const msg = messages[mIdx]
    const role = msg.info.role

    if (role === 'user') {
      const textParts = msg.parts.filter((p): p is TextPart => p.type === 'text')
      const textContent = textParts.map((p) => p.text).join('\n\n').trim()
      if (textContent) {
        steps.push({
          id: `step_${stepIndex++}_prompt_${mIdx}`,
          stepNumber: steps.length + 1,
          type: 'prompt',
          role: 'user',
          title: mIdx === 0 ? '子代理任务提示词 (Mission Prompt)' : '上下文/追问提示 (Context Prompt)',
          subtitle: textContent.split('\n')[0].slice(0, 80),
          content: textContent,
          status: 'completed',
        })
      }
      continue
    }

    if (role === 'assistant') {
      for (let pIdx = 0; pIdx < msg.parts.length; pIdx++) {
        const part = msg.parts[pIdx]

        if (part.type === 'reasoning') {
          const reasoning = part as ReasoningPart
          const text = reasoning.text?.trim()
          if (text) {
            let duration: string | undefined
            if (reasoning.time?.start && reasoning.time?.end) {
              const diffSec = (reasoning.time.end - reasoning.time.start) / 1000
              if (diffSec > 0) duration = `${diffSec.toFixed(1)}s`
            }
            steps.push({
              id: `step_${stepIndex++}_reasoning_${mIdx}_${pIdx}`,
              stepNumber: steps.length + 1,
              type: 'thought',
              role: 'assistant',
              title: '思考推演 (Reasoning & Thought)',
              subtitle: duration || `${text.length} 字符`,
              duration,
              content: text,
              status: 'completed',
            })
          }
        } else if (part.type === 'tool') {
          const toolPart = part as ToolPart
          const toolName = toolPart.tool || 'tool'
          const state = toolPart.state
          const status = state?.status || 'completed'
          const toolTitle = state?.title || toolName

          let duration: string | undefined
          if (state?.time?.start && state?.time?.end) {
            const diffSec = (state.time.end - state.time.start) / 1000
            if (diffSec > 0) duration = `${diffSec.toFixed(1)}s`
          }

          steps.push({
            id: `step_${stepIndex++}_tool_${mIdx}_${pIdx}`,
            stepNumber: steps.length + 1,
            type: 'tool',
            role: 'assistant',
            title: `工具执行: ${toolName}`,
            subtitle:
              toolTitle !== toolName
                ? toolTitle
                : state?.input
                ? JSON.stringify(state.input).slice(0, 80)
                : undefined,
            status,
            duration,
            toolData: {
              tool: toolName,
              input: state?.input,
              output: state?.output,
              error: state?.error,
            },
          })
        } else if (part.type === 'text') {
          const textPart = part as TextPart
          const text = textPart.text?.trim()
          if (text) {
            steps.push({
              id: `step_${stepIndex++}_response_${mIdx}_${pIdx}`,
              stepNumber: steps.length + 1,
              type: 'response',
              role: 'assistant',
              title: '子代理回传回复 (Subagent Response)',
              subtitle: `${text.length} 字符`,
              content: text,
              status: 'completed',
            })
          }
        }
      }
    }
  }

  return steps
}

/**
 * Formats all steps into a clean Markdown transcript for export.
 */
export function formatSubagentTranscript(
  steps: SubagentStep[],
  metadata: {
    sessionId: string
    subagentType?: string
    modelLabel?: string
    taskDescription?: string
  }
): string {
  let md = `# Subagent Execution Transcript\n\n`
  md += `- **Session ID:** \`${metadata.sessionId}\`\n`
  if (metadata.subagentType) md += `- **Subagent Type:** \`${metadata.subagentType}\`\n`
  if (metadata.modelLabel) md += `- **Model:** \`${metadata.modelLabel}\`\n`
  if (metadata.taskDescription) md += `- **Task Description:** ${metadata.taskDescription}\n`
  md += `- **Total Steps:** ${steps.length}\n\n---\n\n`

  for (const step of steps) {
    md += `### Step ${step.stepNumber}: ${step.title}\n`
    if (step.duration) md += `*Duration:* ${step.duration}\n\n`
    if (step.type === 'prompt' || step.type === 'response') {
      md += `${step.content}\n\n`
    } else if (step.type === 'thought') {
      md += `> ${step.content?.replace(/\n/g, '\n> ')}\n\n`
    } else if (step.type === 'tool' && step.toolData) {
      if (step.toolData.input) {
        md += `**Input:**\n\`\`\`json\n${JSON.stringify(step.toolData.input, null, 2)}\n\`\`\`\n\n`
      }
      if (step.toolData.output) {
        md += `**Output:**\n\`\`\`text\n${step.toolData.output}\n\`\`\`\n\n`
      }
      if (step.toolData.error) {
        md += `**Error:**\n\`\`\`text\n${step.toolData.error}\n\`\`\`\n\n`
      }
    }
    md += `---\n\n`
  }

  return md.trim()
}

/**
 * Floating Subagent Inspector Modal matching the Review/Diff modal architecture.
 * Provides a read-only floating window to inspect the subagent's full execution lifecycle.
 */
export function SubagentSessionModal({
  isOpen,
  sessionId,
  subagentType = 'explore',
  modelLabel,
  taskDescription,
  onClose,
}: SubagentSessionModalProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsedSteps, setCollapsedSteps] = useState<Record<string, boolean>>({})
  const [copiedTranscript, setCopiedTranscript] = useState(false)
  const [copiedSessionId, setCopiedSessionId] = useState(false)
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null)

  // Fetch subagent session messages
  const fetchMessages = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getMessages(sessionId)
      setMessages(data || [])
    } catch (err) {
      console.error('Failed to fetch subagent messages:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    if (isOpen && sessionId) {
      fetchMessages()
    }
  }, [isOpen, sessionId, fetchMessages])

  // Parse structured steps
  const steps = useMemo(() => parseSubagentMessages(messages), [messages])

  // Expand / collapse state logic
  const allCollapsed = useMemo(() => {
    if (steps.length === 0) return false
    return steps.every((s) => collapsedSteps[s.id] === true)
  }, [steps, collapsedSteps])

  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsedSteps({})
    } else {
      const next: Record<string, boolean> = {}
      for (const s of steps) {
        next[s.id] = true
      }
      setCollapsedSteps(next)
    }
  }

  const toggleStep = (stepId: string) => {
    setCollapsedSteps((prev) => ({
      ...prev,
      [stepId]: !prev[stepId],
    }))
  }

  // Handle keyboard shortcuts (Escape to close)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Lock body scroll while modal is active
  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen])

  const handleCopyTranscript = () => {
    const text = formatSubagentTranscript(steps, {
      sessionId,
      subagentType,
      modelLabel,
      taskDescription,
    })
    navigator.clipboard.writeText(text)
    setCopiedTranscript(true)
    setTimeout(() => setCopiedTranscript(false), 1500)
  }

  const handleCopySessionId = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(sessionId)
    setCopiedSessionId(true)
    setTimeout(() => setCopiedSessionId(false), 1500)
  }

  const handleCopyStepText = (stepId: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopiedStepId(stepId)
    setTimeout(() => setCopiedStepId(null), 1500)
  }

  // Subagent type badge style
  const getTypeBadgeStyle = (type: string) => {
    const t = type.toLowerCase()
    if (t.includes('explore')) return 'bg-blue-950/60 text-blue-300 border-blue-800/50'
    if (t.includes('plan')) return 'bg-purple-950/60 text-purple-300 border-purple-800/50'
    if (t.includes('exec') || t.includes('build')) return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50'
    if (t.includes('scout') || t.includes('research')) return 'bg-amber-950/60 text-amber-300 border-amber-800/50'
    return 'bg-cyan-950/60 text-cyan-300 border-cyan-800/50'
  }

  if (!isOpen || typeof document === 'undefined') return null

  // Header matching Review/Diff modal
  const header = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[#272a30] bg-[#121418]/90 select-none shrink-0">
      <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-1.5 text-cyan-400">
          <Bot className="w-4 h-4 shrink-0" />
          <span className="font-semibold text-xs text-zinc-100 font-mono tracking-tight shrink-0">
            Subagent Inspector
          </span>
        </div>
        <span className="text-zinc-600 shrink-0">|</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border shrink-0 ${getTypeBadgeStyle(subagentType)}`}>
          {subagentType}
        </span>
        {modelLabel && (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/60 text-purple-300 border border-purple-800/50 shrink-0 flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-purple-400" />
            <span>{modelLabel}</span>
          </span>
        )}
        <span className="px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800/60 text-emerald-400 font-mono text-[10px] font-medium shrink-0">
          {steps.length} {steps.length === 1 ? 'step' : 'steps'}
        </span>
        {taskDescription && (
          <span className="text-xs text-zinc-400 font-mono truncate ml-1 hidden md:inline" title={taskDescription}>
            {taskDescription}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={fetchMessages}
          disabled={loading}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors disabled:opacity-50"
          title="刷新子代理状态 (Refresh)"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
        <button
          type="button"
          onClick={toggleAll}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
          title={allCollapsed ? '全部展开 (Expand All)' : '全部折叠 (Collapse All)'}
        >
          <ChevronsUpDown className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleCopyTranscript}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
          title="复制子代理完整记录 (Copy Transcript)"
        >
          {copiedTranscript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
          title="关闭 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )

  // Body content
  const body = (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 bg-[#090a0c] min-w-0 space-y-3">
      {loading && steps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          <span className="text-xs font-mono">加载子代理执行记录中...</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <XCircle className="w-4 h-4 text-rose-400" />
            <span>获取子代理会话失败</span>
          </div>
          <div>{error}</div>
          <button
            type="button"
            onClick={fetchMessages}
            className="px-2.5 py-1 rounded bg-rose-900/60 hover:bg-rose-900 border border-rose-700/60 text-white transition-colors"
          >
            重试
          </button>
        </div>
      ) : steps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-2">
          <Bot className="w-8 h-8 opacity-40" />
          <span className="text-xs font-mono">当前子代理暂无执行记录</span>
        </div>
      ) : (
        steps.map((step) => {
          const isCollapsed = collapsedSteps[step.id] === true
          const stepCopyKey = `step_${step.id}`

          return (
            <div
              key={step.id}
              className="rounded-lg border border-[#232730] bg-[#0e1014] overflow-hidden shadow-sm transition-colors"
            >
              {/* Accordion Step Header */}
              <div
                onClick={() => toggleStep(step.id)}
                className="flex items-center justify-between px-3 py-2 bg-[#14171d] hover:bg-[#191d24] cursor-pointer select-none transition-colors border-b border-transparent"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                  {step.type === 'prompt' ? (
                    <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                  ) : step.type === 'thought' ? (
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : step.type === 'tool' ? (
                    <Terminal className="w-4 h-4 text-cyan-400 shrink-0" />
                  ) : (
                    <Bot className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}

                  <span className="font-semibold text-xs text-zinc-100 font-mono truncate">
                    {step.title}
                  </span>

                  {step.subtitle && (
                    <span className="text-[11px] font-mono text-zinc-500 truncate" title={step.subtitle}>
                      {step.subtitle}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {step.duration && (
                    <span className="text-[10px] font-mono text-zinc-400 px-1.5 py-0.2 rounded bg-zinc-800/80 border border-zinc-700/50">
                      {step.duration}
                    </span>
                  )}

                  {step.status === 'completed' ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </span>
                  ) : step.status === 'error' ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-rose-400">
                      <XCircle className="w-3.5 h-3.5" />
                    </span>
                  ) : step.status === 'running' || step.status === 'pending' ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-purple-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </span>
                  ) : null}

                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-400" />
                  )}
                </div>
              </div>

              {/* Accordion Step Body */}
              {!isCollapsed && (
                <div className="border-t border-[#232730] p-3 bg-[#090a0c] text-xs">
                  {/* 1. Prompt Step */}
                  {step.type === 'prompt' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span>输入任务提示词</span>
                        <button
                          type="button"
                          onClick={(e) => handleCopyStepText(stepCopyKey, step.content || '', e)}
                          className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          {copiedStepId === stepCopyKey ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>复制提示词</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="bg-[#07080a] border border-[#1e222b] rounded-md p-3 text-zinc-200 font-mono text-xs whitespace-pre-wrap leading-relaxed select-text">
                        {step.content}
                      </div>
                    </div>
                  )}

                  {/* 2. Thought Step */}
                  {step.type === 'thought' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-purple-300">
                        <div className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-purple-400" />
                          <span>模型思考推演</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleCopyStepText(stepCopyKey, step.content || '', e)}
                          className="flex items-center gap-1 text-purple-300/80 hover:text-purple-200 transition-colors"
                        >
                          {copiedStepId === stepCopyKey ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>复制思考</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="bg-[#0e0c15] border border-purple-900/30 rounded-md p-3 text-purple-200/90 font-mono text-xs whitespace-pre-wrap leading-relaxed select-text">
                        {step.content}
                      </div>
                    </div>
                  )}

                  {/* 3. Tool Step */}
                  {step.type === 'tool' && step.toolData && (
                    <div className="space-y-3 font-mono">
                      {step.toolData.input && (
                        <div>
                          <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                            <span className="text-zinc-400 font-semibold">参数输入 (Input)</span>
                            <button
                              type="button"
                              onClick={(e) =>
                                handleCopyStepText(
                                  `${stepCopyKey}_in`,
                                  JSON.stringify(step.toolData?.input, null, 2),
                                  e
                                )
                              }
                              className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                            >
                              {copiedStepId === `${stepCopyKey}_in` ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400">已复制</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>复制参数</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div className="bg-[#07080a] border border-[#1e222b] rounded p-2.5 text-zinc-300 overflow-x-auto max-h-[220px]">
                            <pre className="text-xs leading-relaxed">
                              {JSON.stringify(step.toolData.input, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}

                      {step.toolData.output && (
                        <div>
                          <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                            <span className="text-zinc-400 font-semibold">输出结果 (Output)</span>
                            <button
                              type="button"
                              onClick={(e) =>
                                handleCopyStepText(`${stepCopyKey}_out`, step.toolData?.output || '', e)
                              }
                              className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                            >
                              {copiedStepId === `${stepCopyKey}_out` ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400">已复制</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>复制结果</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div className="bg-[#07080a] border border-[#1e222b] rounded p-2.5 text-zinc-300 overflow-x-auto max-h-[320px]">
                            <pre className="text-xs leading-relaxed whitespace-pre-wrap">
                              {step.toolData.output}
                            </pre>
                          </div>
                        </div>
                      )}

                      {step.toolData.error && (
                        <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs">
                          <div className="font-semibold mb-1">错误信息 (Error):</div>
                          <pre className="whitespace-pre-wrap leading-relaxed">{step.toolData.error}</pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4. Response Step */}
                  {step.type === 'response' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span className="text-emerald-400 font-medium">回传回复</span>
                        <button
                          type="button"
                          onClick={(e) => handleCopyStepText(stepCopyKey, step.content || '', e)}
                          className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          {copiedStepId === stepCopyKey ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>复制回复</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="bg-[#07080a] border border-[#1e222b] rounded-md p-3.5 text-zinc-100 select-text prose prose-invert max-w-none text-xs leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                          {step.content || ''}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )

  // Footer with Esc hint and read-only notice
  const footer = (
    <div className="px-4 py-2 border-t border-[#1f2228] bg-[#0f1115] text-[11px] text-zinc-500 flex items-center justify-between select-none">
      <div className="flex items-center gap-2">
        <Shield className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span>按 Esc 或点击右上角关闭 · 只读子代理会话 (Read-only Subagent Inspector)</span>
      </div>
      <div className="flex items-center gap-2 font-mono">
        <span className="text-zinc-400" title={sessionId}>
          任务ID: {sessionId.slice(0, 18)}...
        </span>
        <button
          type="button"
          onClick={handleCopySessionId}
          className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
          title="复制会话 ID"
        >
          {copiedSessionId ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
      </div>
    </div>
  )

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex flex-col bg-[#0c0d0e] border border-[#272a30] overflow-hidden min-w-0"
        role="dialog"
        aria-modal="true"
        aria-label="Subagent Inspector"
        style={{
          width: 'min(90vw, 1100px)',
          height: 'min(88vh, 880px)',
          borderRadius: '12px',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.45)',
        }}
      >
        {header}
        {body}
        {footer}
      </div>
    </div>,
    document.body
  )
}
