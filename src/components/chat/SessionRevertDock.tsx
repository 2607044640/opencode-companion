import { useState } from 'react'
import { ChevronDown, ChevronUp, CornerUpLeft, Loader2 } from 'lucide-react'
import type { Session, Message } from '../../types/opencode'
import { useI18n } from '../../utils/i18n'
import { extractDraftFromMessage } from '../../utils/draft'

export interface SessionRevertDockProps {
  activeSession: Session | null
  messages: Message[]
  onRestoreMessage: (targetMessage: Message) => Promise<void>
  isRestoring?: boolean
}

export function SessionRevertDock({
  activeSession,
  messages,
  onRestoreMessage,
  isRestoring = false,
}: SessionRevertDockProps) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  if (!activeSession?.revert?.messageID) return null

  const revertMsgId = activeSession.revert.messageID
  const revertIndex = messages.findIndex((m) => m.info.id === revertMsgId)
  if (revertIndex === -1) return null

  // All messages from the revert boundary onwards that are user messages, newest first per Figure 3
  const rolledBackMessages = messages
    .slice(revertIndex)
    .filter((m) => m.info.role === 'user')
    .reverse()

  if (rolledBackMessages.length === 0) return null

  const handleRestore = async (msg: Message) => {
    try {
      setRestoringId(msg.info.id)
      await onRestoreMessage(msg)
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="rounded-xl bg-[#16181d] border border-zinc-800/80 shadow-lg backdrop-blur-md overflow-hidden transition-all">
        {/* Dock Header (Collapsible matching Figure 3) */}
        <div
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none hover:bg-zinc-800/30 transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <CornerUpLeft className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="text-xs font-medium text-zinc-200 shrink-0">
              {t.chat.rolledBackCount(rolledBackMessages.length)}
            </span>
          </div>

          <button
            type="button"
            className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors"
            title={expanded ? t.chat.collapseRolledBack : t.chat.expandRolledBack}
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Expanded Message List (Exact Native OpenCode Parity per Figure 3) */}
        {expanded && (
          <div className="border-t border-zinc-800/60 px-4 py-2 space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
            {rolledBackMessages.map((msg) => {
              const draft = extractDraftFromMessage(msg)
              const isThisRestoring = restoringId === msg.info.id || isRestoring
              const textContent = draft.text.trim() || '(Empty message)'

              return (
                <div
                  key={msg.info.id}
                  className="flex items-center justify-between gap-4 py-1.5 px-1 hover:bg-zinc-800/30 rounded transition-colors group"
                >
                  <span
                    className="text-xs text-zinc-300 font-normal truncate max-w-[calc(100%-130px)] select-text"
                    title={draft.text}
                  >
                    {textContent}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRestore(msg)
                    }}
                    disabled={isThisRestoring}
                    className="shrink-0 text-xs text-zinc-400 hover:text-zinc-100 font-normal transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isThisRestoring && (
                      <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
                    )}
                    <span>
                      {isThisRestoring ? t.chat.restoringMessage : t.chat.restoreMessage}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
