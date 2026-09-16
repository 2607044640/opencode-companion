import type { RollbackAction } from '../utils/revert-engine'

export type ExternalRollbackAction = RollbackAction

export interface GitCheckpointResult {
  readonly ok: boolean
  readonly skipped?: string
  readonly committed?: boolean
  readonly files?: readonly string[]
  readonly message?: string
  readonly error?: string
}

export async function postGitCheckpoint(input: {
  readonly directory: string
  readonly title: string
  readonly summary: string
}): Promise<GitCheckpointResult> {
  const res = await fetch('/api/git-checkpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(25000),
  })
  const text = await res.text()
  let data: GitCheckpointResult
  try {
    data = JSON.parse(text) as GitCheckpointResult
  } catch {
    return { ok: false, error: `host api returned non-json: ${text.slice(0, 80)}` }
  }
  if (!res.ok) {
    return { ok: false, error: data.error || `HTTP ${res.status}` }
  }
  return data
}

export async function postExternalFileRollback(
  actions: readonly RollbackAction[]
): Promise<{ ok: boolean; error?: string }> {
  if (actions.length === 0) return { ok: true }
  const res = await fetch('/api/external-file-rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actions }),
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  let data: { ok?: boolean; error?: string }
  try {
    data = JSON.parse(text) as { ok?: boolean; error?: string }
  } catch {
    return { ok: false, error: `host api returned non-json: ${text.slice(0, 80)}` }
  }
  if (!res.ok || data.ok === false) {
    return { ok: false, error: data.error || `HTTP ${res.status}` }
  }
  return { ok: true }
}
