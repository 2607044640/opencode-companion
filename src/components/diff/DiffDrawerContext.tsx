import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { DiffHunk } from '../../utils/tool-diff'
import { mergeUnifiedDiffs, parseUnifiedHunks } from '../../utils/tool-diff'
import type { EditItem } from '../../utils/worked-summary'

export interface DiffDrawerPayload {
  messageId: string
  partId: string
  filePath: string
  fileName: string
  status: 'added' | 'deleted' | 'modified'
  additions: number
  deletions: number
  unified: string
  tool?: string
  hunks?: DiffHunk[]
  rawInput?: Record<string, any>
  rawOutput?: string
  /** How many tool calls were folded into this one file card. */
  mergedEditCount?: number
}

export interface TurnDiffPayload {
  messageId: string
  title?: string
  turnBadge?: string
  files: DiffDrawerPayload[]
}

export type DiffDrawerMode = 'single' | 'turn'

interface DiffDrawerContextType {
  mode: DiffDrawerMode
  payload: DiffDrawerPayload | null
  turnPayload: TurnDiffPayload | null
  isOpen: boolean
  open: (payload: DiffDrawerPayload) => void
  openTurn: (payload: TurnDiffPayload) => void
  close: () => void
}

const DiffDrawerContext = createContext<DiffDrawerContextType | null>(null)

interface DiffDrawerProviderProps {
  children: ReactNode
  activeSessionId?: string | null
}

export function DiffDrawerProvider({ children, activeSessionId }: DiffDrawerProviderProps) {
  const [mode, setMode] = useState<DiffDrawerMode>('single')
  const [payload, setPayload] = useState<DiffDrawerPayload | null>(null)
  const [turnPayload, setTurnPayload] = useState<TurnDiffPayload | null>(null)

  const open = useCallback((newPayload: DiffDrawerPayload) => {
    const hunks = newPayload.hunks ?? parseUnifiedHunks(newPayload.unified)
    setMode('single')
    setTurnPayload(null)
    setPayload({
      ...newPayload,
      hunks,
    })
  }, [])

  const openTurn = useCallback((newTurn: TurnDiffPayload) => {
    const filesWithHunks = newTurn.files.map((file) => ({
      ...file,
      hunks: file.hunks ?? parseUnifiedHunks(file.unified),
    }))
    setMode('turn')
    setPayload(filesWithHunks[0] || null)
    setTurnPayload({
      ...newTurn,
      files: filesWithHunks,
    })
  }, [])

  const close = useCallback(() => {
    setPayload(null)
    setTurnPayload(null)
  }, [])

  // Auto-close on session change
  useEffect(() => {
    close()
  }, [activeSessionId, close])

  const value: DiffDrawerContextType = {
    mode,
    payload,
    turnPayload,
    isOpen: payload !== null || turnPayload !== null,
    open,
    openTurn,
    close,
  }

  return (
    <DiffDrawerContext.Provider value={value}>
      {children}
    </DiffDrawerContext.Provider>
  )
}

export function useDiffDrawer(): DiffDrawerContextType {
  const ctx = useContext(DiffDrawerContext)
  if (!ctx) {
    throw new Error('useDiffDrawer must be used within a DiffDrawerProvider')
  }
  return ctx
}

function fileKey(item: { filePath: string; fileName: string }): string {
  return item.filePath || item.fileName
}

/**
 * One card per file. Repeated edits of the same path are stitched into a single
 * unified diff (GitHub / Antigravity style) instead of Edit 1/N cards.
 */
export function editItemsToTurnFiles(items: EditItem[], messageId?: string): DiffDrawerPayload[] {
  const groups: EditItem[][] = []
  const indexByKey = new Map<string, number>()

  for (const item of items) {
    const key = fileKey(item)
    const existing = indexByKey.get(key)
    if (existing == null) {
      indexByKey.set(key, groups.length)
      groups.push([item])
    } else {
      groups[existing].push(item)
    }
  }

  return groups.map((group) => {
    const last = group[group.length - 1]
    const payload = editItemToDiffPayload(last, messageId)
    if (group.length === 1) return payload

    const unifiedParts = group.map((item) => item.unified).filter(Boolean)
    const hunks = mergeUnifiedDiffs(unifiedParts)
    let additions = 0
    let deletions = 0
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.kind === 'add') additions += 1
        else if (line.kind === 'del') deletions += 1
      }
    }
    const status = group.some((item) => item.status === 'added')
      ? 'added'
      : group.every((item) => item.status === 'deleted')
        ? 'deleted'
        : 'modified'

    return {
      ...payload,
      status,
      additions,
      deletions,
      unified: unifiedParts.join('\n'),
      hunks,
      mergedEditCount: group.length,
    }
  })
}

export function editItemToDiffPayload(item: EditItem, messageId?: string): DiffDrawerPayload {
  return {
    messageId: messageId || item.rawPart.messageID,
    partId: item.partId,
    filePath: item.filePath,
    fileName: item.fileName,
    status: item.status,
    additions: item.additions,
    deletions: item.deletions,
    unified: item.unified,
    tool: item.tool,
    rawInput: item.rawPart.state?.input,
    rawOutput: item.rawPart.state?.output,
  }
}
