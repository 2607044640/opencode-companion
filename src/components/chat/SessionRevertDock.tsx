import { useState } from 'react'
import { RotateCcw, ChevronDown, ChevronUp, CornerUpLeft, User, Paperclip, Loader2 } from 'lucide-react'
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
  const [expanded, setExpanded] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  if (!activeSession?.revert?.messageID) return null

  const revertMsgId = activeSession.revert.messageID
  const revertIndex = messages.findIndex((m) => m.info.id === revertMsgId)
  if (revertIndex === -1 || revertIndex >= messages.length - 1) return null

  // All messages after the revert boundary that are user messages
  const rolledBackMessages = messages.slice(revertIndex + 1).filter((m) => m.info.role === 'user')
  if (rolledBackMessages.length === 0) return null

  // First rolled back message for quick preview in header
  const firstMsg = rolledBackMessages[0]
  const firstDraft = extractDraftFromMessage(firstMsg)
  const firstSnippet = firstDraft.text.slice(0, 48)

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
      <div className="rounded-xl bg-[#181a20]/95 border border-amber-500/30 shadow-lg backdrop-blur-md overflow-hidden">
        {/* Dock Header */}
        <div
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer select-none hover:bg-amber-500/5 transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400">
              <CornerUpLeft className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-medium text-amber-300 shrink-0">
              {t.chat.rolledBackCount(rolledBackMessages.length)}
            </span>
            {firstSnippet && !expanded && (
              <span className="text-xs text-zinc-400 truncate max-w-[280px] sm:max-w-md hidden sm:inline">
                • &ldquo;{firstSnippet}{firstDraft.text.length > 48 ? '...' : ''}&rdquo;
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 py-0.5 px-2 rounded-md hover:bg-zinc-800/50 transition-colors"
              title={expanded ? t.chat.collapseRolledBack : t.chat.expandRolledBack}
            >
              <span>{expanded ? t.chat.collapseRolledBack : t.chat.expandRolledBack}</span>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Expanded Message List */}
        {expanded && (
          <div className="border-t border-amber-500/20 bg-[#14151a]/80 p-2.5 space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
            {rolledBackMessages.map((msg) => {
              const draft = extractDraftFromMessage(msg)
              const timeStr = msg.info.time?.created
                ? new Date(msg.info.time.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : ''
              const isThisRestoring = restoringId === msg.info.id || isRestoring

              return (
                <div
                  key={msg.info.id}
                  className="flex items-center justify-between gap-3 p-2 rounded-lg bg-[#1a1d24]/70 border border-zinc-800/80 hover:border-amber-500/30 transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5 text-zinc-400">
                      <User className="w-3 h-3" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-zinc-200 truncate max-w-[320px] sm:max-w-lg font-medium">
                        {draft.text || <span className="italic text-zinc-500">(Empty message)</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500">
                        {timeStr && <span>{timeStr}</span>}
                        {draft.attachments.length > 0 && (
                          <span className="flex items-center gap-0.5 text-amber-400/80 font-mono">
                            <Paperclip className="w-3 h-3" />
                            <span>{draft.attachments.length}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRestore(msg)
                    }}
                    disabled={isThisRestoring}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 active:bg-amber-500/35 border border-amber-500/30 text-xs font-medium text-amber-300 hover:text-amber-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {isThisRestoring ? (
                      <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                    ) : (
                      <RotateCcw className="w-3 h-3 text-amber-400" />
                    )}
                    <span>{isThisRestoring ? t.chat.restoringMessage : t.chat.restoreMessage}</span>
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
