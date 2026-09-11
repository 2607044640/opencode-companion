import React, { useState, useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'

export interface CountdownConfirmDialogProps {
  isOpen: boolean
  title?: string
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  countdownSeconds?: number
  isDestructive?: boolean
  onConfirm: () => void
  onClose: () => void
}

/**
 * Reusable confirmation dialog with a mandatory countdown lock
 * Prevents accidental destructive actions by disabling the confirm button
 * until the countdown (default 2s) has expired.
 */
export const CountdownConfirmDialog: React.FC<CountdownConfirmDialogProps> = ({
  isOpen,
  title = '确认操作',
  description = '此操作将不可逆，是否确定继续？',
  confirmText = '确定',
  cancelText = '取消',
  countdownSeconds = 2,
  isDestructive = true,
  onConfirm,
  onClose,
}) => {
  const [remaining, setRemaining] = useState(countdownSeconds)

  useEffect(() => {
    if (!isOpen) {
      setRemaining(countdownSeconds)
      return
    }

    setRemaining(countdownSeconds)
    if (countdownSeconds <= 0) return

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, countdownSeconds])

  // Handle Escape key to cancel
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isLocked = remaining > 0

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-xs select-none p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#13151b] border border-[#272a31] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="h-12 px-5 border-b border-[#21242a] flex items-center justify-between bg-[#16181f]">
          <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
            {isDestructive && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
            <span>{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 text-xs text-zinc-300 leading-relaxed border-b border-[#21242a]">
          {description}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#0f1115] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-colors border border-zinc-700/80 cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={isLocked}
            onClick={() => {
              if (!isLocked) {
                onConfirm()
                onClose()
              }
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm ${
              isLocked
                ? 'bg-zinc-800 text-zinc-500 border border-zinc-700/40 cursor-not-allowed'
                : isDestructive
                ? 'bg-rose-600 hover:bg-rose-500 text-white border border-rose-500/80 cursor-pointer shadow-rose-900/30'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 cursor-pointer shadow-indigo-900/30'
            }`}
          >
            {isLocked ? `${confirmText} (${remaining}s)` : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
