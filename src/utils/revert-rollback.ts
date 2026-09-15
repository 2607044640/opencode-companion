import type { Message } from '../types/opencode'
import {
  accumulateRange,
  displayName,
  fileExistedBeforeCheckpoint,
  isExternalToolPath,
  lastContentBeforeCheckpoint,
  toRollbackPath,
  type RevertFileDiff,
  type RevertFileStatus,
  type RollbackAction,
} from './revert-classify'

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

export function collectRollbackActions(
  messages: readonly Message[],
  targetMsgId: string
): RollbackAction[] {
  const targetIndex = messages.findIndex((m) => m.info.id === targetMsgId)
  if (targetIndex === -1) return []
  const files = accumulateRange(messages, targetIndex)
  const actions: RollbackAction[] = []

  for (const acc of files.values()) {
    const path = toRollbackPath(acc.path)
    const existedBefore = fileExistedBeforeCheckpoint(messages, targetMsgId, path)
    if (acc.createdInRange && !existedBefore) {
      actions.push({ kind: 'delete', path })
      continue
    }
    if (!isExternalToolPath(path) && !isExternalToolPath(acc.path)) continue
    const restoreContent =
      lastContentBeforeCheckpoint(messages, targetIndex, path) ?? acc.earliestOld
    if (restoreContent !== undefined) {
      actions.push({ kind: 'restore', path, content: restoreContent })
    }
  }
  return actions
}
