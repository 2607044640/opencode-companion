import { useState, useEffect } from 'react'
import { X, Copy, Check } from 'lucide-react'
import { useDiffDrawer } from './DiffDrawerContext'
import { DiffViewer } from './DiffViewer'
import { FileTypeIcon } from '../common/FileTypeIcon'

export function DiffSidebarDrawer() {
  const { payload, isOpen, close } = useDiffDrawer()
  const [copied, setCopied] = useState(false)

  // Esc key listener specific to diff drawer
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, close])

  const handleCopy = () => {
    if (!payload?.unified) return
    navigator.clipboard.writeText(payload.unified)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen || !payload) {
    return null
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 w-[min(48vw,720px)] min-w-[360px] flex flex-col border-l border-[#272a30] bg-[#0c0d0e]/95 backdrop-blur-md shadow-2xl transition-transform duration-200 ease-out"
      role="dialog"
      aria-label="File Diff Viewer"
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#272a30] bg-[#121418]/90 select-none shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
          <FileTypeIcon filename={payload.fileName} className="w-4 h-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-zinc-100 truncate" title={payload.fileName}>
                {payload.fileName}
              </span>

              {/* Additions badge */}
              {payload.additions > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-emerald-950/70 border border-emerald-800/60 text-emerald-400 font-mono text-[10px] font-medium shrink-0">
                  +{payload.additions}
                </span>
              )}

              {/* Deletions badge */}
              {payload.deletions > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-rose-950/70 border border-rose-800/60 text-rose-400 font-mono text-[10px] font-medium shrink-0">
                  -{payload.deletions}
                </span>
              )}

              {payload.status === 'added' && payload.additions === 0 && (
                <span className="px-1.5 py-0.2 rounded bg-blue-950/70 border border-blue-800/60 text-blue-400 font-mono text-[10px]">
                  New
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-zinc-500 truncate" title={payload.filePath}>
              {payload.filePath}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {payload.unified && (
            <button
              onClick={handleCopy}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
              title="复制统一差异文本 (Copy Diff)"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          <button
            onClick={close}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
            title="关闭 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Drawer Body (Scrollable Diff) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 bg-[#090a0c]">
        <DiffViewer payload={payload} />
      </div>

      {/* Drawer Subtle Footer */}
      <div className="px-3 py-1.5 border-t border-[#1f2228] bg-[#0f1115] text-[10px] text-zinc-500 flex items-center justify-between select-none">
        <span>按 Esc 或点击右上角关闭</span>
        <span className="font-mono text-zinc-600">
          {payload.tool?.toUpperCase()}
        </span>
      </div>
    </aside>
  )
}
