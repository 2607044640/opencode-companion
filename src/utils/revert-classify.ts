import type { Message, MessagePart, ToolPart } from '../types/opencode'
import { extractEditItem } from './worked-summary'

export type RevertFileStatus = 'added' | 'deleted' | 'modified'
export type RevertBadge = 'delete' | 'modify' | 'restore' | 'updated'

export type RevertFileDiff = {
  readonly file: string
  readonly filePath: string
  readonly status: RevertFileStatus
  readonly additions: number
  readonly deletions: number
}

export type RollbackAction =
  | { readonly kind: 'delete'; readonly path: string }
  | { readonly kind: 'restore'; readonly path: string; readonly content?: string }

const WRITE_TOOLS = new Set(['write', 'write_to_file', 'create'])
const EDIT_TOOLS = new Set([
  'edit',
  'write',
  'write_to_file',
  'replace_file_content',
  'patch',
  'apply_patch',
  'create',
])
const READ_TOOLS = new Set(['read', 'view_file', 'cat'])

function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`)
}

function isToolPart(part: MessagePart): part is ToolPart {
  return part.type === 'tool'
}

function normalizePath(raw: string): string {
  return raw.replace(/\\/g, '/').replace(/\/+$/, '').trim()
}

export function displayName(filePath: string): string {
  const normalized = normalizePath(filePath)
  return normalized.split('/').pop() || normalized
}

function toolNameOf(part: ToolPart): string {
  return String(part.tool || '').toLowerCase()
}

function toolFilePath(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  const raw = input.filePath ?? input.path ?? input.file ?? input.TargetFile
  return typeof raw === 'string' ? normalizePath(raw) : ''
}

function readString(input: Record<string, unknown> | undefined, keys: readonly string[]): string | undefined {
  if (!input) return undefined
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string') return value
  }
  return undefined
}

export function toRollbackPath(filePath: string): string {
  return normalizePath(filePath)
}

export function isExternalToolPath(_filePath: string): boolean {
  return false
}

export function sameRevertFile(a: string, b: string): boolean {
  const left = toRollbackPath(a).toLowerCase()
  const right = toRollbackPath(b).toLowerCase()
  if (!left || !right) return false
  if (left === right) return true
  return left.endsWith(`/${right}`) || right.endsWith(`/${left}`)
}

function forEachToolPart(
  messages: readonly Message[],
  fromIndex: number,
  toIndex: number,
  visit: (part: ToolPart) => void
): void {
  const last = Math.min(toIndex, messages.length - 1)
  for (let i = fromIndex; i <= last; i++) {
    const msg = messages[i]
    if (!msg) continue
    for (const part of msg.parts) {
      if (isToolPart(part)) visit(part)
    }
  }
}

export function fileExistedBeforeCheckpoint(
  messages: readonly Message[],
  targetMsgId: string,
  filePath: string
): boolean {
  const targetIndex = messages.findIndex((m) => m.info.id === targetMsgId)
  if (targetIndex < 0) return false
  if (targetIndex === 0) return false
  let existed = false
  forEachToolPart(messages, 0, targetIndex - 1, (part) => {
    const name = toolNameOf(part)
    if (!EDIT_TOOLS.has(name) && !READ_TOOLS.has(name)) return
    const path = toolFilePath(part.state?.input) || extractEditItem(part).filePath
    if (path && sameRevertFile(path, filePath)) existed = true
  })
  return existed
}

export type FileAcc = {
  path: string
  createdInRange: boolean
  editedInRange: boolean
  deletedInRange: boolean
  additions: number
  deletions: number
  earliestOld?: string
  earliestReadOutput?: string
  readBeforeFirstMutation: boolean
  sawModifiedStatus: boolean
  mutatedInRange: boolean
}

export function extractContentFromReadOutput(raw: string): string {
  if (!raw || typeof raw !== 'string') return ''

  let text = raw

  // 1. If wrapped in <content>...</content>, extract inner text
  const contentMatch = text.match(/<content>([\s\S]*?)(?:<\/content>|$)/i)
  if (contentMatch) {
    text = contentMatch[1]
  } else {
    // Strip <system-reminder>...</system-reminder>
    text = text.replace(/<system-reminder>[\s\S]*?(?:<\/system-reminder>|$)/gi, '')
    // Strip leading tool result headers
    text = text.replace(/^GROK_TOOL_RESULT[^\n]*\n(?:[^\n]*\n)*?(?=\s*(?:\d+[:|]|\S))/i, '')
  }

  // 2. Strip trailing (End of file... or (truncated... markers
  text = text.replace(/\n?\s*\((?:End of file|truncated)[^\n)]*\)\s*$/i, '')

  // 3. Strip line number prefixes like "1: ", " 12: ", "  3 | "
  const lines = text.split('\n')
  const hasLineNumbers = lines.some((l) => /^\s*\d+[:|]\s?/.test(l))
  if (hasLineNumbers) {
    text = lines.map((line) => line.replace(/^\s*\d+[:|]\s?/, '')).join('\n')
  }

  // Trim leading redundant newlines
  text = text.replace(/^\n+/, '')
  return text.endsWith('\n') ? text : `${text}\n`
}

export function accumulateRange(messages: readonly Message[], targetIndex: number): Map<string, FileAcc> {
  const files = new Map<string, FileAcc>()
  const findKey = (path: string): string => {
    for (const key of files.keys()) {
      if (sameRevertFile(key, path)) return key
    }
    return path
  }

  forEachToolPart(messages, targetIndex, messages.length - 1, (part) => {
    const name = toolNameOf(part)
    if (!EDIT_TOOLS.has(name) && !READ_TOOLS.has(name)) return
    const item = extractEditItem(part)
    const path = toolFilePath(part.state?.input) || item.filePath
    if (!path) return
    const key = findKey(path)
    const acc = files.get(key) ?? {
      path: key,
      createdInRange: false,
      editedInRange: false,
      deletedInRange: false,
      additions: 0,
      deletions: 0,
      readBeforeFirstMutation: false,
      sawModifiedStatus: false,
      mutatedInRange: false,
    }

    if (READ_TOOLS.has(name)) {
      if (!acc.mutatedInRange) {
        acc.readBeforeFirstMutation = true
        if (acc.earliestReadOutput === undefined && typeof part.state?.output === 'string') {
          const cleaned = extractContentFromReadOutput(part.state.output)
          if (cleaned) acc.earliestReadOutput = cleaned
        }
      }
      files.set(key, acc)
      return
    }

    acc.additions += item.additions
    acc.deletions += item.deletions
    if (WRITE_TOOLS.has(name) || item.status === 'added') acc.createdInRange = true
    if (item.status === 'deleted') acc.deletedInRange = true
    if (!WRITE_TOOLS.has(name) || item.status === 'modified') acc.editedInRange = true
    if (item.status === 'modified') acc.sawModifiedStatus = true
    const oldStr = readString(part.state?.input, ['oldString', 'old_string', 'oldText', 'targetContent'])
    if (oldStr !== undefined && acc.earliestOld === undefined) acc.earliestOld = oldStr
    acc.mutatedInRange = true
    files.set(key, acc)
  })
  return files
}

export function fileExistedAtCheckpoint(
  messages: readonly Message[],
  targetMsgId: string,
  filePath: string,
  acc: FileAcc
): boolean {
  if (fileExistedBeforeCheckpoint(messages, targetMsgId, filePath)) return true
  if (acc.earliestOld !== undefined) return true
  if (acc.readBeforeFirstMutation) return true
  if (acc.sawModifiedStatus) return true
  return false
}

function classifyStatus(acc: FileAcc, existedBefore: boolean): RevertFileStatus {
  if (acc.deletedInRange && !acc.createdInRange) return 'deleted'
  if (existedBefore) return 'modified'
  if (acc.createdInRange) return 'added'
  return 'modified'
}

export function computeRevertDiffs(
  messages: readonly Message[],
  targetMsgId: string
): RevertFileDiff[] {
  const targetIndex = messages.findIndex((m) => m.info.id === targetMsgId)
  if (targetIndex === -1) return []
  const files = accumulateRange(messages, targetIndex)
  return Array.from(files.values()).map((acc) => {
    const existedBefore = fileExistedAtCheckpoint(messages, targetMsgId, acc.path, acc)
    return {
      file: displayName(acc.path),
      filePath: acc.path,
      status: classifyStatus(acc, existedBefore),
      additions: acc.additions,
      deletions: acc.deletions,
    }
  })
}

export function classifyRevertBadge(diff: { readonly status?: RevertFileStatus }): RevertBadge {
  switch (diff.status) {
    case 'added':
      return 'delete'
    case 'deleted':
      return 'restore'
    case 'modified':
      return 'modify'
    case undefined:
      return 'updated'
    default:
      return assertNever(diff.status)
  }
}

export function lastContentBeforeCheckpoint(
  messages: readonly Message[],
  targetIndex: number,
  filePath: string
): string | undefined {
  let content: string | undefined
  forEachToolPart(messages, 0, targetIndex - 1, (part) => {
    if (!EDIT_TOOLS.has(toolNameOf(part))) return
    const path = toolFilePath(part.state?.input)
    if (!path || !sameRevertFile(path, filePath)) return
    const written = readString(part.state?.input, ['contents', 'content', 'CodeContent', 'newString', 'new_string'])
    if (written !== undefined) content = written
  })
  return content
}
