import type { AgentInfo, CommandItem, ProviderInfo } from '../../types/opencode'
import { isModelVisible } from '../../utils/model-filter'

const ALIAS_AGENT_NAMES = new Set(['prometheus', 'atlas', 'sisyphus'])

const BUILTIN_DEFAULT_COMMANDS: readonly CommandItem[] = [
  { name: 'btw', description: 'Ask a quick question without interrupting the main conversation.' },
  { name: 'compact', description: 'Summarize the session to reduce context size' },
  { name: 'summary', description: 'Generate structured conversation summary' },
  { name: 'title', description: 'Auto-generate descriptive session title' },
  { name: 'undo', description: 'Revert last exchange or tool invocation' },
]

function agentPriority(name: string): number {
  if (name === 'build') return 1
  if (name === 'plan') return 2
  if (name === 'scout') return 3
  return 10
}

export function filterAndSortSelectableAgents(
  agentList: readonly AgentInfo[],
  daemonDefaultAgent?: string
): { finalAgents: AgentInfo[]; defaultAgentName: string } {
  const usableAgents = agentList.filter((a) => {
    if (a.hidden) return false
    if (a.mode === 'subagent') return false
    if (a.name === 'librarian') return false
    if (ALIAS_AGENT_NAMES.has(a.name.toLowerCase())) return false
    return true
  })

  usableAgents.sort((a, b) => agentPriority(a.name) - agentPriority(b.name))
  const finalAgents = usableAgents.length > 0 ? usableAgents : [...agentList]

  let defaultAgentName = 'build'
  if (daemonDefaultAgent && finalAgents.some((a) => a.name === daemonDefaultAgent)) {
    defaultAgentName = daemonDefaultAgent
  } else {
    const buildAgent = finalAgents.find((a) => a.name === 'build')
    if (buildAgent) {
      defaultAgentName = buildAgent.name
    } else if (finalAgents.length > 0) {
      defaultAgentName = finalAgents[0].name
    }
  }

  return { finalAgents, defaultAgentName }
}

export function mergeBuiltinCommands(commandList: readonly CommandItem[]): CommandItem[] {
  const mergedCmds = [...commandList]
  for (const def of BUILTIN_DEFAULT_COMMANDS) {
    if (!mergedCmds.some((c) => c.name === def.name)) {
      mergedCmds.push(def)
    }
  }
  return mergedCmds
}

export function buildGroupedModelsForDropdown(
  providers: readonly ProviderInfo[],
  modelSearchQuery: string,
  modelVisibility?: Record<string, boolean>,
  providerVisibility?: Record<string, boolean>
): {
  providerID: string
  providerName: string
  models: { id: string; name: string }[]
}[] {
  const q = modelSearchQuery.toLowerCase().trim()
  const groups: {
    providerID: string
    providerName: string
    models: { id: string; name: string }[]
  }[] = []

  for (const p of providers) {
    const visibleModels: { id: string; name: string }[] = []

    for (const [mId, mObj] of Object.entries(p.models || {})) {
      const name = mObj.name || mId
      const visible = isModelVisible(p.id, mId, name, modelVisibility, providerVisibility)
      if (!visible) continue

      if (q) {
        const matchProvider = (p.name || p.id).toLowerCase().includes(q)
        const matchId = mId.toLowerCase().includes(q)
        const matchName = name.toLowerCase().includes(q)
        if (!matchProvider && !matchId && !matchName) continue
      }

      visibleModels.push({ id: mId, name })
    }

    if (visibleModels.length > 0) {
      groups.push({
        providerID: p.id,
        providerName: p.name || p.id,
        models: visibleModels,
      })
    }
  }

  return groups
}

export function applyAtMentionInsertion(
  text: string,
  cursor: number,
  mentionTarget: string
): { newText: string; newCursor: number } | null {
  const lastAt = text.lastIndexOf('@', cursor - 1)
  if (lastAt === -1) return null
  const beforeAt = text.slice(0, lastAt)
  const afterCursor = text.slice(cursor)
  const prefix = `${beforeAt}@${mentionTarget} `
  return {
    newText: `${prefix}${afterCursor}`,
    newCursor: prefix.length,
  }
}

export type SpecialSlashCommand =
  | { kind: 'btw'; question: string }
  | { kind: 'compact' }
  | null

export function parseSpecialSlashCommand(text: string): SpecialSlashCommand {
  const trimmed = text.trim()
  if (trimmed === '/btw' || trimmed.startsWith('/btw ')) {
    const question = trimmed.replace(/^\/btw\s*/, '').trim()
    if (question) {
      return { kind: 'btw', question }
    }
    return null
  }
  if (
    trimmed === '/compact' ||
    trimmed.startsWith('/compact ') ||
    trimmed === '/compaction' ||
    trimmed.startsWith('/compaction ')
  ) {
    return { kind: 'compact' }
  }
  return null
}
