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
  readonly sessionDir?: string
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
  const { sessionId, messageId, mode, partID, messages, sessionDir } = input
  console.log(`[Revert:Engine] runRevertPipeline starting:`, {
    sessionId,
    messageId,
    mode,
    sessionDir,
    messagesCount: messages.length,
  })

  if (mode === 'summarize') {
    console.log(`[Revert:Engine] Mode is summarize. Calling summarizeSession...`)
    await port.summarizeSession(sessionId)
    await port.reloadSession(sessionId)
    return { ok: true }
  }

  const files = mode !== 'conversation_only'
  const actions = files ? collectRollbackActions(messages, messageId, sessionDir) : []
  console.log(`[Revert:Engine] Files rollback enabled: ${files}. Collected ${actions.length} action(s).`)

  if (mode === 'code_only') {
    console.log(`[Revert:Engine] Mode is code_only. Calling revertSession and rollbackFiles...`)
    await port.revertSession(sessionId, messageId, { files: true, partID })
    if (actions.length > 0) {
      const rolled = await port.rollbackFiles(actions)
      if (!rolled.ok) {
        const errMsg = `[Revert:Engine] rollbackFiles failed: ${rolled.error || 'unknown host error'}`
        console.error(errMsg)
        return { ok: false, error: errMsg }
      }
    }
    const cleared = await port.unrevertSession(sessionId)
    port.onSessionUpdate?.(sessionId, { revert: undefined })
    await port.reloadSession(sessionId)
    return { ok: true, session: cleared }
  }

  console.log(`[Revert:Engine] Calling daemon revertSession(sessionId=${sessionId}, messageId=${messageId})...`)
  const updated = await port.revertSession(sessionId, messageId, { files, partID })
  console.log(`[Revert:Engine] daemon revertSession succeeded. Result:`, updated)

  if (actions.length > 0) {
    console.log(`[Revert:Engine] Calling port.rollbackFiles for ${actions.length} action(s)...`)
    const rolled = await port.rollbackFiles(actions)
    console.log(`[Revert:Engine] rollbackFiles result:`, rolled)
    if (!rolled.ok) {
      const errMsg = `[Revert:Engine] rollbackFiles failed: ${rolled.error || 'unknown host error'}`
      console.error(errMsg)
      return { ok: false, error: errMsg }
    }
  }

  const revertPatch = updated?.revert || { messageID: messageId }
  console.log(`[Revert:Engine] Applying onSessionUpdate patch:`, revertPatch)
  port.onSessionUpdate?.(sessionId, { revert: revertPatch })

  console.log(`[Revert:Engine] Reloading session data for ${sessionId}...`)
  await port.reloadSession(sessionId)

  console.log(`[Revert:Engine] Revert pipeline successfully finished!`)
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
    console.error(`[Revert:Engine] executeRevertWithTimeout caught error:`, err)
    if (err instanceof RevertTimeoutError) {
      return { ok: false, error: err.message, timedOut: true }
    }
    if (err instanceof Error) {
      return { ok: false, error: err.message }
    }
    return { ok: false, error: 'Revert failed' }
  }
}
