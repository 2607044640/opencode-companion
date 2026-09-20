import { useState, useEffect } from 'react'
import { X, Copy, Check, ChevronDown, ChevronRight, ChevronsUpDown } from 'lucide-react'
import { useDiffDrawer } from './DiffDrawerContext'
import { DiffViewer } from './DiffViewer'
import { FileTypeIcon } from '../common/FileTypeIcon'
import { usePreferences } from '../../utils/preferences'

export function DiffSidebarDrawer() {
  const { mode, payload, turnPayload, isOpen, close } = useDiffDrawer()
  const { prefs } = usePreferences()
  const [copied, setCopied] = useState(false)
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({})
  const floating = prefs.floatingDiffView !== false

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
    const text =
      mode === 'turn' && turnPayload
        ? turnPayload.files.map((f) => f.unified).filter(Boolean).join('\n\n')
        : payload?.unified || ''
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen || (!payload && !turnPayload)) {
    return null
  }

  const isTurnMode = mode === 'turn' && turnPayload !== null
  const turnFiles = turnPayload?.files ?? []
  const allCollapsed =
    turnFiles.length > 0 && turnFiles.every((f) => collapsedFiles[f.filePath] === true)

  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsedFiles({})
    } else {
      const next: Record<string, boolean> = {}
      for (const f of turnFiles) {
        next[f.filePath] = true
      }
      setCollapsedFiles(next)
    }
  }

  const header = isTurnMode ? (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[#272a30] bg-[#121418]/90 select-none shrink-0">
      <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
        <span className="font-semibold text-xs text-zinc-100 font-mono tracking-tight">
          Review
        </span>
        <span className="text-zinc-600">|</span>
        <span className="text-xs text-zinc-400 font-mono">
          {turnPayload.title || 'For Turn'}
        </span>
        {turnPayload.turnBadge && (
          <span className="px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 text-[10px] font-mono text-zinc-300">
            {turnPayload.turnBadge}
          </span>
        )}
        <span className="px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800/60 text-emerald-400 font-mono text-[10px] font-medium">
          {turnFiles.length} {turnFiles.length === 1 ? 'file' : 'files'}
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={toggleAll}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
          title={allCollapsed ? '全部展开 (Expand All)' : '全部折叠 (Collapse All)'}
        >
          <ChevronsUpDown className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleCopy}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
          title="复制全部差异文本 (Copy All Diffs)"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={close}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
          title="关闭 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[#272a30] bg-[#121418]/90 select-none shrink-0">
      <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
        <FileTypeIcon filename={payload!.fileName} className="w-4 h-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-zinc-100 truncate" title={payload!.fileName}>
              {payload!.fileName}
            </span>

            {payload!.additions > 0 && (
              <span className="px-1.5 py-0.2 rounded bg-emerald-950/70 border border-emerald-800/60 text-emerald-400 font-mono text-[10px] font-medium shrink-0">
                +{payload!.additions}
              </span>
            )}

            {payload!.deletions > 0 && (
              <span className="px-1.5 py-0.2 rounded bg-rose-950/70 border border-rose-800/60 text-rose-400 font-mono text-[10px] font-medium shrink-0">
                -{payload!.deletions}
              </span>
            )}

            {payload!.status === 'added' && payload!.additions === 0 && (
              <span className="px-1.5 py-0.2 rounded bg-blue-950/70 border border-blue-800/60 text-blue-400 font-mono text-[10px]">
                New
              </span>
            )}
          </div>
          <div className="text-[10px] font-mono text-zinc-500 truncate" title={payload!.filePath}>
            {payload!.filePath}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {payload!.unified && (
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
  )

  const body = isTurnMode ? (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 bg-[#090a0c] min-w-0 space-y-3">
      {turnFiles.map((file, idx) => {
        const isCollapsed = collapsedFiles[file.filePath] === true
        return (
          <div
            key={`turn_file_${file.filePath}_${idx}`}
            className="rounded-lg border border-[#232730] bg-[#0e1014] overflow-hidden shadow-sm"
          >
            {/* Accordion File Header (Antigravity Style: File Icon, Name, Dir, +/- Badge, Chevron) */}
            <div
              onClick={() =>
                setCollapsedFiles((prev) => ({
                  ...prev,
                  [file.filePath]: !isCollapsed,
                }))
              }
              className="flex items-center justify-between px-3 py-2 bg-[#14171d] hover:bg-[#191d24] cursor-pointer select-none transition-colors border-b border-transparent"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                <FileTypeIcon filename={file.fileName} className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-xs text-zinc-100 font-mono truncate">
                  {file.fileName}
                </span>
                <span
                  className="text-[11px] font-mono text-zinc-500 truncate"
                  title={file.filePath}
                >
                  {file.filePath.replace(/\\/g, '/')}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  {file.additions > 0 && (
                    <span className="text-emerald-400 font-semibold">+{file.additions}</span>
                  )}
                  {file.deletions > 0 && (
                    <span className="text-rose-400 font-semibold">-{file.deletions}</span>
                  )}
                  {file.status === 'added' && file.additions === 0 && (
                    <span className="text-blue-400">New</span>
                  )}
                </div>
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                )}
              </div>
            </div>

            {/* Accordion File Diff Body */}
            {!isCollapsed && (
              <div className="border-t border-[#232730] p-1 bg-[#090a0c]">
                <DiffViewer payload={file} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  ) : (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 bg-[#090a0c] min-w-0">
      <DiffViewer payload={payload!} />
    </div>
  )

  const footer = (
    <div className="px-3 py-1.5 border-t border-[#1f2228] bg-[#0f1115] text-[10px] text-zinc-500 flex items-center justify-between select-none">
      <span>按 Esc 或点击右上角关闭</span>
      <span className="font-mono text-zinc-600">
        {isTurnMode ? `${turnFiles.length} FILES MODIFIED` : payload?.tool?.toUpperCase()}
      </span>
    </div>
  )

  if (floating) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) close()
        }}
      >
        <div
          className="flex flex-col bg-[#0c0d0e] border border-[#272a30] overflow-hidden min-w-0"
          role="dialog"
          aria-modal="true"
          aria-label="File Diff Viewer"
          style={{
            width: 'min(88vw, 1100px)',
            height: 'min(86vh, 900px)',
            borderRadius: '12px',
            boxShadow: '0 20px 48px rgba(0, 0, 0, 0.45)',
          }}
        >
          {header}
          {body}
          {footer}
        </div>
      </div>
    )
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 w-[min(48vw,720px)] min-w-[360px] flex flex-col border-l border-[#272a30] bg-[#0c0d0e]/95 backdrop-blur-md shadow-2xl transition-transform duration-200 ease-out"
      role="dialog"
      aria-label="File Diff Viewer"
    >
      {header}
      {body}
      {footer}
    </aside>
  )
}
