import type { Message, ToolPart } from '../types/opencode'
import {
  displayName,
  isMutationToolName,
  type RevertFileDiff,
  type RevertFileStatus,
  type RollbackAction,
} from './revert-classify'

function isValidRevertSnapshot(
  snapshot: unknown,
  sessionID: string
): snapshot is { version: 1; session: string; call: string } {
  if (!snapshot || typeof snapshot !== 'object') return false
  const s = snapshot as { version?: unknown; session?: unknown; call?: unknown }
  return s.version === 1 && s.session === sessionID && typeof s.call === 'string'
}

export function mergeRevertDiffs(
  daemonDiffs: readonly {
    readonly file: string
    readonly status?: RevertFileStatus
    readonly additions: number
    readonly deletions: number
  }[],
  clientDiffs: readonly {
    readonly file: string
    readonly filePath?: string
    readonly status?: RevertFileStatus
    readonly additions: number
    readonly deletions: number
  }[]
): RevertFileDiff[] {
  const merged = new Map<string, RevertFileDiff>()

  for (const diff of daemonDiffs) {
    const file = displayName(diff.file)
    merged.set(file, {
      file,
      filePath: diff.file,
      status: diff.status ?? 'modified',
      additions: diff.additions,
      deletions: diff.deletions,
    })
  }

  for (const diff of clientDiffs) {
    const existing = merged.get(diff.file)
    if (!existing) {
      merged.set(diff.file, {
        file: displayName(diff.file),
        filePath: diff.filePath || diff.file,
        status: diff.status ?? 'modified',
        additions: diff.additions,
        deletions: diff.deletions,
      })
      continue
    }
    const daemonEmpty = existing.additions === 0 && existing.deletions === 0
    const clientKnowsModify = diff.status === 'modified'
    const daemonGuessedCreate = existing.status === 'added' && daemonEmpty
    merged.set(diff.file, {
      file: diff.file,
      filePath: diff.filePath || existing.filePath,
      status: clientKnowsModify || daemonGuessedCreate ? (diff.status ?? existing.status) : existing.status,
      additions: daemonEmpty ? diff.additions : existing.additions,
      deletions: daemonEmpty ? diff.deletions : existing.deletions,
    })
  }

  return Array.from(merged.values())
}

const rolledBackCallsBySession = new Map<string, Set<string>>()

const STORAGE_PREFIX = 'opencode:code-only-rolled-back:'

function loadPersistedSet(sessionId: string): Set<string> {
  let set = rolledBackCallsBySession.get(sessionId)
  if (set) return set
  set = new Set<string>()
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${sessionId}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string') set.add(item)
          }
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  rolledBackCallsBySession.set(sessionId, set)
  return set
}

function persistSet(sessionId: string, set: Set<string>): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (set.size === 0) {
        sessionStorage.removeItem(`${STORAGE_PREFIX}${sessionId}`)
      } else {
        sessionStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, JSON.stringify(Array.from(set)))
      }
    }
  } catch {
    // ignore storage errors
  }
}

export function markCallsRolledBack(sessionId: string, calls: Iterable<string>): void {
  if (!sessionId) return
  const set = loadPersistedSet(sessionId)
  for (const call of calls) {
    if (call) set.add(call)
  }
  persistSet(sessionId, set)
}

export function getRolledBackCalls(sessionId?: string): ReadonlySet<string> {
  if (!sessionId) return new Set<string>()
  return loadPersistedSet(sessionId)
}

export function clearRolledBackCalls(sessionId: string): void {
  if (!sessionId) return
  rolledBackCallsBySession.delete(sessionId)
  persistSet(sessionId, new Set<string>())
}

export function collectRollbackActions(
  messages: readonly Message[],
  targetMsgId: string,
  _sessionDir?: string,
  alreadyRolledBack?: ReadonlySet<string>
): RollbackAction[] {
  const targetIndex = messages.findIndex((m) => m.info.id === targetMsgId)
  if (targetIndex === -1) throw new Error('Revert target message is not loaded')
  const sessionId = messages[targetIndex]?.info.sessionID || messages[0]?.info.sessionID
  const skippedCalls = alreadyRolledBack ?? getRolledBackCalls(sessionId)
  const actions: RollbackAction[] = []
  for (const message of messages.slice(targetIndex)) {
    for (const rawPart of message.parts) {
      const part = rawPart as ToolPart
      if (part.type !== 'tool' || !isMutationToolName(part.tool)) continue
      const status = part.state?.status
      const snapshot = part.state?.metadata?.revertSnapshot
      if (status !== 'completed') {
        if (isValidRevertSnapshot(snapshot, message.info.sessionID)) {
          if (!skippedCalls.has(snapshot.call)) {
            actions.push({ kind: 'snapshot', session: snapshot.session, call: snapshot.call })
          }
          continue
        }
        // If an edit/write/patch failed before completing (e.g. oldString not found or blocked by hook),
        // it was rejected without mutating the file. Only block when a tool is actively pending/running.
        if (status === 'error') {
          continue
        }
        throw new Error('Revert cannot proceed while a mutation is unfinished or failed; inspect its snapshot first')
      }
      if (!isValidRevertSnapshot(snapshot, message.info.sessionID)) {
        throw new Error('Complete pre-mutation snapshot unavailable. Historical tool text and Git HEAD cannot safely restore this change.')
      }
      if (skippedCalls.has(snapshot.call)) {
        continue
      }
      actions.push({ kind: 'snapshot', session: snapshot.session, call: snapshot.call })
    }
  }
  return actions
}
