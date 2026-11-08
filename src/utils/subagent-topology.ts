import type { Message, Session, ToolPart } from '../types/opencode'
import { isSubagentTool, parseSubagentResult, extractModelString } from '../components/chat/SubagentToolCard'

export interface SubagentNode {
  id: string
  partId?: string
  name: string
  subagentType: string
  role: string
  model: string
  status: 'running' | 'completed' | 'error' | 'pending'
  taskDescription: string
  prompt: string
  cleanResult: string
  rawOutput: string
  sessionId?: string
  taskId?: string
  toolPart?: ToolPart
  startTime?: number
  endTime?: number
  durationMs?: number
  children: SubagentNode[]
}

export interface SubagentCommunication {
  id: string
  timestamp: number
  sourceId: string
  sourceName: string
  targetId: string
  targetName: string
  direction: 'dispatch' | 'report'
  title: string
  content: string
  status: 'running' | 'completed' | 'error' | 'pending'
  durationMs?: number
}

export interface TopologyData {
  rootNode: SubagentNode
  allNodes: SubagentNode[]
  totalCount: number
  runningCount: number
  completedCount: number
  errorCount: number
  communications: SubagentCommunication[]
}

/**
 * Normalizes subagent type to a clean display title and role label.
 */
export function resolveSubagentRole(rawType: string): { name: string; role: string; roleZh: string } {
  const norm = (rawType || '').toLowerCase().trim()
  if (norm.includes('planner') || norm === 'plan') {
    return { name: 'Planner', role: 'Strategic Planning', roleZh: '架构规划' }
  }
  if (norm.includes('research') || norm === 'explore' || norm.includes('search')) {
    return { name: 'Researcher', role: 'Codebase Research', roleZh: '深度调研' }
  }
  if (norm.includes('deepcode') || norm.includes('coder') || norm === 'build') {
    return { name: 'Coder', role: 'Implementation', roleZh: '代码编写' }
  }
  if (norm.includes('test') || norm.includes('qa')) {
    return { name: 'Tester', role: 'Testing & Verification', roleZh: '测试验证' }
  }
  if (norm.includes('review') || norm.includes('audit')) {
    return { name: 'Reviewer', role: 'Code Review', roleZh: '代码审查' }
  }
  if (norm.includes('debugger') || norm.includes('bug')) {
    return { name: 'Debugger', role: 'Diagnostics', roleZh: '故障诊断' }
  }
  const cap = rawType ? rawType.charAt(0).toUpperCase() + rawType.slice(1) : 'Subagent'
  return { name: cap, role: 'Specialized Task', roleZh: '专用子代理' }
}

/**
 * Formats duration in milliseconds into human readable string.
 */
export function formatTopologyDuration(durationMs?: number): string {
  if (durationMs === undefined || durationMs === null || isNaN(durationMs) || durationMs < 0) {
    return '0s'
  }
  const sec = durationMs / 1000
  if (sec < 60) {
    return `${sec.toFixed(1)}s`
  }
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}m ${s}s`
}

/**
 * Extracts subagent topology tree and communications stream from session messages and child sessions.
 */
export function extractSubagentTopology(
  messages: Message[] = [],
  activeSession?: Session | null,
  childSessions: Session[] = [],
  now = Date.now()
): TopologyData {
  const rootSessionId = activeSession?.id || 'root'
  const rootAgentName = activeSession?.agent || 'Master Orchestrator'
  const rootModel = extractModelString(activeSession?.model) || 'gpt-6.1-sol'

  const subagentNodes: SubagentNode[] = []
  const communications: SubagentCommunication[] = []

  let runningCount = 0
  let completedCount = 0
  let errorCount = 0

  // 1. Extract subagent tool calls from messages
  for (const message of messages) {
    if (!message.parts || !Array.isArray(message.parts)) continue

    for (const part of message.parts) {
      if (part.type !== 'tool') continue
      const toolPart = part as ToolPart
      if (!isSubagentTool(toolPart)) continue

      const state = toolPart.state
      const rawStatus = state?.status || 'completed'
      const status: 'running' | 'completed' | 'error' | 'pending' =
        rawStatus === 'running'
          ? 'running'
          : rawStatus === 'pending'
          ? 'pending'
          : rawStatus === 'error'
          ? 'error'
          : 'completed'

      if (status === 'running' || status === 'pending') runningCount++
      else if (status === 'error') errorCount++
      else completedCount++

      const rawType =
        state?.input?.subagent_type ||
        state?.input?.agent ||
        state?.input?.subagent ||
        'explore'
      const { name, role, roleZh } = resolveSubagentRole(rawType)

      const model =
        extractModelString(state?.metadata?.model) ||
        extractModelString(state?.input?.model) ||
        'gpt-6.1-sol'

      const taskDescription =
        state?.input?.description ||
        state?.title ||
        (state?.input?.prompt ? String(state.input.prompt).slice(0, 60) + '...' : `${name} Task`)

      const prompt = String(state?.input?.prompt || '').trim()
      const parsed = parseSubagentResult(state?.output || state?.error)

      const startTime = state?.time?.start || message.info?.time?.created || now
      const endTime = state?.time?.end || (status === 'completed' || status === 'error' ? now : undefined)
      const durationMs = endTime ? Math.max(0, endTime - startTime) : Math.max(0, now - startTime)

      const nodeId = `node_${toolPart.id}`
      const node: SubagentNode = {
        id: nodeId,
        partId: toolPart.id,
        name,
        subagentType: rawType,
        role: `${role} (${roleZh})`,
        model,
        status,
        taskDescription,
        prompt,
        cleanResult: parsed.cleanResult,
        rawOutput: parsed.rawOutput,
        sessionId: parsed.taskId || (state?.metadata?.sessionId ? String(state.metadata.sessionId) : undefined),
        taskId: parsed.taskId || (state?.metadata?.taskId ? String(state.metadata.taskId) : undefined),
        toolPart,
        startTime,
        endTime,
        durationMs,
        children: [],
      }

      subagentNodes.push(node)

      // Add Dispatch communication event (Root -> Subagent)
      communications.push({
        id: `comm_dispatch_${toolPart.id}`,
        timestamp: startTime,
        sourceId: rootSessionId,
        sourceName: rootAgentName,
        targetId: nodeId,
        targetName: name,
        direction: 'dispatch',
        title: `派发: ${taskDescription}`,
        content: prompt || taskDescription,
        status,
        durationMs: undefined,
      })

      // Add Report communication event (Subagent -> Root) if completed, error, or has output
      if (parsed.cleanResult || status === 'completed' || status === 'error') {
        communications.push({
          id: `comm_report_${toolPart.id}`,
          timestamp: endTime || now,
          sourceId: nodeId,
          sourceName: name,
          targetId: rootSessionId,
          targetName: rootAgentName,
          direction: 'report',
          title: `回报: ${taskDescription}`,
          content: parsed.cleanResult || (status === 'error' ? state?.error || 'Execution failed' : '任务完成'),
          status,
          durationMs,
        })
      }
    }
  }

  // 2. Add any standalone child sessions with parentID matching activeSession.id
  if (childSessions && childSessions.length > 0) {
    for (const cs of childSessions) {
      if (cs.parentID !== rootSessionId) continue
      // Avoid duplicates if already represented by a tool part
      if (subagentNodes.some((n) => n.sessionId === cs.id)) continue

      const { name, role, roleZh } = resolveSubagentRole(cs.agent || 'subagent')
      const status: 'running' | 'completed' | 'error' | 'pending' = 'completed'
      completedCount++

      const startTime = cs.time?.created || now
      const endTime = cs.time?.updated || now
      const durationMs = Math.max(0, endTime - startTime)

      const nodeId = `session_${cs.id}`
      const node: SubagentNode = {
        id: nodeId,
        name: cs.title || name,
        subagentType: cs.agent || 'subagent',
        role: `${role} (${roleZh})`,
        model: extractModelString(cs.model) || 'gpt-6.1-sol',
        status,
        taskDescription: cs.title || `${name} Session`,
        prompt: cs.title || '',
        cleanResult: cs.summary ? `Modified ${cs.summary.files} files (+${cs.summary.additions}/-${cs.summary.deletions})` : '',
        rawOutput: '',
        sessionId: cs.id,
        startTime,
        endTime,
        durationMs,
        children: [],
      }

      subagentNodes.push(node)

      communications.push({
        id: `comm_session_${cs.id}`,
        timestamp: startTime,
        sourceId: rootSessionId,
        sourceName: rootAgentName,
        targetId: nodeId,
        targetName: node.name,
        direction: 'dispatch',
        title: `子会话派发: ${node.taskDescription}`,
        content: cs.title || '',
        status,
      })
    }
  }

  // Sort communications chronologically
  communications.sort((a, b) => a.timestamp - b.timestamp)

  const rootStatus: 'running' | 'completed' | 'error' | 'pending' =
    runningCount > 0 ? 'running' : errorCount > 0 && completedCount === 0 ? 'error' : 'completed'

  const rootNode: SubagentNode = {
    id: rootSessionId,
    name: rootAgentName,
    subagentType: 'orchestrator',
    role: 'Master Orchestrator (主指挥智能体)',
    model: rootModel,
    status: rootStatus,
    taskDescription: activeSession?.title || 'Main Workspace Session',
    prompt: '',
    cleanResult: '',
    rawOutput: '',
    sessionId: rootSessionId,
    children: subagentNodes,
  }

  return {
    rootNode,
    allNodes: subagentNodes,
    totalCount: subagentNodes.length,
    runningCount,
    completedCount,
    errorCount,
    communications,
  }
}
