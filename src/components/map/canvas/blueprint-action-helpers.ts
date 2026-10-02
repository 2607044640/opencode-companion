import type React from "react"
import type { TalkMap, TalkMapCard, TalkMapEdge } from "../schema/talk-map"
import type { Project } from "../../../types/opencode"
import type { ListedSession, TalkMapClient } from "../opencode/client"
import type { ViewState } from "./map-interactions"
import { formatProjectPill, resolveSessionProject } from "../../../utils/session-workspace"
import { applyInjectedBranch, createInjectedBranch } from "./connect-inject"
import { applyCreatedSession } from "./map-interactions"
import { createUntitledAtClick } from "./create-at-click"
import { applyLinkOnView } from "./map-gestures"

export type ProjectSessionItem = {
  readonly cardId?: string
  readonly sessionId?: string
  readonly title: string
  readonly nextStep?: string
  readonly directory?: string
  readonly projectName?: string
  readonly projectBadge?: string
  readonly projectColorClass?: string
  readonly isUnowned?: boolean
}

export function calculateSearchScore(params: {
  readonly query: string
  readonly words: readonly string[]
  readonly title: string
  readonly projectName: string
  readonly directory?: string
  readonly sessionId?: string
}): number {
  const { query: q, words, title, projectName, directory, sessionId } = params
  if (words.length === 0) {
    return 1
  }

  const titleLower = title.toLowerCase()
  const projLower = projectName.toLowerCase()
  const dirLower = (directory || "").toLowerCase()
  const sessionLower = (sessionId || "").toLowerCase()

  let score = 0

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

  return score
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

    const score = calculateSearchScore({
      query: q,
      words,
      title,
      projectName,
      directory: card.directory,
      sessionId,
    })

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
          isUnowned: false,
        },
        score,
      })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.item)
}

export type FilterCategorizedSessionsInput = {
  readonly cards: TalkMap["cards"]
  readonly titles: Record<string, string>
  readonly sessions?: readonly ListedSession[]
  readonly directory?: string
  readonly query: string
  readonly excludeCardId?: string
  readonly projects?: readonly { id: string; worktree: string; name?: string }[]
}

export type CategorizedSessionResults = {
  readonly existingSessions: ProjectSessionItem[]
  readonly unownedSessions: ProjectSessionItem[]
}

export function filterCategorizedSessions(
  input: FilterCategorizedSessionsInput,
): CategorizedSessionResults {
  const existingSessions = filterProjectSessions(input)

  const q = input.query.trim().toLowerCase()
  const words = q.split(/\s+/).filter(Boolean)
  const isAllDir = !input.directory || input.directory === "all"

  const mappedSessionIds = new Set(
    Object.values(input.cards)
      .map((c) => c.sessionId)
      .filter((id): id is string => Boolean(id)),
  )

  type ScoredItem = {
    item: ProjectSessionItem
    score: number
  }

  const scoredUnowned: ScoredItem[] = []
  const projects = (input.projects as unknown as readonly Project[]) || []

  if (input.sessions && input.sessions.length > 0) {
    for (const sess of input.sessions) {
      if (mappedSessionIds.has(sess.id)) {
        continue
      }
      if (!isAllDir && sess.directory !== input.directory) {
        continue
      }

      const title = sess.title || sess.id
      const badge = resolveSessionProject({ directory: sess.directory }, projects)
      const projectName = badge.name
      const projectBadge = formatProjectPill(badge.name)
      const projectColorClass = badge.colorClass

      const score = calculateSearchScore({
        query: q,
        words,
        title,
        projectName,
        directory: sess.directory,
        sessionId: sess.id,
      })

      if (score > 0) {
        scoredUnowned.push({
          item: {
            sessionId: sess.id,
            title,
            directory: sess.directory,
            projectName,
            projectBadge,
            projectColorClass,
            isUnowned: true,
          },
          score,
        })
      }
    }
  } else {
    // Fallback using input.titles
    for (const [sessionId, title] of Object.entries(input.titles)) {
      if (mappedSessionIds.has(sessionId)) {
        continue
      }
      const badge = resolveSessionProject({}, projects)
      const projectName = badge.name
      const projectBadge = formatProjectPill(badge.name)
      const projectColorClass = badge.colorClass

      const score = calculateSearchScore({
        query: q,
        words,
        title,
        projectName,
        directory: "",
        sessionId,
      })

      if (score > 0) {
        scoredUnowned.push({
          item: {
            sessionId,
            title,
            projectName,
            projectBadge,
            projectColorClass,
            isUnowned: true,
          },
          score,
        })
      }
    }
  }

  scoredUnowned.sort((a, b) => b.score - a.score)
  return {
    existingSessions,
    unownedSessions: scoredUnowned.map((s) => s.item),
  }
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
  readonly isZh?: boolean
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
    input.setToast(input.isZh !== false ? "已创建分支会话" : "Branch session created")
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
  readonly isZh?: boolean
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
    input.setToast(input.isZh !== false ? "已创建独立会话" : "New session created")
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
  readonly onLocateCard?: (cardId: string, position?: { readonly x: number; readonly y: number }) => void
  readonly newCardId?: () => string
  readonly isZh?: boolean
}): boolean {
  const isZh = input.isZh !== false

  // 1. Unowned session: instantiate as a card at menu.flowPos
  if (input.session.isUnowned && input.session.sessionId) {
    if (input.view.kind !== "ready") return false

    const cardId = input.newCardId
      ? input.newCardId()
      : `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const targetDir =
      input.session.directory ||
      (input.view.directory && input.view.directory !== "all" ? input.view.directory : "")

    const newCard: TalkMapCard = {
      cardId,
      sessionId: input.session.sessionId,
      ghost: false,
      position: input.menu.flowPos,
      directory: targetDir,
    }

    const currentMap = input.view.map
    const existingBoard = currentMap.boards[targetDir] ?? { cardIds: [], groupIds: [] }
    const nextBoards = {
      ...currentMap.boards,
      [targetDir]: {
        ...existingBoard,
        cardIds: existingBoard.cardIds.includes(cardId)
          ? existingBoard.cardIds
          : [...existingBoard.cardIds, cardId],
      },
    }

    if (input.menu.fromNode) {
      const finalSource =
        input.menu.fromHandleType === "target" ? cardId : input.menu.fromNode.id
      const finalTarget =
        input.menu.fromHandleType === "target" ? input.menu.fromNode.id : cardId
      const edgeId = `link:${finalSource}:${finalTarget}`
      const newEdge: TalkMapEdge = {
        edgeId,
        sourceCardId: finalSource,
        targetCardId: finalTarget,
        kind: "link",
        autoSync: false,
        comment: "",
      }

      const nextMap: TalkMap = {
        ...currentMap,
        cards: {
          ...currentMap.cards,
          [cardId]: newCard,
        },
        edges: {
          ...currentMap.edges,
          [edgeId]: newEdge,
        },
        boards: nextBoards,
      }

      input.persistMap(nextMap)
      input.setView((current) =>
        current.kind === "ready"
          ? {
              ...current,
              map: nextMap,
              titles: {
                ...current.titles,
                [input.session.sessionId!]: input.session.title,
              },
            }
          : current,
      )
      input.setToast(isZh ? "已添加并连接会话" : "Session added and connected")
      return true
    }

    const nextMap: TalkMap = {
      ...currentMap,
      cards: {
        ...currentMap.cards,
        [cardId]: newCard,
      },
      boards: nextBoards,
    }

    input.persistMap(nextMap)
    input.setView((current) =>
      current.kind === "ready"
        ? {
            ...current,
            map: nextMap,
            titles: {
              ...current.titles,
              [input.session.sessionId!]: input.session.title,
            },
          }
        : current,
    )

    if (input.onLocateCard) {
      input.onLocateCard(cardId, input.menu.flowPos)
    }

    input.setToast(isZh ? "已添加会话到地图" : "Session added to map")
    return true
  }

  // 2. Existing mapped session card
  if (input.menu.fromNode) {
    const targetCardId = input.session.cardId
    if (!targetCardId) return false
    const finalSource =
      input.menu.fromHandleType === "target" ? targetCardId : input.menu.fromNode.id
    const finalTarget =
      input.menu.fromHandleType === "target" ? input.menu.fromNode.id : targetCardId

    if (finalSource === finalTarget) {
      input.setToast(isZh ? "无法连接自身" : "Cannot connect to self")
      return false
    }

    if (input.view.kind === "ready") {
      const already = Object.values(input.view.map.edges).some(
        (e) => e.sourceCardId === finalSource && e.targetCardId === finalTarget,
      )
      if (already) {
        input.setToast(isZh ? "连线已存在" : "Link already exists")
        return false
      }
    }

    applyLinkOnView(input.setView, input.persistMap, finalSource, finalTarget)
    input.setToast(isZh ? "已连接到会话" : "Connected to session")
    return true
  }

  if (input.session.cardId) {
    if (input.view.kind === "ready") {
      const card = input.view.map.cards[input.session.cardId]
      if (input.onLocateCard) {
        input.onLocateCard(input.session.cardId, card?.position)
      }
    } else if (input.onLocateCard) {
      input.onLocateCard(input.session.cardId)
    }
    input.setToast(isZh ? "已在地图中定位会话" : "Located session on map")
    return true
  }

  return false
}

