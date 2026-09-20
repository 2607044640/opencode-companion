import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { DiffHunk } from '../../utils/tool-diff'
import { parseUnifiedHunks } from '../../utils/tool-diff'
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

export function editItemsToTurnFiles(items: EditItem[], messageId?: string): DiffDrawerPayload[] {
  const map = new Map<string, EditItem>()
  for (const it of items) {
    map.set(it.filePath, it)
  }
  return Array.from(map.values()).map((it) => editItemToDiffPayload(it, messageId))
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
