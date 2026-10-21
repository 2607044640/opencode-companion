import type { Message, ToolPart } from '../types/opencode'
import {
  displayName,
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
  _sessionDir?: string
): RollbackAction[] {
  const targetIndex = messages.findIndex((m) => m.info.id === targetMsgId)
  if (targetIndex === -1) throw new Error('Revert target message is not loaded')
  const actions: RollbackAction[] = []
  for (const message of messages.slice(targetIndex)) {
    for (const rawPart of message.parts) {
      const part = rawPart as ToolPart
      if (part.type !== 'tool' || !['edit', 'write', 'apply_patch', 'patch', 'write_to_file', 'replace_file_content', 'create'].includes(String(part.tool))) continue
      if (part.state?.status !== 'completed') throw new Error('Revert cannot proceed while a mutation is unfinished or failed; inspect its snapshot first')
      const snapshot = part.state?.metadata?.revertSnapshot
      if (!snapshot || snapshot.version !== 1 || snapshot.session !== message.info.sessionID || typeof snapshot.call !== 'string') {
        throw new Error('Complete pre-mutation snapshot unavailable. Historical tool text and Git HEAD cannot safely restore this change.')
      }
      actions.push({ kind: 'snapshot', session: snapshot.session, call: snapshot.call })
    }
  }
  return actions
}
