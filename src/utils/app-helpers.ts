import type { Message, Project, PromptAttachment } from '../types/opencode'
import { canonicalizeDirectory } from '../services/api'

export function resolveDraftSessionLaunch(
  text: string,
  options: { attachments?: PromptAttachment[] } | undefined,
  selectedProjectId: string | null,
  projects: readonly Project[]
): { projectDirectory: string; sessionTitle: string } {
  const selectedProject = selectedProjectId
    ? projects.find(
        (p) =>
          p.id === selectedProjectId ||
          Boolean(p.associatedIds && p.associatedIds.includes(selectedProjectId))
      )
    : null
  const projectDirectory = (selectedProject?.worktree
    ? canonicalizeDirectory(selectedProject.worktree)
    : '/home/developer/projects/APISpace') || '/home/developer/projects/APISpace'
  const sessionTitle =
    text.trim().slice(0, 40) ||
    (options?.attachments && options.attachments.length > 0
      ? options.attachments[0].name?.slice(0, 40) || 'Image'
      : '') ||
    `New session - ${new Date().toLocaleString('zh-CN', { hour12: false })}`

  return { projectDirectory, sessionTitle }
}

export function resolveRestoreMessageAction(
  messages: readonly Message[],
  revertMessageId: string | undefined,
  targetMsgId: string
): { action: 'unrevert' } | { action: 'revert'; targetBoundaryId: string } {
  const revertIndex = revertMessageId
    ? messages.findIndex((m) => m.info.id === revertMessageId)
    : -1
  const rolledBackUserMessages =
    revertIndex !== -1 ? messages.slice(revertIndex).filter((m) => m.info.role === 'user') : []
  const isLatest =
    rolledBackUserMessages.length <= 1 ||
    rolledBackUserMessages[rolledBackUserMessages.length - 1].info.id === targetMsgId

  if (isLatest) {
    return { action: 'unrevert' }
  }

  const msgIndex = messages.findIndex((m) => m.info.id === targetMsgId)
  const nextMsg = msgIndex !== -1 && msgIndex + 1 < messages.length ? messages[msgIndex + 1] : null
  const targetBoundaryId =
    nextMsg && nextMsg.info.role === 'assistant' ? nextMsg.info.id : targetMsgId
  return { action: 'revert', targetBoundaryId }
}

export function resolveActiveMapDirectory(
  projects: readonly Project[],
  selectedProjectId: string | null,
  activeSessionDirectory?: string
): string | undefined {
  const selectedWorktree = projects.find((p) => p.id === selectedProjectId)?.worktree
  if (selectedWorktree && selectedWorktree !== '/') {
    return selectedWorktree
  }
  if (activeSessionDirectory) {
    return activeSessionDirectory
  }
  return projects.find((p) => p.worktree && p.worktree !== '/')?.worktree
}
