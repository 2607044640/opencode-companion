import { useState, useEffect, useMemo } from 'react'
import {
  Bot,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Copy,
  Check,
  Terminal,
  FileText,
  ExternalLink,
} from 'lucide-react'
import type { ToolPart } from '../../types/opencode'
import { api, getCachedRoutingConfig } from '../../services/api'
import { tr } from '../../utils/i18n'
import { SubagentSessionModal } from './SubagentSessionModal'

export interface SubagentToolCardProps {
  part: ToolPart
  isLive?: boolean
}

export interface ParsedSubagentResult {
  taskId?: string
  taskState?: string
  cleanResult: string
  rawOutput: string
  hasStructuredResult: boolean
  lineCount: number
  charCount: number
}

/**
 * Parses subagent raw output to extract clean task result, taskId, and metadata.
 * Strips host protocol markers (e.g. GROK_TOOL_RESULT, No disk change, etc.)
 */
export function parseSubagentResult(rawOutput?: string): ParsedSubagentResult {
  const output = rawOutput || ''
  if (!output.trim()) {
    return {
      cleanResult: '',
      rawOutput: '',
      hasStructuredResult: false,
      lineCount: 0,
      charCount: 0,
    }
  }

  // 1. Extract task ID and task state if present
  const taskIdMatch = output.match(/<task[^>]*\bid=["']([^"']+)["']/i)
  const taskId = taskIdMatch ? taskIdMatch[1] : undefined

  const taskStateMatch = output.match(/<task[^>]*\bstate=["']([^"']+)["']/i)
  const taskState = taskStateMatch ? taskStateMatch[1] : undefined

  // 2. Extract <task_result>...</task_result>
  const resultMatch = output.match(/<task_result>([\s\S]*?)<\/task_result>/i)
  let cleanResult = ''
  let hasStructuredResult = false

  if (resultMatch && resultMatch[1].trim()) {
    cleanResult = resultMatch[1].trim()
    hasStructuredResult = true
  } else {
    // If no <task_result> tags, strip standard wrapper boilerplate lines
    const cleaned = output
      .replace(/^GROK_TOOL_RESULT[^\n]*\n?/gm, '')
      .replace(/^No disk change\.[^\n]*\n?/gm, '')
      .replace(/^NOTE:[^\n]*\n?/gm, '')
      .replace(/<\/?task[^>]*>/gi, '')
      .replace(/<\/?task_result>/gi, '')
      .trim()
    cleanResult = cleaned || output
  }

  const lines = cleanResult.split('\n')
  const lineCount = cleanResult ? lines.length : 0
  const charCount = cleanResult.length

  return {
    taskId,
    taskState,
    cleanResult,
    rawOutput: output,
    hasStructuredResult,
    lineCount,
    charCount,
  }
}

/**
 * Checks if a given tool part is a subagent execution (e.g. OpenCode task tool).
 */
export function isSubagentTool(part: ToolPart): boolean {
  if (!part) return false
  const toolName = (part.tool || '').toLowerCase()
  if (toolName === 'task' || toolName === 'subagent') return true
  if (part.state?.input && typeof part.state.input === 'object') {
    if (part.state.input.subagent_type || part.state.input.subagent) return true
  }
  return false
}

/**
 * Safely extracts a normalized string representation from any model format:
 * - { providerID: 'obsidian', modelID: 'grok-4.7' } -> 'obsidian/grok-4.7'
 * - { id: 'obsidian/grok-4.7' } -> 'obsidian/grok-4.7'
 * - { modelID: 'grok-4.7' } -> 'grok-4.7'
 * - 'obsidian/grok-4.7' -> 'obsidian/grok-4.7'
 * - Prevents any accidental '[object Object]'
 */
export function extractModelString(raw: unknown): string {
  if (!raw) return ''
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed === '[object Object]' || trimmed === 'undefined' || trimmed === 'null') return ''
    return trimmed
  }
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, any>
    if (obj.providerID && obj.modelID) {
      return `${obj.providerID}/${obj.modelID}`
    }
    if (obj.modelID && typeof obj.modelID === 'string') {
      return obj.modelID
    }
    if (obj.id && typeof obj.id === 'string') {
      return obj.id
    }
    if (obj.name && typeof obj.name === 'string') {
      return obj.name
    }
    if (obj.targetModelId && typeof obj.targetModelId === 'string') {
      return obj.targetModelId
    }
    if (obj.targetId && typeof obj.targetId === 'string') {
      return obj.targetId
    }
    if (obj.model) {
      const nested = extractModelString(obj.model)
      if (nested) return nested
    }
  }
  return ''
}

/**
 * Hook to resolve subagent model and role metadata.
 */
export function useSubagentModel(subagentType: string, part?: ToolPart) {
  const [modelLabel, setModelLabel] = useState<string>(() => {
    // 1. Check explicit metadata/input with safe string extraction
    const fromMeta = extractModelString(part?.state?.metadata?.model)
    if (fromMeta) return fromMeta

    const fromInput = extractModelString(part?.state?.input?.model)
    if (fromInput) return fromInput

    // 2. Check routing cache
    const routing = getCachedRoutingConfig()
    const norm = (subagentType || '').toLowerCase()
    const fromSubagentCfg =
      extractModelString(routing?.subagents?.[norm]?.targetModelId) ||
      extractModelString(routing?.subagents?.[norm]?.targetId) ||
      extractModelString(routing?.subagents?.[norm]?.model)
    if (fromSubagentCfg) return fromSubagentCfg

    const fromSenior = extractModelString(routing?.seniorModel)
    if (fromSenior) return fromSenior

    const fromTarget = extractModelString(routing?.selectedActiveTarget)
    if (fromTarget) return fromTarget

    return 'grok-4.7'
  })

  useEffect(() => {
    let isMounted = true
    const resolve = async () => {
      // If already resolved to a valid explicit model string, skip
      if (extractModelString(part?.state?.metadata?.model) || extractModelString(part?.state?.input?.model)) return

      try {
        const [routing, agents] = await Promise.all([
          api.getRoutingConfig(),
          api.getAgents(),
        ])
        if (!isMounted) return

        const norm = (subagentType || '').toLowerCase()
        let found =
          extractModelString(routing?.subagents?.[norm]?.targetModelId) ||
          extractModelString(routing?.subagents?.[norm]?.targetId) ||
          extractModelString(routing?.subagents?.[norm]?.model)

        if (!found) {
          const matchingAgent = agents.find((a) => a.name.toLowerCase() === norm)
          if (matchingAgent?.model) {
            found = extractModelString(matchingAgent.model)
          } else if (routing?.seniorModel) {
            found = extractModelString(routing.seniorModel)
          } else if (routing?.selectedActiveTarget) {
            found = extractModelString(routing.selectedActiveTarget)
          }
        }

        if (found) {
          setModelLabel(found)
        }
      } catch {
        // keep fallback
      }
    }

    resolve()
    return () => {
      isMounted = false
    }
  }, [subagentType, part])

  // Clean formatting: e.g. "obsidian/grok-4.7" -> cleanModelName: "grok-4.7", providerName: "obsidian"
  const cleanModelName = useMemo(() => {
    const raw = extractModelString(modelLabel) || 'grok-4.7'
    const parts = raw.split('/')
    const name = parts.length > 1 ? parts.slice(1).join('/') : raw
    return name === '[object Object]' || !name ? 'grok-4.7' : name
  }, [modelLabel])

  const providerName = useMemo(() => {
    const raw = extractModelString(modelLabel)
    if (!raw || !raw.includes('/')) return ''
    const prov = raw.split('/')[0]
    return prov === '[object Object]' ? '' : prov
  }, [modelLabel])

  return { modelLabel, cleanModelName, providerName }
}

/**
 * Dedicated Subagent Execution Card component.
 */
export function SubagentToolCard({ part, isLive }: SubagentToolCardProps) {
  const [isCardExpanded, setIsCardExpanded] = useState(true)
  const [isPromptExpanded, setIsPromptExpanded] = useState(false)
  const [isResultExpanded, setIsResultExpanded] = useState(false)
  const [showRawDetails, setShowRawDetails] = useState(false)
  const [copiedType, setCopiedType] = useState<'prompt' | 'result' | 'raw' | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const { state } = part
  const status = state?.status || 'completed'
  const isRunning = (isLive ?? true) && (status === 'running' || status === 'pending')
  const isInterrupted = !(isLive ?? true) && (status === 'running' || status === 'pending')
  const isError = status === 'error'

  const subagentType =
    state?.input?.subagent_type ||
    state?.input?.agent ||
    state?.input?.subagent ||
    'explore'

  const taskDescription =
    state?.input?.description ||
    state?.title ||
    (state?.input?.prompt ? state.input.prompt.slice(0, 45) + '...' : 'Subagent Task')

  const promptText = String(state?.input?.prompt || '').trim()
  const promptLines = promptText ? promptText.split('\n').length : 0
  const promptChars = promptText.length
  const isPromptCollapsible = promptLines > 2 || promptChars > 120

  const { cleanModelName, providerName } = useSubagentModel(subagentType, part)
  const parsed = useMemo(() => parseSubagentResult(state?.output || state?.error), [state?.output, state?.error])
  const effectiveTaskId =
    parsed.taskId ||
    (state?.metadata?.sessionId ? String(state.metadata.sessionId) : undefined) ||
    (state?.metadata?.taskId ? String(state.metadata.taskId) : undefined)
  const isResultCollapsible = parsed.lineCount > 5 || parsed.charCount > 220

  const handleCopy = (text: string, type: 'prompt' | 'result' | 'raw', e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopiedType(type)
    setTimeout(() => setCopiedType(null), 1200)
  }

  // Color scheme badge for subagent types
  const getTypeBadgeStyle = (type: string) => {
    const t = type.toLowerCase()
    if (t.includes('explore')) {
      return 'bg-blue-950/60 text-blue-300 border-blue-800/50'
    }
    if (t.includes('plan')) {
      return 'bg-purple-950/60 text-purple-300 border-purple-800/50'
    }
    if (t.includes('exec') || t.includes('build')) {
      return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50'
    }
    if (t.includes('scout') || t.includes('research')) {
      return 'bg-amber-950/60 text-amber-300 border-amber-800/50'
    }
    return 'bg-cyan-950/60 text-cyan-300 border-cyan-800/50'
  }

  return (
    <div className="my-2.5 rounded-lg border border-[#2b303b] bg-[#101317] overflow-hidden text-xs shadow-md transition-all">
      {/* 1. Header Bar: Explicit Subagent Tag, Type, Model & Description */}
      <div
        onClick={() => setIsCardExpanded(!isCardExpanded)}
        className="flex items-center justify-between px-3 py-2 bg-[#151921] hover:bg-[#191e28] cursor-pointer transition-colors select-none border-b border-[#232834]/80"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
          {/* Subagent Main Icon */}
          <div className="w-5 h-5 rounded flex items-center justify-center bg-cyan-950/70 border border-cyan-800/50 text-cyan-300 shrink-0">
            <Bot className="w-3.5 h-3.5" />
          </div>

          {/* Subagent Identifier Pill */}
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-950/60 text-cyan-300 border border-cyan-800/50 shrink-0">
            Subagent
          </span>

          {/* Subagent Type Pill */}
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border shrink-0 ${getTypeBadgeStyle(
              subagentType
            )}`}
          >
            {subagentType}
          </span>

          {/* Subagent Model Pill (Matching Figure 2/3 style) */}
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-950/50 text-purple-300 border border-purple-800/40 shrink-0 flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-purple-400" />
            <span>
              {cleanModelName}
              {providerName ? ` (${providerName})` : ''}
            </span>
          </span>

          {/* Task Description Title */}
          <span
            className="text-zinc-200 font-medium truncate ml-1 text-[11px]"
            title={taskDescription}
          >
            {taskDescription}
          </span>
        </div>

        {/* Right Status & Controls */}
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {isRunning ? (
            <span className="flex items-center gap-1 text-purple-400 font-mono text-[10px]">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>运行中</span>
            </span>
          ) : isInterrupted ? (
            <span className="flex items-center gap-1 text-amber-400 font-mono text-[10px]">
              <AlertCircle className="w-3 h-3" />
              <span>已中断</span>
            </span>
          ) : isError ? (
            <span className="flex items-center gap-1 text-rose-400 font-mono text-[10px]">
              <XCircle className="w-3 h-3" />
              <span>调用异常</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
            </span>
          )}

          {/* Quick Copy Result Button */}
          {parsed.cleanResult && (
            <button
              type="button"
              onClick={(e) => handleCopy(parsed.cleanResult, 'result', e)}
              className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
              title="复制子代理回传结果"
            >
              {copiedType === 'result' ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          )}

          {/* Open Subagent Floating Inspector Modal Button */}
          {effectiveTaskId && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsModalOpen(true)
              }}
              className="p-1 text-zinc-400 hover:text-cyan-300 rounded hover:bg-zinc-800 transition-colors"
              title="打开子代理执行悬浮窗 (Subagent Inspector)"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Toggle Chevron */}
          <button className="text-zinc-400 hover:text-zinc-200 p-0.5">
            {isCardExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 2. Expanded Content Surface */}
      {isCardExpanded && (
        <div className="p-3 bg-[#0a0c10] space-y-3 font-sans">
          {/* Metadata Overview Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-[#13161c] border border-zinc-800/80 text-[11px] text-zinc-400">
            <div className="flex items-center gap-3 flex-wrap">
              <span>
                <strong className="text-zinc-300 font-medium">目标角色:</strong>{' '}
                <span className="text-blue-300 font-mono">{subagentType}</span>
              </span>
              <span>
                <strong className="text-zinc-300 font-medium">调用模型:</strong>{' '}
                <span className="text-purple-300 font-mono">
                  {cleanModelName}
                  {providerName ? ` (${providerName})` : ''}
                </span>
              </span>
              {effectiveTaskId && (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-800/90 hover:bg-zinc-700/90 border border-zinc-700/60 hover:border-cyan-500/60 text-zinc-300 hover:text-cyan-300 transition-all cursor-pointer group select-none"
                  title="点击打开子代理悬浮详情 UI (Read-only Inspector)"
                >
                  <strong className="text-zinc-400 group-hover:text-cyan-300 font-medium">任务会话:</strong>{' '}
                  <span className="text-zinc-300 group-hover:text-cyan-300 font-mono text-[10px] underline underline-offset-2" title={effectiveTaskId}>
                    {effectiveTaskId.slice(0, 18)}...
                  </span>
                  <ExternalLink className="w-3 h-3 text-cyan-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>
              )}
            </div>

            {parsed.taskState && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
                {parsed.taskState}
              </span>
            )}
          </div>

          {/* Prompt Section (任务提示词 / 展开提示词 UI - Matching Figure 2) */}
          {promptText && (
            <div className="rounded-lg border border-purple-900/30 bg-[#121118]/70 p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs text-purple-300 font-medium">
                  <FileText className="w-3 h-3 text-purple-400" />
                  <span>{tr('子代理任务提示词', 'Subagent Mission Prompt', 'Subagent-Missions-Prompt')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(promptText, 'prompt')}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-purple-300/80 hover:text-purple-200 hover:bg-purple-950/60 transition-colors"
                >
                  {copiedType === 'prompt' ? (
                    <>
                      <Check className="w-2.5 h-2.5 text-emerald-400" />
                      <span className="text-emerald-400">{tr('已复制', 'Copied', 'Kopiert')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-2.5 h-2.5" />
                      <span>{tr('复制提示词', 'Copy Prompt', 'Prompt kopieren')}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Prompt Text with Collapsible Viewport */}
              <div className="relative">
                <div
                  className={`text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap font-mono transition-all select-text cursor-text ${
                    isPromptCollapsible && !isPromptExpanded ? 'max-h-20 overflow-hidden' : ''
                  }`}
                >
                  {promptText}
                </div>

                {/* Fade mask when collapsed */}
                {isPromptCollapsible && !isPromptExpanded && (
                  <div
                    onClick={() => setIsPromptExpanded(true)}
                    className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#121118] via-[#121118]/90 to-transparent cursor-pointer flex items-end justify-center pb-0.5"
                    title={tr('点击展开完整提示词', 'Click to expand full prompt', 'Klicken, um vollständigen Prompt anzuzeigen')}
                  />
                )}

                {/* Expand / Collapse Button matching Figure 2 purple style */}
                {isPromptCollapsible && (
                  <button
                    type="button"
                    onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                    className={`w-full mt-2 pt-1 flex items-center justify-center gap-1.5 text-[10px] font-medium transition-all select-none rounded border ${
                      isPromptExpanded
                        ? 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/30 hover:bg-zinc-800/60 py-1 border-zinc-800'
                        : 'text-purple-300 hover:text-purple-100 bg-purple-950/40 hover:bg-purple-950/70 py-1 border-purple-900/50 shadow-sm'
                    }`}
                  >
                    {isPromptExpanded ? (
                      <>
                        <ChevronUp className="w-3 h-3 text-zinc-400" />
                        <span>{tr('收起提示词', 'Collapse Prompt', 'Prompt einklappen')}</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3 text-purple-400" />
                        <span>
                          {tr('展开完整提示词', 'Expand Full Prompt', 'Vollständigen Prompt anzeigen')}{' '}
                          <span className="font-mono opacity-80">
                            ({promptLines} {tr('行', 'lines', 'Zeilen')} / {promptChars.toLocaleString()}{' '}
                            {tr('字', 'chars', 'Zeichen')})
                          </span>
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Result Section (模型返回结果 / 展开结果 UI - Matching Figure 2) */}
          <div className="rounded-lg border border-cyan-900/30 bg-[#0c1015]/80 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>{tr('子代理回传结果', 'Subagent Returned Result', 'Rückgabeergebnis des Subagenten')}</span>
              </div>
              {parsed.cleanResult && (
                <button
                  type="button"
                  onClick={() => handleCopy(parsed.cleanResult, 'result')}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-cyan-300/80 hover:text-cyan-200 hover:bg-cyan-950/60 transition-colors"
                >
                  {copiedType === 'result' ? (
                    <>
                      <Check className="w-2.5 h-2.5 text-emerald-400" />
                      <span className="text-emerald-400">{tr('已复制', 'Copied', 'Kopiert')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-2.5 h-2.5" />
                      <span>{tr('复制结果', 'Copy Result', 'Ergebnis kopieren')}</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {parsed.cleanResult ? (
              <div className="relative">
                <div
                  className={`text-[11px] leading-relaxed text-zinc-200 whitespace-pre-wrap font-mono select-text cursor-text transition-all ${
                    isResultCollapsible && !isResultExpanded ? 'max-h-36 overflow-hidden' : ''
                  }`}
                >
                  {parsed.cleanResult}
                </div>

                {/* Fade mask when collapsed */}
                {isResultCollapsible && !isResultExpanded && (
                  <div
                    onClick={() => setIsResultExpanded(true)}
                    className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#0c1015] via-[#0c1015]/90 to-transparent cursor-pointer flex items-end justify-center pb-0.5"
                    title={tr('点击展开完整结果', 'Click to expand full result', 'Klicken, um vollständiges Ergebnis anzuzeigen')}
                  />
                )}

                {/* Expand / Collapse Button matching Figure 2 purple style */}
                {isResultCollapsible && (
                  <button
                    type="button"
                    onClick={() => setIsResultExpanded(!isResultExpanded)}
                    className={`w-full mt-2.5 pt-1 flex items-center justify-center gap-1.5 text-[11px] font-medium transition-all select-none rounded border ${
                      isResultExpanded
                        ? 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/30 hover:bg-zinc-800/60 py-1.5 border-zinc-800'
                        : 'text-purple-300 hover:text-purple-100 bg-purple-950/40 hover:bg-purple-950/70 py-1.5 border-purple-900/50 shadow-sm'
                    }`}
                  >
                    {isResultExpanded ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{tr('收起结果', 'Collapse Result', 'Ergebnis einklappen')}</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5 text-purple-400" />
                        <span>
                          {tr('展开完整结果', 'Expand Full Result', 'Vollständiges Ergebnis anzeigen')}{' '}
                          <span className="font-mono text-[10px] opacity-80">
                            ({parsed.lineCount} {tr('行', 'lines', 'Zeilen')} / {parsed.charCount.toLocaleString()}{' '}
                            {tr('字', 'chars', 'Zeichen')})
                          </span>
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            ) : (
              <div className="text-zinc-500 italic text-[11px] py-1 select-none">
                {isRunning
                  ? tr('子代理正在执行并探索，等待回传结果...', 'Subagent running and exploring, awaiting results...', 'Subagent wird ausgeführt...')
                  : tr('暂无回传内容', 'No output recorded', 'Keine Ausgabe')}
              </div>
            )}
          </div>

          {/* 3. Raw Payload Inspector (Collapsed accordion for developers) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowRawDetails(!showRawDetails)}
              className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors select-none"
            >
              <Terminal className="w-3 h-3" />
              <span>
                {showRawDetails
                  ? tr('收起原始调用参数与报文', 'Hide Raw Payload & Tokens', 'Roh-Payload ausblenden')
                  : tr('查看原始调用参数与报文', 'View Raw Payload & Tokens', 'Roh-Payload anzeigen')}
              </span>
              {showRawDetails ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>

            {showRawDetails && (
              <div className="mt-2 p-2.5 rounded bg-[#07080a] border border-zinc-800 text-[10px] font-mono space-y-2 select-text cursor-text">
                {state?.input && (
                  <div>
                    <div className="flex items-center justify-between text-zinc-500 font-semibold mb-1">
                      <span>RAW INPUT:</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(JSON.stringify(state.input, null, 2), 'raw')}
                        className="text-zinc-400 hover:text-zinc-200"
                      >
                        {copiedType === 'raw' ? tr('已复制', 'Copied', 'Kopiert') : tr('复制', 'Copy', 'Kopieren')}
                      </button>
                    </div>
                    <pre className="text-zinc-400 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(state.input, null, 2)}
                    </pre>
                  </div>
                )}

                {state?.output && (
                  <div className="border-t border-zinc-900 pt-2">
                    <div className="flex items-center justify-between text-zinc-500 font-semibold mb-1">
                      <span>RAW OUTPUT / PROTOCOL:</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(state.output || '', 'raw')}
                        className="text-zinc-400 hover:text-zinc-200"
                      >
                        {copiedType === 'raw' ? tr('已复制', 'Copied', 'Kopiert') : tr('复制', 'Copy', 'Kopieren')}
                      </button>
                    </div>
                    <pre className="text-zinc-400 overflow-x-auto whitespace-pre-wrap break-all">
                      {state.output}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Floating Subagent Inspector Modal */}
      {effectiveTaskId && (
        <SubagentSessionModal
          isOpen={isModalOpen}
          sessionId={effectiveTaskId}
          subagentType={subagentType}
          modelLabel={cleanModelName ? `${cleanModelName}${providerName ? ` (${providerName})` : ''}` : undefined}
          taskDescription={taskDescription}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  )
}
