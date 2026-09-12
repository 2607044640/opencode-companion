import type {
  MessagePart,
  MessageInfo,
  ToolPart,
  ReasoningPart,
  TextPart,
  FilePart,
} from '../types/opencode'

export type ToolKind = 'explore' | 'edit' | 'command' | 'thought' | 'other'

export function classifyTool(tool: string): Exclude<ToolKind, 'thought'> {
  const t = (tool || '').toLowerCase()
  if (
    [
      'read',
      'grep',
      'glob',
      'list',
      'search',
      'find',
      'webfetch',
      'look_at',
      'view_file',
      'grep_search',
      'find_by_name',
      'search_web',
      'cat',
      'session_read',
    ].includes(t)
  ) {
    return 'explore'
  }
  if (
    [
      'edit',
      'write',
      'write_to_file',
      'replace_file_content',
      'patch',
      'apply_patch',
    ].includes(t)
  ) {
    return 'edit'
  }
  if (['bash', 'shell', 'exec', 'run_command'].includes(t)) {
    return 'command'
  }
  return 'other'
}

export interface ExploreItem {
  partId: string
  tool: string
  pathOrQuery: string
  kind: 'file' | 'search'
  status: 'pending' | 'running' | 'completed' | 'error'
}

export interface CommandItem {
  partId: string
  command: string
  outputPreview?: string
  status: 'pending' | 'running' | 'completed' | 'error'
  error?: string
}

export interface ThoughtItem {
  partId: string
  text: string
  durationMs?: number
}

export interface OtherItem {
  partId: string
  tool: string
  title: string
  status: 'pending' | 'running' | 'completed' | 'error'
  rawPart: ToolPart
}

export interface EditItem {
  partId: string
  tool: string
  filePath: string
  fileName: string
  relativeDir: string
  status: 'added' | 'deleted' | 'modified'
  additions: number
  deletions: number
  unified: string
  source: 'metadata' | 'output' | 'strings' | 'write' | 'empty'
  toolStatus: 'pending' | 'running' | 'completed' | 'error'
  error?: string
  rawPart: ToolPart
}

export type WorkGroup =
  | { kind: 'explore'; items: ExploreItem[]; collapsedDefault: true }
  | { kind: 'command'; items: CommandItem[]; collapsedDefault: true }
  | { kind: 'thought'; items: ThoughtItem[]; durationMs: number; collapsedDefault: true }
  | { kind: 'other'; items: OtherItem[]; collapsedDefault: true }
  | { kind: 'edit'; item: EditItem }

export interface WorkedTurn {
  hasWork: boolean
  durationMs: number
  isLive: boolean
  answerParts: TextPart[]
  fileParts: FilePart[]
  groups: WorkGroup[]
  totalWorkItems: number
  hasError: boolean
}

/**
 * Format duration label per Prometheus spec:
 * "Worked for 32s", "Worked for 4m", "Working for 12s"
 */
export function formatWorkedLabel(ms: number, isLive: boolean): string {
  const sec = Math.max(0, Math.round(ms / 1000))
  let body = ''
  if (sec < 60) {
    body = `${sec}s`
  } else {
    const mins = Math.floor(sec / 60)
    const rem = sec % 60
    body = rem === 0 ? `${mins}m` : `${mins}m ${rem}s`
  }
  return isLive ? `Working for ${body}` : `Worked for ${body}`
}

/**
 * Normalizes a file path into fileName and directory
 */
export function normalizePath(rawPath?: string): {
  filePath: string
  fileName: string
  relativeDir: string
} {
  if (!rawPath) {
    return { filePath: '', fileName: 'Unknown file', relativeDir: '' }
  }
  const normalized = rawPath.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  const fileName = segments.pop() || normalized
  const relativeDir = segments.slice(-2).join('/')
  return {
    filePath: normalized,
    fileName,
    relativeDir,
  }
}

/**
 * Count diff lines: additions (+) and deletions (-)
 */
export function countDiffLines(unified: string): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  if (!unified || typeof unified !== 'string') {
    return { additions, deletions }
  }
  const lines = unified.split('\n')
  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('\\')) continue
    if (line.startsWith('+')) additions++
    else if (line.startsWith('-')) deletions++
  }
  return { additions, deletions }
}

/**
 * Extract edit item from a ToolPart
 */
export function extractEditItem(part: ToolPart): EditItem {
  const input = part.state?.input || {}
  const output = part.state?.output || ''
  const metadata = part.state?.metadata || {}
  const toolName = (part.tool || '').toLowerCase()
  const rawPath =
    input.filePath ||
    input.path ||
    input.TargetFile ||
    input.file ||
    part.state?.title ||
    'modified-file'

  const { filePath, fileName, relativeDir } = normalizePath(rawPath)
  let status: 'added' | 'deleted' | 'modified' =
    toolName === 'write' || toolName === 'write_to_file' ? 'added' : 'modified'

  let unified = ''
  let source: EditItem['source'] = 'empty'

  // 1. metadata or input patch / diff
  const metaDiff =
    metadata.patch ||
    metadata.diff ||
    metadata.unifiedDiff ||
    input.diff ||
    input.patch
  if (typeof metaDiff === 'string' && (metaDiff.includes('@@') || metaDiff.startsWith('---'))) {
    unified = metaDiff.trim()
    source = 'metadata'
  }

  // 2. output diff
  if (!unified && typeof output === 'string' && (output.includes('@@ ') || (output.includes('--- ') && output.includes('+++ ')))) {
    unified = output.trim()
    source = 'output'
  }

  // 3. input oldString / newString (or targetContent / replacementContent)
  if (!unified) {
    const oldStr =
      input.oldString ?? input.old_string ?? input.oldText ?? input.targetContent
    const newStr =
      input.newString ?? input.new_string ?? input.newText ?? input.replacementContent

    if (typeof oldStr === 'string' || typeof newStr === 'string') {
      const oldLines = typeof oldStr === 'string' ? oldStr.split('\n') : []
      const newLines = typeof newStr === 'string' ? newStr.split('\n') : []
      const delLines = oldLines.map((l) => `-${l}`).join('\n')
      const addLines = newLines.map((l) => `+${l}`).join('\n')
      unified = `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,${Math.max(1, oldLines.length)} +1,${Math.max(1, newLines.length)} @@\n${delLines ? delLines + '\n' : ''}${addLines}`
      source = 'strings'
    }
  }

  // 4. write contents
  if (!unified) {
    const contents = input.contents ?? input.content ?? input.CodeContent
    if (typeof contents === 'string') {
      const lines = contents.split('\n')
      const addLines = lines.map((l: string) => `+${l}`).join('\n')
      unified = `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n${addLines}`
      source = 'write'
      status = 'added'
    }
  }

  // 5. line counts
  let { additions, deletions } = countDiffLines(unified)
  if (additions === 0 && deletions === 0) {
    if (typeof input.additions === 'number') additions = input.additions
    if (typeof input.deletions === 'number') deletions = input.deletions
  }

  return {
    partId: part.id,
    tool: toolName,
    filePath,
    fileName,
    relativeDir,
    status,
    additions,
    deletions,
    unified,
    source,
    toolStatus: part.state?.status || 'completed',
    error: part.state?.error,
    rawPart: part,
  }
}

/**
 * Splits <think> tags from text if present
 */
function splitThinkTags(raw: string): { thoughts: string[]; cleanText: string } {
  if (!raw.includes('<think>')) {
    return { thoughts: [], cleanText: raw }
  }
  const thoughts: string[] = []
  const cleanText = raw.replace(/<think>([\s\S]*?)(?:<\/think>|$)/gi, (_, thought) => {
    if (thought.trim()) {
      thoughts.push(thought.trim())
    }
    return ''
  }).trim()
  return { thoughts, cleanText }
}

/**
 * Main Partition Function:
 * Partitions an assistant message turn into a WorkedTurn structure.
 * Consecutive explores, commands, thoughts are merged into groups.
 * Every edit item is its own group.
 * The answer text parts render below the WorkedSummaryCard.
 */
export function partitionAssistantTurn(
  parts: MessagePart[],
  info?: MessageInfo,
  now = Date.now()
): WorkedTurn {
  const answerParts: TextPart[] = []
  const fileParts: FilePart[] = []
  const rawWorkParts: MessagePart[] = []
  const extraThoughts: ThoughtItem[] = []

  for (const part of parts) {
    if (part.type === 'text') {
      const text = (part as TextPart).text || ''
      const { thoughts, cleanText } = splitThinkTags(text)
      thoughts.forEach((th, idx) => {
        extraThoughts.push({
          partId: `${part.id}_think_${idx}`,
          text: th,
        })
      })
      if (cleanText.trim()) {
        answerParts.push({
          ...(part as TextPart),
          text: cleanText,
        })
      }
    } else if (part.type === 'file') {
      fileParts.push(part as FilePart)
    } else if (part.type === 'tool' || part.type === 'reasoning') {
      rawWorkParts.push(part)
    }
  }

  const hasWork = rawWorkParts.length > 0 || extraThoughts.length > 0

  if (!hasWork) {
    return {
      hasWork: false,
      durationMs: 0,
      isLive: false,
      answerParts,
      fileParts,
      groups: [],
      totalWorkItems: 0,
      hasError: false,
    }
  }

  const groups: WorkGroup[] = []

  // Prepend any thoughts extracted from <think> tags
  if (extraThoughts.length > 0) {
    groups.push({
      kind: 'thought',
      items: extraThoughts,
      durationMs: 0,
      collapsedDefault: true,
    })
  }

  let currentExploreGroup: { kind: 'explore'; items: ExploreItem[]; collapsedDefault: true } | null = null
  let currentCommandGroup: { kind: 'command'; items: CommandItem[]; collapsedDefault: true } | null = null
  let currentThoughtGroup: { kind: 'thought'; items: ThoughtItem[]; durationMs: number; collapsedDefault: true } | null = null
  let currentOtherGroup: { kind: 'other'; items: OtherItem[]; collapsedDefault: true } | null = null

  const flushCurrent = () => {
    if (currentExploreGroup && currentExploreGroup.items.length > 0) {
      groups.push(currentExploreGroup)
      currentExploreGroup = null
    }
    if (currentCommandGroup && currentCommandGroup.items.length > 0) {
      groups.push(currentCommandGroup)
      currentCommandGroup = null
    }
    if (currentThoughtGroup && currentThoughtGroup.items.length > 0) {
      groups.push(currentThoughtGroup)
      currentThoughtGroup = null
    }
    if (currentOtherGroup && currentOtherGroup.items.length > 0) {
      groups.push(currentOtherGroup)
      currentOtherGroup = null
    }
  }

  for (const part of rawWorkParts) {
    if (part.type === 'reasoning') {
      const rp = part as ReasoningPart
      const durationMs =
        rp.time?.start && rp.time?.end ? Math.max(0, rp.time.end - rp.time.start) : 0
      const thoughtItem: ThoughtItem = {
        partId: rp.id,
        text: rp.text || '',
        durationMs,
      }

      if (currentThoughtGroup) {
        currentThoughtGroup.items.push(thoughtItem)
        currentThoughtGroup.durationMs += durationMs
      } else {
        flushCurrent()
        currentThoughtGroup = {
          kind: 'thought',
          items: [thoughtItem],
          durationMs,
          collapsedDefault: true,
        }
      }
      continue
    }

    if (part.type === 'tool') {
      const tp = part as ToolPart
      const kind = classifyTool(tp.tool)
      const input = tp.state?.input || {}
      const status = tp.state?.status || 'completed'

      if (kind === 'edit') {
        flushCurrent()
        const editItem = extractEditItem(tp)
        groups.push({
          kind: 'edit',
          item: editItem,
        })
        continue
      }

      if (kind === 'explore') {
        if (currentCommandGroup || currentThoughtGroup || currentOtherGroup) {
          flushCurrent()
        }
        const toolLower = (tp.tool || '').toLowerCase()
        const isSearch = [
          'grep',
          'glob',
          'find',
          'search',
          'grep_search',
          'find_by_name',
          'search_web',
        ].includes(toolLower)

        const rawTarget = isSearch
          ? input.pattern || input.query || input.Query || input.Pattern || input.search || tp.state?.title || 'search'
          : input.filePath || input.path || input.AbsolutePath || input.file || tp.state?.title || 'file'

        const pathOrQuery = isSearch ? String(rawTarget) : normalizePath(String(rawTarget)).fileName

        const exploreItem: ExploreItem = {
          partId: tp.id,
          tool: tp.tool,
          pathOrQuery,
          kind: isSearch ? 'search' : 'file',
          status,
        }

        if (!currentExploreGroup) {
          currentExploreGroup = {
            kind: 'explore',
            items: [],
            collapsedDefault: true,
          }
        }
        currentExploreGroup.items.push(exploreItem)
        continue
      }

      if (kind === 'command') {
        if (currentExploreGroup || currentThoughtGroup || currentOtherGroup) {
          flushCurrent()
        }
        const cmd = input.command || input.cmd || input.CommandLine || tp.state?.title || 'command'
        const commandItem: CommandItem = {
          partId: tp.id,
          command: String(cmd),
          outputPreview: tp.state?.output || tp.state?.error,
          status,
          error: tp.state?.error,
        }

        if (!currentCommandGroup) {
          currentCommandGroup = {
            kind: 'command',
            items: [],
            collapsedDefault: true,
          }
        }
        currentCommandGroup.items.push(commandItem)
        continue
      }

      // Other tools
      if (currentExploreGroup || currentCommandGroup || currentThoughtGroup) {
        flushCurrent()
      }
      const otherItem: OtherItem = {
        partId: tp.id,
        tool: tp.tool,
        title: tp.state?.title || tp.tool,
        status,
        rawPart: tp,
      }
      if (!currentOtherGroup) {
        currentOtherGroup = {
          kind: 'other',
          items: [],
          collapsedDefault: true,
        }
      }
      currentOtherGroup.items.push(otherItem)
    }
  }

  flushCurrent()

  // Duration calculation
  let durationMs = 0
  const created = info?.time?.created
  const completed = info?.time?.completed

  if (created && completed) {
    durationMs = Math.max(0, completed - created)
  } else if (created && !completed) {
    durationMs = Math.max(0, now - created)
  } else {
    // Fallback sum of tool/thought times
    let sumMs = 0
    for (const g of groups) {
      if (g.kind === 'thought') sumMs += g.durationMs
      else if (g.kind === 'edit') {
        const t = g.item.rawPart.state?.time
        if (t?.start && t?.end) sumMs += Math.max(0, t.end - t.start)
      }
    }
    durationMs = sumMs
  }

  const isLive =
    rawWorkParts.some(
      (p) =>
        p.type === 'tool' &&
        ((p as ToolPart).state?.status === 'running' || (p as ToolPart).state?.status === 'pending')
    ) || (Boolean(created) && !completed)

  const hasError =
    rawWorkParts.some(
      (p) => p.type === 'tool' && (p as ToolPart).state?.status === 'error'
    ) || groups.some((g) => g.kind === 'edit' && g.item.toolStatus === 'error')

  let totalWorkItems = 0
  for (const g of groups) {
    if (g.kind === 'edit') totalWorkItems += 1
    else totalWorkItems += g.items.length
  }

  return {
    hasWork,
    durationMs,
    isLive,
    answerParts,
    fileParts,
    groups,
    totalWorkItems,
    hasError,
  }
}
