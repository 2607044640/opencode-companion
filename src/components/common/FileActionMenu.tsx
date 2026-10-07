import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  MoreHorizontal,
  Copy,
  Terminal,
  ExternalLink,
  FolderOpen,
  Check,
  Loader2,
} from 'lucide-react'
import {
  toWindowsPath,
  toLinuxPath,
  openFileInVSCode,
  openFileInExplorer,
} from '../../utils/path-resolver'
import { useI18n } from '../../utils/i18n'

export interface FileActionMenuProps {
  filePath: string
  line?: number | string
  className?: string
  buttonTitle?: string
  align?: 'left' | 'right'
}

export function FileActionMenu({
  filePath,
  line,
  className = '',
  buttonTitle,
  align = 'right',
}: FileActionMenuProps) {
  const { tr } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  const finalButtonTitle = buttonTitle || tr('文件操作', 'File Actions')

  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const winPath = toWindowsPath(filePath)
  const linuxPath = toLinuxPath(filePath)

  // Parse start line if given (e.g. "12" or "12-45" -> 12)
  const startLine =
    typeof line === 'number'
      ? line
      : typeof line === 'string'
        ? parseInt(line.split('-')[0].replace(/\D/g, ''), 10) || undefined
        : undefined

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const menuWidth = 230
    const menuHeight = 170

    let top = rect.bottom + 4
    if (top + menuHeight > window.innerHeight && rect.top - menuHeight > 0) {
      top = rect.top - menuHeight - 4
    }

    let left = align === 'right' ? rect.right - menuWidth : rect.left
    if (left < 8) left = 8
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8
    }

    setMenuPos({ top, left })
  }, [align])

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (isOpen) {
      setIsOpen(false)
      return
    }
    updatePosition()
    setIsOpen(true)
  }

  // Close on outside click or Esc
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setIsOpen(false)
      }
    }

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    const handleScroll = () => {
      setIsOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [isOpen])

  const triggerFeedback = (text: string, closeAfterMs = 600) => {
    setFeedback(text)
    setTimeout(() => {
      setFeedback(null)
      setIsOpen(false)
    }, closeAfterMs)
  }

  const handleCopyWindowsPath = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(winPath)
      triggerFeedback(tr('已复制 Windows 路径', 'Copied Windows Path'))
    } catch {
      triggerFeedback(tr('复制失败', 'Copy failed'))
    }
  }

  const handleCopyLinuxPath = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(linuxPath)
      triggerFeedback(tr('已复制 Linux 路径', 'Copied Linux Path'))
    } catch {
      triggerFeedback(tr('复制失败', 'Copy failed'))
    }
  }

  const handleOpenVSCode = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setLoadingAction('vscode')
    try {
      const res = await openFileInVSCode(filePath, startLine)
      if (res.ok) {
        triggerFeedback(tr('已在 VS Code 中打开', 'Opened in VS Code'), 800)
      } else {
        triggerFeedback(res.error || tr('打开失败', 'Failed to open'), 1500)
      }
    } catch (err) {
      triggerFeedback(tr('请求异常', 'Request error'), 1500)
    } finally {
      setLoadingAction(null)
    }
  }

  const handleOpenExplorer = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setLoadingAction('explorer')
    try {
      const res = await openFileInExplorer(filePath)
      if (res.ok) {
        triggerFeedback(tr('已在资源管理器中定位', 'Revealed in Explorer'), 800)
      } else {
        triggerFeedback(res.error || tr('打开失败', 'Failed to open'), 1500)
      }
    } catch (err) {
      triggerFeedback(tr('请求异常', 'Request error'), 1500)
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className={`relative inline-flex items-center shrink-0 ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors cursor-pointer select-none"
        title={finalButtonTitle}
        aria-label={finalButtonTitle}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>

      {isOpen &&
        menuPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: `${menuPos.top}px`,
              left: `${menuPos.left}px`,
              zIndex: 99999,
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-56 bg-[#14161b] border border-[#272a30] rounded-lg shadow-2xl p-1 text-xs select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
          >
            {feedback && (
              <div className="px-2 py-1.5 mb-1 bg-emerald-950/80 border border-emerald-800/80 rounded text-emerald-300 font-mono text-[11px] flex items-center gap-1.5 animate-in fade-in">
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate">{feedback}</span>
              </div>
            )}

            {/* Action 1: Copy Windows Path */}
            <button
              type="button"
              onClick={handleCopyWindowsPath}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-zinc-800/90 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer text-left group"
              title={winPath}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Copy className="w-3.5 h-3.5 text-cyan-400 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="font-medium text-xs">{tr('复制 Windows 路径', 'Copy Windows Path')}</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 shrink-0">Win</span>
            </button>

            {/* Action 2: Copy Linux Path */}
            <button
              type="button"
              onClick={handleCopyLinuxPath}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-zinc-800/90 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer text-left group"
              title={linuxPath}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Terminal className="w-3.5 h-3.5 text-purple-400 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="font-medium text-xs">{tr('复制 Linux 路径', 'Copy Linux Path')}</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 shrink-0">Linux</span>
            </button>

            <div className="border-t border-[#232730] my-1" />

            {/* Action 3: Open in VS Code */}
            <button
              type="button"
              onClick={handleOpenVSCode}
              disabled={loadingAction === 'vscode'}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-zinc-800/90 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer text-left group disabled:opacity-50"
              title={
                startLine
                  ? tr(`在 VS Code 打开 (行 ${startLine})`, `Open in VS Code (line ${startLine})`)
                  : tr('在 VS Code 打开该文件', 'Open in VS Code')
              }
            >
              <div className="flex items-center gap-2 min-w-0">
                {loadingAction === 'vscode' ? (
                  <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5 text-sky-400 shrink-0 group-hover:scale-110 transition-transform" />
                )}
                <span className="font-medium text-xs">{tr('在 VS Code 中打开', 'Open in VS Code')}</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 shrink-0">VS Code</span>
            </button>

            {/* Action 4: Show in File Explorer */}
            <button
              type="button"
              onClick={handleOpenExplorer}
              disabled={loadingAction === 'explorer'}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-zinc-800/90 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer text-left group disabled:opacity-50"
              title={tr('在 Windows 资源管理器中打开并定位此文件', 'Reveal and locate this file in File Explorer')}
            >
              <div className="flex items-center gap-2 min-w-0">
                {loadingAction === 'explorer' ? (
                  <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                ) : (
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
                )}
                <span className="font-medium text-xs">{tr('在资源管理器中定位', 'Reveal in Explorer')}</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 shrink-0">Explorer</span>
            </button>
          </div>,
          document.body
        )}
    </div>
  )
}
