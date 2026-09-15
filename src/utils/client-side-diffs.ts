import type { Message } from '../types/opencode'
import type { ConfirmUndoFileDiff } from '../components/chat/ConfirmUndoModal'
import { computeRevertDiffs, mergeRevertDiffs as mergeEngineDiffs } from './revert-engine'

export function computeClientSideDiffs(
  messages: readonly Message[],
  targetMsgId: string
): ConfirmUndoFileDiff[] {
  return computeRevertDiffs(messages, targetMsgId).map((diff) => ({
    file: diff.file,
    status: diff.status,
    additions: diff.additions,
    deletions: diff.deletions,
  }))
}

export function mergeRevertDiffs(
  daemonDiffs: readonly ConfirmUndoFileDiff[],
  clientDiffs: readonly ConfirmUndoFileDiff[]
): ConfirmUndoFileDiff[] {
  return mergeEngineDiffs(daemonDiffs, clientDiffs).map((diff) => ({
    file: diff.file,
    status: diff.status,
    additions: diff.additions,
    deletions: diff.deletions,
  }))
}
