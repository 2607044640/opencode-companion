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
  | { readonly kind: 'restore'; readonly path: string; readonly content: string }

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
  const posix = normalizePath(filePath)
  const winDesk = posix.match(/^[a-zA-Z]:\/Users\/[^/]+\/(?:OneDrive\/)?Desktop\/(.*)$/i)
  if (winDesk?.[1] !== undefined) return `/mnt/desktop/${winDesk[1]}`
  const wslDesk = posix.match(/^\/mnt\/[a-zA-Z]\/Users\/[^/]+\/(?:OneDrive\/)?Desktop\/(.*)$/i)
  if (wslDesk?.[1] !== undefined) return `/mnt/desktop/${wslDesk[1]}`
  if (posix.startsWith('/workspace/projects/')) {
    return `/home/developer/projects/${posix.slice('/workspace/projects/'.length)}`
  }
  return posix
}

export function isExternalToolPath(filePath: string): boolean {
  const p = toRollbackPath(filePath)
  if (!p) return false
  const lower = p.toLowerCase()
  if (lower === '/mnt/desktop' || lower.startsWith('/mnt/desktop/')) return true
  if (/^[a-z]:\/users\/[^/]+\/(onedrive\/)?desktop(\/|$)/i.test(p)) return true
  if (p.startsWith('/workspace/') || p.startsWith('/home/developer/projects/')) return false
  if (!p.startsWith('/') && !/^[a-zA-Z]:\//.test(p)) return false
  return true
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
  if (targetIndex <= 0) return false
  let existed = false
  forEachToolPart(messages, 0, targetIndex - 1, (part) => {
    if (!EDIT_TOOLS.has(toolNameOf(part))) return
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
    if (!EDIT_TOOLS.has(name)) return
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
    }
    acc.additions += item.additions
    acc.deletions += item.deletions
    if (WRITE_TOOLS.has(name) || item.status === 'added') acc.createdInRange = true
    if (item.status === 'deleted') acc.deletedInRange = true
    if (!WRITE_TOOLS.has(name) || item.status === 'modified') acc.editedInRange = true
    const oldStr = readString(part.state?.input, ['oldString', 'old_string', 'oldText', 'targetContent'])
    if (oldStr !== undefined && acc.earliestOld === undefined) acc.earliestOld = oldStr
    files.set(key, acc)
  })
  return files
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
    const existedBefore = fileExistedBeforeCheckpoint(messages, targetMsgId, acc.path)
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
