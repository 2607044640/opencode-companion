import type { Message, Session } from '../types/opencode'
import type { RollbackAction } from './revert-classify'
import { collectRollbackActions } from './revert-rollback'

export const REVERT_TIMEOUT_MS = 8000

export type RevertMode = 'both' | 'conversation_only' | 'code_only' | 'summarize'

export type RevertExecuteResult =
  | { readonly ok: true; readonly session?: Session }
  | { readonly ok: false; readonly error: string; readonly timedOut?: boolean }

export type RevertPipelineInput = {
  readonly sessionId: string
  readonly messageId: string
  readonly mode: RevertMode
  readonly partID?: string
  readonly messages: readonly Message[]
}

export type RevertDaemonPort = {
  readonly revertSession: (
    sessionId: string,
    messageId: string,
    opts: { files: boolean; partID?: string }
  ) => Promise<Session>
  readonly unrevertSession: (sessionId: string) => Promise<Session>
  readonly summarizeSession: (sessionId: string) => Promise<void>
  readonly rollbackFiles: (actions: readonly RollbackAction[]) => Promise<{ ok: boolean; error?: string }>
  readonly reloadSession: (sessionId: string) => Promise<void>
  readonly onSessionUpdate?: (sessionId: string, patch: Partial<Session>) => void
}

export class RevertTimeoutError extends Error {
  readonly name = 'RevertTimeoutError'
  readonly timeoutMs: number
  constructor(timeoutMs: number) {
    super(`Revert timed out after ${timeoutMs}ms`)
    this.timeoutMs = timeoutMs
  }
}

export async function withRevertTimeout<T>(
  work: Promise<T>,
  timeoutMs: number = REVERT_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RevertTimeoutError(timeoutMs)), timeoutMs)
  })
  try {
    return await Promise.race([work, timeoutPromise])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function runRevertPipeline(
  input: RevertPipelineInput,
  port: RevertDaemonPort
): Promise<RevertExecuteResult> {
  const { sessionId, messageId, mode, partID, messages } = input
  if (mode === 'summarize') {
    await port.summarizeSession(sessionId)
    await port.reloadSession(sessionId)
    return { ok: true }
  }

  const files = mode !== 'conversation_only'
  const actions = files ? collectRollbackActions(messages, messageId) : []

  if (mode === 'code_only') {
    await port.revertSession(sessionId, messageId, { files: true, partID })
    if (actions.length > 0) {
      const rolled = await port.rollbackFiles(actions)
      if (!rolled.ok) return { ok: false, error: rolled.error || 'file rollback failed' }
    }
    const cleared = await port.unrevertSession(sessionId)
    port.onSessionUpdate?.(sessionId, { revert: undefined })
    await port.reloadSession(sessionId)
    return { ok: true, session: cleared }
  }

  const updated = await port.revertSession(sessionId, messageId, { files, partID })
  if (actions.length > 0) {
    const rolled = await port.rollbackFiles(actions)
    if (!rolled.ok) return { ok: false, error: rolled.error || 'file rollback failed' }
  }
  port.onSessionUpdate?.(sessionId, { revert: updated.revert })
  await port.reloadSession(sessionId)
  return { ok: true, session: updated }
}

export async function executeRevertWithTimeout(
  input: RevertPipelineInput,
  port: RevertDaemonPort,
  timeoutMs: number = REVERT_TIMEOUT_MS
): Promise<RevertExecuteResult> {
  try {
    return await withRevertTimeout(runRevertPipeline(input, port), timeoutMs)
  } catch (err) {
    if (err instanceof RevertTimeoutError) {
      return { ok: false, error: err.message, timedOut: true }
    }
    if (err instanceof Error) {
      return { ok: false, error: err.message }
    }
    return { ok: false, error: 'Revert failed' }
  }
}
