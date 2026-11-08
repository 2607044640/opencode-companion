import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Copy, Check, Pencil, Save, CornerDownLeft, FileText } from 'lucide-react'
import { getPastedSnippetStats } from '../../utils/pasted-snippets'
import { useI18n } from '../../utils/i18n'

export interface PastedContentModalProps {
  isOpen: boolean
  pastedId: string
  content: string
  initialEditMode?: boolean
  onClose: () => void
  /** Provided when opened from Composer: allows editing and saving the pasted block */
  onSaveContent?: (newContent: string) => void
  /** Provided when opened from Composer: expands the pasted card back into inline textarea text */
  onInlineToInput?: () => void
}

export function PastedContentModal({
  isOpen,
  pastedId,
  content,
  initialEditMode = false,
  onClose,
  onSaveContent,
  onInlineToInput,
}: PastedContentModalProps) {
  const { tr, lang } = useI18n()
  const isZh = lang?.startsWith('zh') ?? true

  const [copiedContent, setCopiedContent] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draftContent, setDraftContent] = useState(content)

  useEffect(() => {
    if (isOpen) {
      setDraftContent(content)
      setIsEditing(Boolean(initialEditMode && onSaveContent))
    }
  }, [isOpen, content, initialEditMode, onSaveContent])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onClose])

  const activeText = isEditing ? draftContent : content
  const stats = useMemo(() => getPastedSnippetStats(activeText), [activeText])
  const lowerId = (pastedId || 'p1').toLowerCase()
  const upperId = (pastedId || 'p1').toUpperCase()

  if (!isOpen || typeof document === 'undefined') return null

  const handleCopyContent = () => {
    navigator.clipboard.writeText(activeText)
    setCopiedContent(true)
    setTimeout(() => setCopiedContent(false), 2000)
  }

  const handleSaveEdit = () => {
    if (onSaveContent) {
      onSaveContent(draftContent)
    }
    setIsEditing(false)
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isZh ? `粘贴内容查看器: ${lowerId}` : `Pasted Content: ${lowerId}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex flex-col bg-[#0c0d0e] border border-[#272a30] overflow-hidden min-w-0 shadow-2xl"
        style={{
          width: 'min(88vw, 1100px)',
          height: 'min(86vh, 900px)',
          borderRadius: '12px',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar (Matching Image 3 FileViewModal + Image 2 Claude Pasted Content metadata) */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#272a30] bg-[#121418]/90 select-none shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
            <span className="px-2 py-0.5 rounded bg-sky-950/80 border border-sky-700/70 text-sky-300 font-mono text-[10px] font-bold shrink-0">
              {lowerId}
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-950/70 border border-blue-800/60 text-blue-400 font-mono text-[10px] font-semibold shrink-0">
              PASTED
            </span>
            <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-zinc-100 font-mono truncate">
                  {tr(`Pasted content (${lowerId})`, `Pasted content (${lowerId})`)}
                </span>

                <span className="px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 text-[10px] font-mono text-zinc-300 shrink-0">
                  {stats.lineCount} {stats.lineCount === 1 ? tr('行', 'line') : tr('行', 'lines')}
                </span>

                <span className="px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 text-[10px] font-mono text-zinc-400 shrink-0">
                  {stats.formattedSize}
                </span>
              </div>

              <div className="text-[10px] font-mono text-zinc-500 truncate">
                {tr(
                  `在输入框中直接说“看 ${lowerId}”即可让 AI 精准读取此段落`,
                  `Refer to "${lowerId}" in your prompt so the AI reads this block directly`
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {onInlineToInput && (
              <button
                type="button"
                onClick={() => {
                  onInlineToInput()
                  onClose()
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 hover:text-zinc-100 transition-all cursor-pointer"
                title={tr('解除卡片折叠，直接展开回输入框', 'Unpack card into inline textarea text')}
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
                <span>{tr('展开至输入框', 'Inline to Input')}</span>
              </button>
            )}

            {onSaveContent && (
              <button
                type="button"
                onClick={() => {
                  if (isEditing) {
                    handleSaveEdit()
                  } else {
                    setIsEditing(true)
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded transition-all cursor-pointer shadow-sm active:scale-95 ${
                  isEditing
                    ? 'bg-sky-950/80 hover:bg-sky-900 border border-sky-600/70 text-sky-200'
                    : 'bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 hover:text-zinc-100'
                }`}
                title={isEditing ? tr('保存修改', 'Save changes') : tr('编辑粘贴内容', 'Edit pasted content')}
              >
                {isEditing ? (
                  <>
                    <Save className="w-3.5 h-3.5 text-sky-400" />
                    <span>{tr('保存修改', 'Save')}</span>
                  </>
                ) : (
                  <>
                    <Pencil className="w-3.5 h-3.5" />
                    <span>{tr('编辑内容', 'Edit')}</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyContent}
              disabled={!activeText}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded transition-all cursor-pointer shadow-sm active:scale-95 ${
                !activeText
                  ? 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/40 cursor-not-allowed'
                  : 'bg-emerald-950/70 hover:bg-emerald-900/90 border border-emerald-700/60 text-emerald-300 hover:text-emerald-100'
              }`}
              title={tr('复制完整内容', 'Copy full content')}
            >
              {copiedContent ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{tr('已复制内容', 'Copied content')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{tr('复制内容', 'Copy content')}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors cursor-pointer ml-0.5"
              title={tr('关闭 (Esc)', 'Close (Esc)')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body: Line-Numbered Code/Text Display (Image 3 style) or Editor */}
        <div className="flex-1 overflow-auto bg-[#090a0c] min-w-0 p-2 font-mono text-[11px] leading-5">
          {isEditing ? (
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              autoFocus
              className="w-full h-full bg-[#090a0c] text-zinc-200 font-mono text-[12px] leading-5 p-3 resize-none focus:outline-none selection:bg-sky-500/30"
              placeholder={tr('在此编辑粘贴内容…', 'Edit pasted content here...')}
            />
          ) : stats.lines.length === 0 || (stats.lines.length === 1 && !stats.lines[0].text) ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-1.5 py-16 select-none">
              <FileText className="w-8 h-8 text-zinc-600" />
              <span>{tr('暂无粘贴内容', 'No pasted content')}</span>
            </div>
          ) : (
            <div className="min-w-0">
              {stats.lines.map((line, idx) => (
                <div key={idx} className="flex items-start hover:bg-zinc-800/30 transition-colors min-w-0">
                  <div className="w-12 shrink-0 text-right pr-3 select-none text-zinc-600 bg-zinc-950/40 border-r border-zinc-800/40 text-[10px] leading-5 font-mono">
                    {line.lineNo}
                  </div>
                  <div className="flex-1 min-w-0 px-3 select-text whitespace-pre-wrap break-all text-zinc-200 leading-5">
                    {line.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Bar (Matching Image 3 FileViewModal) */}
        <div className="px-4 py-2 border-t border-[#1f2228] bg-[#0f1115] text-[10px] text-zinc-500 flex items-center justify-between select-none shrink-0">
          <span>
            {isEditing
              ? tr('编辑完成后请点击右上角「保存修改」', 'Click "Save" in the top-right when finished editing')
              : tr('按 Esc 或点击右上角关闭', 'Press Esc or click top-right to close')}
          </span>
          <span className="font-mono text-zinc-500 font-medium">
            {stats.lineCount} {tr('行', 'LINES')} · {stats.charCount} {tr('字符', 'CHARS')} · {stats.formattedSize} · PASTED ({upperId})
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}
