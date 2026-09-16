import type { Message } from '../types/opencode'
import {
  accumulateRange,
  displayName,
  fileExistedAtCheckpoint,
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
  targetMsgId: string,
  sessionDir?: string
): RollbackAction[] {
  const targetIndex = messages.findIndex((m) => m.info.id === targetMsgId)
  if (targetIndex === -1) return []
  const files = accumulateRange(messages, targetIndex)
  const actions: RollbackAction[] = []
  console.log(`[Revert:Rollback] Scanning ${files.size} modified files for targetMsgId: ${targetMsgId} (index: ${targetIndex})`)

  for (const acc of files.values()) {
    let rawPath = acc.path
    if (!rawPath.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(rawPath) && sessionDir) {
      rawPath = `${sessionDir.replace(/\\/g, '/').replace(/\/+$/, '')}/${rawPath}`
    }
    const path = toRollbackPath(rawPath)
    const existedBefore = fileExistedAtCheckpoint(messages, targetMsgId, acc.path, acc)

    const isProject = path.startsWith('/workspace/projects/') || path.startsWith('/projects/') || /^[a-zA-Z]:[\\/]/.test(path)
    if (!isProject) {
      console.warn(`[Revert:Rollback] Skipping non-project path: ${path} (raw: ${rawPath})`)
      continue
    }

    if (acc.createdInRange && !existedBefore) {
      const action: RollbackAction = { kind: 'delete', path }
      console.log(`[Revert:Rollback] Action generated (delete newly created file):`, action)
      actions.push(action)
      continue
    }

    if (existedBefore || acc.editedInRange || acc.mutatedInRange) {
      const restoreContent =
        acc.earliestOld ??
        acc.earliestReadOutput ??
        lastContentBeforeCheckpoint(messages, targetIndex, acc.path)

      const action: RollbackAction = {
        kind: 'restore',
        path,
        content: restoreContent,
      }
      console.log(
        `[Revert:Rollback] Action generated (restore file):`,
        action.path,
        restoreContent !== undefined ? `(content length: ${restoreContent.length})` : '(will use git fallback)'
      )
      actions.push(action)
    }
  }
  console.log(`[Revert:Rollback] Total rollback actions: ${actions.length}`)
  return actions
}
