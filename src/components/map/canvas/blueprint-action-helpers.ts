import type React from "react"
import type { TalkMap } from "../schema/talk-map"
import type { Project } from "../../../types/opencode"
import type { TalkMapClient } from "../opencode/client"
import type { ViewState } from "./map-interactions"
import { formatProjectPill, resolveSessionProject } from "../../../utils/session-workspace"
import { applyInjectedBranch, createInjectedBranch } from "./connect-inject"
import { applyCreatedSession } from "./map-interactions"
import { createUntitledAtClick } from "./create-at-click"
import { applyLinkOnView } from "./map-gestures"

export type ProjectSessionItem = {
  readonly cardId: string
  readonly sessionId?: string
  readonly title: string
  readonly nextStep?: string
  readonly directory?: string
  readonly projectName?: string
  readonly projectBadge?: string
  readonly projectColorClass?: string
}

export function filterProjectSessions(input: {
  readonly cards: TalkMap["cards"]
  readonly titles: Record<string, string>
  readonly directory?: string
  readonly query: string
  readonly excludeCardId?: string
  readonly projects?: readonly { id: string; worktree: string; name?: string }[]
}): ProjectSessionItem[] {
  const q = input.query.trim().toLowerCase()
  const words = q.split(/\s+/).filter(Boolean)
  const isAllDir = !input.directory || input.directory === "all"

  type ScoredItem = {
    item: ProjectSessionItem
    score: number
  }

  const scored: ScoredItem[] = []

  for (const card of Object.values(input.cards)) {
    if (!isAllDir && card.directory !== input.directory) {
      continue
    }
    if (input.excludeCardId && card.cardId === input.excludeCardId) {
      continue
    }

    const sessionId = card.sessionId
    const title = card.label ?? (sessionId ? input.titles[sessionId] ?? sessionId : "Untitled")

    const badge = resolveSessionProject(
      { directory: card.directory },
      (input.projects as unknown as readonly Project[]) || [],
    )
    const projectName = badge.name
    const projectBadge = formatProjectPill(badge.name)
    const projectColorClass = badge.colorClass

    const titleLower = title.toLowerCase()
    const projLower = projectName.toLowerCase()
    const dirLower = (card.directory || "").toLowerCase()
    const sessionLower = (sessionId || "").toLowerCase()

    let score = 0

    if (words.length === 0) {
      score = 1
    } else {
      // 1. Full phrase matches
      if (titleLower.startsWith(q)) {
        score += 200
      } else if (titleLower.includes(q)) {
        score += 120
      } else if (projLower.includes(q)) {
        score += 80
      } else if (dirLower.includes(q)) {
        score += 50
      } else if (sessionLower.includes(q)) {
        score += 60
      }

      // 2. Multi-word matching (all words must match across title, project, directory, or session)
      let allWordsMatched = true
      let wordScore = 0

      for (const w of words) {
        const inTitle = titleLower.includes(w)
        const inProj = projLower.includes(w)
        const inDir = dirLower.includes(w)
        const inSession = sessionLower.includes(w)

        if (inTitle) {
          wordScore += titleLower.startsWith(w) ? 40 : 25
        } else if (inProj) {
          wordScore += 20
        } else if (inDir) {
          wordScore += 15
        } else if (inSession) {
          wordScore += 10
        } else {
          allWordsMatched = false
          break
        }
      }

      if (allWordsMatched) {
        score += wordScore
      }
    }

    if (score > 0) {
      scored.push({
        item: {
          cardId: card.cardId,
          ...(sessionId ? { sessionId } : {}),
          title,
          directory: card.directory,
          projectName,
          projectBadge,
          projectColorClass,
        },
        score,
      })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.item)
}

export type BlueprintMenuState = {
  readonly clientPoint: { readonly x: number; readonly y: number }
  readonly flowPos: { readonly x: number; readonly y: number }
  readonly fromNode: {
    readonly id: string
    readonly data: unknown
    readonly position?: { readonly x: number; readonly y: number }
  } | null
  readonly fromHandleType?: "source" | "target"
}

export function sessionIdFromNodeData(data: unknown): string | undefined {
  if (data === null || typeof data !== "object" || !("sessionId" in data)) {
    return undefined
  }
  return typeof data.sessionId === "string" ? data.sessionId : undefined
}

export async function executeBranchAction(input: {
  readonly client: TalkMapClient
  readonly directory?: string
  readonly view: ViewState
  readonly menu: BlueprintMenuState
  readonly newCardId: () => string
  readonly persistMap: (map: TalkMap) => void
  readonly setView: React.Dispatch<React.SetStateAction<ViewState>>
  readonly setToast: (msg: string) => void
}): Promise<boolean> {
  const source = input.menu.fromNode
  if (!source || input.view.kind !== "ready" || !input.directory) {
    return false
  }
  const sourceCard = input.view.map.cards[source.id]
  const sourceSession =
    sessionIdFromNodeData(source.data) ?? sourceCard?.sessionId
  if (!sourceSession) {
    return false
  }
  const sourceTitle =
    sourceCard?.label ?? input.view.titles[sourceSession] ?? sourceSession
  const sourcePos =
    source.position ?? sourceCard?.position ?? { x: 0, y: 0 }

  try {
    const created = await createInjectedBranch({
      client: input.client,
      directory: input.directory,
      source: {
        cardId: source.id,
        sessionId: sourceSession,
        title: sourceTitle,
        digest: input.view.map.digests[sourceSession],
        position: sourcePos,
      },
    })
    const cardId = input.newCardId()
    input.setView((current) => {
      const next = applyInjectedBranch({
        current,
        sourceCardId: source.id,
        sourcePosition: sourcePos,
        targetPosition: input.menu.flowPos,
        cardId,
        created,
      })
      if (next.kind === "ready") {
        input.persistMap(next.map)
      }
      return next
    })
    input.setToast("已创建分支会话")
    return true
  } catch (error: unknown) {
    if (error instanceof Error) {
      input.setToast(error.message)
    }
    return false
  }
}

export async function executeNewSessionAction(input: {
  readonly client: TalkMapClient
  readonly directory?: string
  readonly view: ViewState
  readonly menu: BlueprintMenuState
  readonly newCardId: () => string
  readonly persistMap: (map: TalkMap) => void
  readonly setView: React.Dispatch<React.SetStateAction<ViewState>>
  readonly setToast: (msg: string) => void
}): Promise<boolean> {
  if (input.view.kind !== "ready" || !input.directory) {
    return false
  }
  try {
    const created = await createUntitledAtClick({
      client: input.client,
      map: input.view.map,
      directory: input.directory,
      position: input.menu.flowPos,
      newCardId: input.newCardId,
    })
    input.setView((current) => applyCreatedSession(current, input.directory!, created))
    input.persistMap(created.map)
    input.setToast("已创建独立会话")
    return true
  } catch (error: unknown) {
    if (error instanceof Error) {
      input.setToast(error.message)
    }
    return false
  }
}

export function executeConnectAction(input: {
  readonly menu: BlueprintMenuState
  readonly view: ViewState
  readonly session: ProjectSessionItem
  readonly persistMap: (map: TalkMap) => void
  readonly setView: React.Dispatch<React.SetStateAction<ViewState>>
  readonly setToast: (msg: string) => void
  readonly onSelectSession?: (sessionId: string) => void
}): boolean {
  if (input.menu.fromNode) {
    const targetCardId = input.session.cardId
    const finalSource = input.menu.fromHandleType === "target" ? targetCardId : input.menu.fromNode.id
    const finalTarget = input.menu.fromHandleType === "target" ? input.menu.fromNode.id : targetCardId

    if (finalSource === finalTarget) {
      input.setToast("无法连接自身")
      return false
    }

    if (input.view.kind === "ready") {
      const already = Object.values(input.view.map.edges).some(
        (e) => e.sourceCardId === finalSource && e.targetCardId === finalTarget,
      )
      if (already) {
        input.setToast("连线已存在")
        return false
      }
    }

    applyLinkOnView(input.setView, input.persistMap, finalSource, finalTarget)
    input.setToast("已连接到会话")
    return true
  }

  if (input.session.sessionId && input.onSelectSession) {
    input.onSelectSession(input.session.sessionId)
    return true
  }

  return false
}

