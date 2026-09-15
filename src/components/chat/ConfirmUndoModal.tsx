import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X,
  CornerDownLeft,
  Loader2,
  GitBranch,
  MessageSquare,
  FileCode,
  Sparkles,
  CheckCircle2,
  Circle,
  FileCheck,
} from 'lucide-react'
import { useI18n } from '../../utils/i18n'
import { FileTypeIcon } from '../common/FileTypeIcon'
import type { RevertMode } from '../../hooks/useChatStream'
import { classifyRevertBadge } from '../../utils/revert-engine'

export interface ConfirmUndoFileDiff {
  file: string
  status?: 'added' | 'deleted' | 'modified'
  additions: number
  deletions: number
}

export interface ConfirmUndoModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (mode: RevertMode) => void
  targetMessageId?: string
  targetMessageTime?: string
  files: ConfirmUndoFileDiff[]
  loading?: boolean
  isReverting?: boolean
  error?: string | null
}

interface ModeOption {
  id: RevertMode
  title: string
  desc: string
  icon: React.ComponentType<{ className?: string }>
  affectsFiles: boolean
}

export function ConfirmUndoModal({
  isOpen,
  onClose,
  onConfirm,
  targetMessageTime,
  files,
  loading = false,
  isReverting = false,
  error = null,
}: ConfirmUndoModalProps) {
  const { t } = useI18n()
  const modalRef = useRef<HTMLDivElement>(null)
  const [selectedModeIndex, setSelectedModeIndex] = useState<number>(0)
  const [isPending, setIsPending] = useState(false)
  const pendingRef = useRef(false)
  const wasReverting = useRef(false)
  const busy = isReverting || isPending

  const modes: ModeOption[] = [
    {
      id: 'both',
      title: t.chat.revertModeBothTitle,
      desc: t.chat.revertModeBothDesc,
      icon: GitBranch,
      affectsFiles: true,
    },
    {
      id: 'conversation_only',
      title: t.chat.revertModeConvOnlyTitle,
      desc: t.chat.revertModeConvOnlyDesc,
      icon: MessageSquare,
      affectsFiles: false,
    },
    {
      id: 'code_only',
      title: t.chat.revertModeCodeOnlyTitle,
      desc: t.chat.revertModeCodeOnlyDesc,
      icon: FileCode,
      affectsFiles: true,
    },
    {
      id: 'summarize',
      title: t.chat.revertModeSummarizeTitle,
      desc: t.chat.revertModeSummarizeDesc,
      icon: Sparkles,
      affectsFiles: false,
    },
  ]

  const currentMode = modes[selectedModeIndex] || modes[0]

  // Reset to default mode on open
  useEffect(() => {
    if (isOpen) {
      setSelectedModeIndex(0)
      setIsPending(false)
      pendingRef.current = false
    }
  }, [isOpen])

  useEffect(() => {
    if (wasReverting.current && !isReverting) {
      setIsPending(false)
      pendingRef.current = false
    }
    wasReverting.current = isReverting
  }, [isReverting])

  useEffect(() => {
    if (error) {
      setIsPending(false)
      pendingRef.current = false
    }
  }, [error])

  const submit = useCallback((mode: RevertMode) => {
    if (isReverting || pendingRef.current) return
    pendingRef.current = true
    setIsPending(true)
    onConfirm(mode)
  }, [isReverting, onConfirm])

  // Keyboard navigation: ArrowUp/Down cycle modes, Enter confirms, Escape closes
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow IME composition without triggering actions
      if (e.isComposing || e.keyCode === 229) return

      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        if (!busy) onClose()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        setSelectedModeIndex((prev) => (prev - 1 + modes.length) % modes.length)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        setSelectedModeIndex((prev) => (prev + 1) % modes.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        submit(currentMode.id)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, busy, currentMode.id, modes.length, submit, onClose])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-modal="confirm-undo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px] p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) {
          onClose()
        }
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-[540px] bg-[#15171e] border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden select-none animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-zinc-800/40">
          <div>
            <h2 className="text-base font-semibold text-zinc-100 tracking-tight">
              {t.chat.confirmUndoTitle}
            </h2>
            {targetMessageTime && (
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Target Checkpoint: <span className="font-medium text-zinc-300">{targetMessageTime}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md transition-colors hover:bg-zinc-800/60 disabled:opacity-40"
            title={t.common.cancel}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Mode Selection & File Diff */}
        <div className="flex-1 overflow-y-auto px-5 py-3.5 space-y-3.5 custom-scrollbar">
          {/* Mode Selector List (Claude Code / Cursor style) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium">
              <span>选择回退模式 (↑ / ↓ 切换)</span>
              <span className="text-[10px] text-zinc-500 font-mono">Mode {selectedModeIndex + 1} of {modes.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {modes.map((mode, idx) => {
                const isSelected = selectedModeIndex === idx
                const Icon = mode.icon

                return (
                  <div
                    key={mode.id}
                    onClick={() => setSelectedModeIndex(idx)}
                    className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-[#5b68ff]/10 border-[#5b68ff]/60 shadow-[0_0_12px_rgba(91,104,255,0.15)] ring-1 ring-[#5b68ff]/40'
                        : 'bg-[#1a1d24]/50 border-zinc-800/80 hover:bg-[#1a1d24] hover:border-zinc-700'
                    }`}
                  >
                    <div className="shrink-0 mt-0.5">
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-[#5b68ff]" />
                      ) : (
                        <Circle className="w-4 h-4 text-zinc-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-[#7d88ff]' : 'text-zinc-400'}`} />
                        <span className={`text-xs font-semibold ${isSelected ? 'text-zinc-100' : 'text-zinc-300'}`}>
                          {mode.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                        {mode.desc}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Diff / Files Affected Section */}
          <div className="pt-2 border-t border-zinc-800/40">
            {currentMode.affectsFiles ? (
              <>
                <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-2 font-medium">
                  <span>受影响文件列表 (Affected Files)</span>
                  {files.length > 0 && (
                    <span className="text-[10px] text-zinc-500 font-mono">{files.length} 个文件</span>
                  )}
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar rounded-lg border border-zinc-800/60 bg-[#121319]/60 p-2">
                  {loading ? (
                    <div className="h-20 flex flex-col items-center justify-center gap-2 text-xs text-zinc-400">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      <span>{t.chat.loadingDiff}</span>
                    </div>
                  ) : files.length === 0 ? (
                    <div className="h-16 flex items-center justify-center text-xs text-zinc-400 font-sans">
                      {t.chat.noFilesAffected}
                    </div>
                  ) : (
                    files.map((item, idx) => {
                      const badge = classifyRevertBadge(item)
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-1 px-2 rounded hover:bg-zinc-800/40 text-xs font-mono group transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-3">
                            <FileTypeIcon filename={item.file} />
                            <span
                              className="truncate text-zinc-300 font-normal tracking-tight"
                              title={item.file}
                            >
                              {item.file}
                            </span>
                          </div>

                          <div className="shrink-0 flex items-center text-xs font-mono font-medium">
                            {badge === 'delete' ? (
                              <span className="text-rose-400">Delete</span>
                            ) : badge === 'modify' ? (
                              <span className="flex items-center gap-1.5">
                                <span className="text-emerald-400">+{item.additions}</span>
                                <span className="text-rose-400">-{item.deletions}</span>
                              </span>
                            ) : badge === 'restore' ? (
                              <span className="text-emerald-400">Restore</span>
                            ) : (
                              <span className="text-zinc-500">Updated</span>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/30 border border-zinc-800/50 text-xs text-zinc-400">
                <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{t.chat.noFilesModifiedBadge}</span>
              </div>
            )}
          </div>
        </div>

        {error ? (
          <div className="px-5 py-2 text-[11px] text-rose-300 border-t border-rose-900/40 bg-rose-950/40">
            {error}
          </div>
        ) : null}

        {/* Footer */}
        <div className="px-5 py-3 flex items-center justify-between border-t border-zinc-800/60 bg-[#121319]/80">
          <div className="text-[11px] text-zinc-500 hidden sm:block">
            按 <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-400 font-mono text-[10px]">Enter</kbd> 确认，<kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-400 font-mono text-[10px]">Esc</kbd> 取消
          </div>
          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded-md hover:bg-zinc-800/50 disabled:opacity-40"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={() => submit(currentMode.id)}
              disabled={busy}
              className="px-4 py-1.5 text-xs font-medium text-white bg-[#5b68ff] hover:bg-[#4d5af0] active:bg-[#434fc9] disabled:opacity-50 rounded-lg flex items-center gap-1.5 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              {busy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t.chat.reverting}</span>
                </>
              ) : (
                <>
                  <span>{t.chat.confirmUndoBtn}</span>
                  <CornerDownLeft className="w-3 h-3 opacity-90" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
