export {
  classifyRevertBadge,
  computeRevertDiffs,
  fileExistedAtCheckpoint,
  fileExistedBeforeCheckpoint,
  isExternalToolPath,
  sameRevertFile,
  toRollbackPath,
  extractContentFromReadOutput,
  type RevertBadge,
  type RevertFileDiff,
  type RevertFileStatus,
  type RollbackAction,
} from './revert-classify'

export {
  clearRolledBackCalls,
  collectRollbackActions,
  getRolledBackCalls,
  markCallsRolledBack,
  mergeRevertDiffs,
} from './revert-rollback'

export {
  REVERT_TIMEOUT_MS,
  RevertTimeoutError,
  executeRevertWithTimeout,
  withRevertTimeout,
  type RevertDaemonPort,
  type RevertExecuteResult,
  type RevertMode,
  type RevertPipelineInput,
} from './revert-execute'
