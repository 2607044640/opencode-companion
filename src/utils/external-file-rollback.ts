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
  return collectRollbackActions(messages, targetMsgId).filter((action) =>
    isExternalToolPath(action.path)
  )
}
