import type { Message, ToolPart } from '../types/opencode'

export interface BackgroundTaskItem {
  id: string
  sessionId: string
  sessionTitle?: string
  messageId: string
  partId: string
  tool: string
  command: string
  title: string
  status: 'running' | 'completed' | 'error' | 'pending'
  startTime: number
  endTime?: number
  durationMs: number
  output: string
  error?: string
}

/**
 * Extracts clean command string from tool input parameters.
 */
export function extractCommandString(tool: string, input?: Record<string, any>): string {
  if (!input) return tool
  if (typeof input.command === 'string' && input.command.trim()) {
    return input.command.trim()
  }
  if (typeof input.cmd === 'string' && input.cmd.trim()) {
    return input.cmd.trim()
  }
  if (typeof input.script === 'string' && input.script.trim()) {
    return input.script.trim()
  }
  if (typeof input.path === 'string' && input.path.trim()) {
    return `${tool} ${input.path.trim()}`
  }
  if (typeof input.url === 'string' && input.url.trim()) {
    return `${tool} ${input.url.trim()}`
  }
  if (typeof input.query === 'string' && input.query.trim()) {
    return `${tool} ${input.query.trim()}`
  }
  return tool
}

/**
 * Extracts and normalizes background tasks from a list of session messages.
 */
export function extractBackgroundTasks(
  messages: Message[] = [],
  sessionId = '',
  sessionTitle = ''
): BackgroundTaskItem[] {
  const tasks: BackgroundTaskItem[] = []

  for (const m of messages) {
    if (!Array.isArray(m.parts)) continue

    for (const p of m.parts) {
      if (p.type !== 'tool') continue
      const toolPart = p as ToolPart
      const state = toolPart.state || { status: 'completed' }
      const tool = toolPart.tool || 'command'

      const command = extractCommandString(tool, state.input)
      const title = state.title || command || tool

      const rawStart = state.time?.start || m.info?.time?.created || Date.now()
      const startTime = rawStart < 1e11 ? rawStart * 1000 : rawStart

      const rawEnd = state.time?.end || (state.status !== 'running' && state.status !== 'pending' ? m.info?.time?.completed : undefined)
      const endTime = rawEnd ? (rawEnd < 1e11 ? rawEnd * 1000 : rawEnd) : undefined

      const durationMs = endTime ? Math.max(0, endTime - startTime) : Math.max(0, Date.now() - startTime)

      tasks.push({
        id: `${m.info?.id || 'msg'}_${toolPart.id || toolPart.callID || Math.random().toString(36).slice(2, 8)}`,
        sessionId: sessionId || m.info?.sessionID || '',
        sessionTitle: sessionTitle || 'Session',
        messageId: m.info?.id || '',
        partId: toolPart.id || toolPart.callID || '',
        tool,
        command,
        title,
        status: state.status || 'completed',
        startTime,
        endTime,
        durationMs,
        output: state.output || '',
        error: state.error,
      })
    }
  }

  // Reverse so newest tasks appear first
  return tasks.reverse()
}

/**
 * Formats duration in human-readable format: e.g. "1.2s", "45s", "2m 15s"
 */
export function formatTaskDuration(durationMs: number): string {
  if (!durationMs || durationMs <= 0) return '0s'
  const seconds = Math.floor(durationMs / 1000)
  if (seconds < 60) {
    const frac = (durationMs / 1000).toFixed(1)
    return `${frac}s`
  }
  const mins = Math.floor(seconds / 60)
  const remSecs = seconds % 60
  if (mins < 60) {
    return `${mins}m ${remSecs}s`
  }
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hours}h ${remMins}m`
}
