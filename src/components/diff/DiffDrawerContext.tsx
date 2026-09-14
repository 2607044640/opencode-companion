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

interface DiffDrawerContextType {
  payload: DiffDrawerPayload | null
  isOpen: boolean
  open: (payload: DiffDrawerPayload) => void
  close: () => void
}

const DiffDrawerContext = createContext<DiffDrawerContextType | null>(null)

interface DiffDrawerProviderProps {
  children: ReactNode
  activeSessionId?: string | null
}

export function DiffDrawerProvider({ children, activeSessionId }: DiffDrawerProviderProps) {
  const [payload, setPayload] = useState<DiffDrawerPayload | null>(null)

  const open = useCallback((newPayload: DiffDrawerPayload) => {
    // If hunks are not already parsed, parse them now
    const hunks = newPayload.hunks ?? parseUnifiedHunks(newPayload.unified)
    setPayload({
      ...newPayload,
      hunks,
    })
  }, [])

  const close = useCallback(() => {
    setPayload(null)
  }, [])

  // Auto-close on session change
  useEffect(() => {
    close()
  }, [activeSessionId, close])

  const value: DiffDrawerContextType = {
    payload,
    isOpen: payload !== null,
    open,
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
