import type { Message } from '../types/opencode'
import {
  collectRollbackActions,
  isExternalToolPath,
  type RollbackAction,
} from './revert-engine'

export type ExternalRollbackAction = RollbackAction

export { isExternalToolPath }

export function collectExternalRollbackActions(
  messages: readonly Message[],
  targetMsgId: string
): ExternalRollbackAction[] {
  // Legacy external actions are disabled; snapshot actions use the unified pipeline.
  if (!messages.slice(messages.findIndex((m) => m.info.id === targetMsgId)).some((m) => m.parts.some((p: any) => p.state?.metadata?.revertSnapshot))) return []
  return collectRollbackActions(messages, targetMsgId).filter((action) =>
    action.kind !== 'snapshot' && isExternalToolPath(action.path)
  )
}
