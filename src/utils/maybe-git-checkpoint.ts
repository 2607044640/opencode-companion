import { api } from '../services/api'
import { postGitCheckpoint } from '../services/host-api'
import { getPreferences } from './preferences'
import {
  extractTurnSummary,
  resolveCheckpointDirectory,
} from './git-checkpoint'
import type { Message } from '../types/opencode'

const inFlight = new Set<string>()

export async function maybeCommitGitCheckpoint(
  sessionId: string,
  messages: readonly Message[]
): Promise<void> {
  if (!sessionId || sessionId === '__draft__') return
  if (getPreferences().autoGitCheckpoint === false) return
  try {
    const session = await api.getSession(sessionId)
    const directory = resolveCheckpointDirectory(session.directory)
    if (!directory) return
    if (inFlight.has(directory)) return
    inFlight.add(directory)
    try {
      const title = session.title || 'Untitled Session'
      const summary = extractTurnSummary(messages) || 'workspace changes'
      await postGitCheckpoint({ directory, title, summary })
    } finally {
      inFlight.delete(directory)
    }
  } catch (err) {
    console.warn('git checkpoint skipped:', err)
  }
}
