import type { Message, MessagePart, ToolPart, TextPart } from '../types/opencode'
import { classifyTool } from './worked-summary'

const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|rs|go|md|css|html|vue|svelte|json)$/i

const SENSITIVE_BASENAME =
  /(?:^|\/)(?:\.env(?:\..*)?|one-api\.db|api_secrets\.json)$/i

const SENSITIVE_EXT = /\.(?:key|pem|p12|pfx|crt|cer)$/i

const SENSITIVE_NAME =
  /(?:secret|credential|password|passwd|private[_-]?key)/i

const TOKEN_BASENAME = /token/i

const BLOCKED_DIR = /(?:^|\/)(?:gateway\/logs|\.git\/hooks)(?:\/|$)/i

export function isSensitiveGitPath(filePath: string): boolean {
  const p = filePath.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!p || p === '.') return true
  if (BLOCKED_DIR.test(p)) return true
  const base = p.split('/').pop() || p
  if (SENSITIVE_BASENAME.test(base) || SENSITIVE_BASENAME.test(p)) return true
  if (SENSITIVE_EXT.test(base)) return true
  if (SENSITIVE_NAME.test(base)) return true
  if (TOKEN_BASENAME.test(base) && !SOURCE_EXT.test(base)) return true
  return false
}

export function filterCheckpointPaths(paths: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of paths) {
    const p = raw.replace(/\\/g, '/').trim()
    if (!p || seen.has(p)) continue
    if (isSensitiveGitPath(p)) continue
    seen.add(p)
    out.push(p)
  }
  return out
}

export function formatCheckpointCommitMessage(title: string, summary: string): string {
  const safeTitle = sanitizeCommitFragment(title) || 'Untitled Session'
  const safeSummary = sanitizeCommitFragment(summary) || 'workspace changes'
  return `[OpenCode-Checkpoint] ${safeTitle}: ${safeSummary}`
}

function sanitizeCommitFragment(raw: string): string {
  return raw.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
}

function isToolPart(part: MessagePart): part is ToolPart {
  return part.type === 'tool'
}

export function lastCompletedTurnMutatedFiles(messages: readonly Message[]): boolean {
  let lastUser = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.info.role === 'user') {
      lastUser = i
      break
    }
  }
  if (lastUser === -1) return false

  for (let i = lastUser + 1; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg || msg.info.role !== 'assistant') continue
    for (const part of msg.parts) {
      if (!isToolPart(part)) continue
      if (classifyTool(part.tool) === 'edit') return true
    }
  }
  return false
}

export function extractTurnSummary(messages: readonly Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.info.role !== 'user') continue
    const text = msg.parts
      .filter((p): p is TextPart => p.type === 'text')
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join(' ')
    if (text) return text
  }
  return ''
}

export function resolveCheckpointDirectory(rawDir: string | undefined): string | undefined {
  if (!rawDir) return undefined
  const normalized = rawDir.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normalized.startsWith('/workspace/projects/')) {
    return `/home/developer/projects/${normalized.slice('/workspace/projects/'.length)}`
  }
  return normalized
}
