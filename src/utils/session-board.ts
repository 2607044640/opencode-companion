export const SESSION_BOARD_STORAGE_KEY = 'opencode_session_board_v1'

export type BoardGroup = {
  id: string
  name: string
  sessionIds: string[]
  collapsed: boolean
}

export type BoardColumn = {
  id: string
  name: string
  groups: BoardGroup[]
}

export type SessionBoardState = {
  version: 1
  columns: BoardColumn[]
  recycledAt: Record<string, number>
}

export function createSessionBoard(): SessionBoardState {
  return {
    version: 1,
    columns: ['Workspace', 'Projects', 'Later'].map((name, index) => ({
      id: `column-${index + 1}`,
      name: `Column ${index + 1}`,
      groups: [{ id: `group-${index + 1}`, name, sessionIds: [], collapsed: false }],
    })),
    recycledAt: {},
  }
}

export function normalizeSessionBoard(input: unknown): SessionBoardState {
  if (!isRecord(input) || input.version !== 1 || !Array.isArray(input.columns) || !isRecord(input.recycledAt)) {
    return createSessionBoard()
  }
  const ids = new Set<string>()
  const sessions = new Set<string>()
  const columns: BoardColumn[] = []
  for (const rawColumn of input.columns) {
    if (!isRecord(rawColumn) || !validId(rawColumn.id) || !validId(rawColumn.name) || !Array.isArray(rawColumn.groups) || ids.has(rawColumn.id)) return createSessionBoard()
    ids.add(rawColumn.id)
    const groups: BoardGroup[] = []
    for (const rawGroup of rawColumn.groups) {
      if (!isRecord(rawGroup) || !validId(rawGroup.id) || !validId(rawGroup.name) || !Array.isArray(rawGroup.sessionIds) || typeof rawGroup.collapsed !== 'boolean' || ids.has(rawGroup.id)) return createSessionBoard()
      ids.add(rawGroup.id)
      const sessionIds: string[] = []
      for (const sessionId of rawGroup.sessionIds) {
        if (!validId(sessionId) || sessions.has(sessionId)) return createSessionBoard()
        sessions.add(sessionId)
        sessionIds.push(sessionId)
      }
      groups.push({ id: rawGroup.id, name: rawGroup.name, sessionIds, collapsed: rawGroup.collapsed })
    }
    columns.push({ id: rawColumn.id, name: rawColumn.name, groups })
  }
  const recycledAt: Record<string, number> = {}
  for (const [id, timestamp] of Object.entries(input.recycledAt)) {
    if (!validId(id) || typeof timestamp !== 'number' || !Number.isFinite(timestamp) || sessions.has(id)) return createSessionBoard()
    recycledAt[id] = timestamp
  }
  return { version: 1, columns, recycledAt }
}

export function readSessionBoard(storage: Pick<Storage, 'getItem'>): SessionBoardState {
  try {
    const value = storage.getItem(SESSION_BOARD_STORAGE_KEY)
    return value === null ? createSessionBoard() : normalizeSessionBoard(JSON.parse(value) as unknown)
  } catch {
    return createSessionBoard()
  }
}

export function saveSessionBoard(state: SessionBoardState, storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(SESSION_BOARD_STORAGE_KEY, JSON.stringify(state))
}

export function moveBoardSession(state: SessionBoardState, sessionId: string, targetGroupId: string | null, beforeSessionId?: string, now = Date.now()): SessionBoardState {
  if (!sessionId) return state
  if (targetGroupId !== null && !state.columns.some((column) => column.groups.some((group) => group.id === targetGroupId))) return state
  if (targetGroupId !== null && beforeSessionId === sessionId) return state
  const columns = state.columns.map((column) => ({
    ...column,
    groups: column.groups.map((group) => {
      const sessionIds = group.sessionIds.filter((id) => id !== sessionId)
      if (targetGroupId === group.id) {
        const index = beforeSessionId ? sessionIds.indexOf(beforeSessionId) : -1
        if (index >= 0) sessionIds.splice(index, 0, sessionId)
        else sessionIds.push(sessionId)
      }
      return { ...group, sessionIds }
    }),
  }))
  const recycledAt = { ...state.recycledAt }
  if (targetGroupId === null) recycledAt[sessionId] = now
  else delete recycledAt[sessionId]
  return { ...state, columns, recycledAt }
}

export function moveBoardGroup(state: SessionBoardState, groupId: string, targetColumnId: string, beforeGroupId?: string): SessionBoardState {
  const sourceColumn = state.columns.find((column) => column.groups.some((group) => group.id === groupId))
  const targetColumn = state.columns.find((column) => column.id === targetColumnId)
  const group = sourceColumn?.groups.find((item) => item.id === groupId)
  if (!sourceColumn || !targetColumn || !group || beforeGroupId === groupId) return state
  if (beforeGroupId && !targetColumn.groups.some((item) => item.id === beforeGroupId)) return state
  return { ...state, columns: state.columns.map((column) => {
    const groups = column.groups.filter((item) => item.id !== groupId)
    if (column.id === targetColumnId) {
      const index = beforeGroupId ? groups.findIndex((item) => item.id === beforeGroupId) : -1
      if (index < 0) groups.push(group)
      else groups.splice(index, 0, group)
    }
    return { ...column, groups }
  }) }
}

export function moveBoardColumn(state: SessionBoardState, columnId: string, beforeColumnId?: string): SessionBoardState {
  if (columnId === beforeColumnId) return state
  const index = state.columns.findIndex((column) => column.id === columnId)
  if (index < 0 || (beforeColumnId && !state.columns.some((column) => column.id === beforeColumnId))) return state
  const columns = [...state.columns]
  const [column] = columns.splice(index, 1)
  const targetIndex = beforeColumnId ? columns.findIndex((item) => item.id === beforeColumnId) : -1
  if (targetIndex < 0) columns.push(column)
  else columns.splice(targetIndex, 0, column)
  return { ...state, columns }
}

export function recentBoardSessions<T extends { id: string; time?: { updated?: number; created?: number } }>(sessions: readonly T[], state: SessionBoardState): T[] {
  const grouped = new Set(state.columns.flatMap((column) => column.groups.flatMap((group) => group.sessionIds)))
  return sessions.filter((session) => !grouped.has(session.id)).slice().sort((a, b) => {
    const activityA = Math.max(a.time?.updated ?? 0, a.time?.created ?? 0, state.recycledAt[a.id] ?? 0)
    const activityB = Math.max(b.time?.updated ?? 0, b.time?.created ?? 0, state.recycledAt[b.id] ?? 0)
    return activityB - activityA || (state.recycledAt[b.id] ?? 0) - (state.recycledAt[a.id] ?? 0) || a.id.localeCompare(b.id)
  }).slice(0, 8)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
