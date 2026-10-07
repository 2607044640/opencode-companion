import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Copy,
  Check,
  Loader2,
  FileText,
  AlertCircle,
} from 'lucide-react'
import type { ExploreItem } from '../../utils/worked-summary'
import { FileTypeIcon } from '../common/FileTypeIcon'
import { FileActionMenu } from '../common/FileActionMenu'
import { useI18n } from '../../utils/i18n'

export interface FileViewModalProps {
  item: ExploreItem | null
  onClose: () => void
}

export interface ParsedFileContent {
  fileName: string
  filePath: string
  lineRange?: string
  lines: Array<{ lineNo: string; text: string }>
  cleanText: string
  rawOutput: string
}

/**
 * Scans raw output from search/explore tools (glob, grep, find) to extract a concrete file path
 */
export function extractConcreteFilePathFromOutput(
  rawOutput: string,
  query: string
): { extractedPath?: string; lineNo?: number } {
  if (!rawOutput) return {}

  const lines = rawOutput.split('\n')
  const candidates: Array<{ path: string; lineNo?: number }> = []

  // Extract clean target file name if query had wildcards, e.g. "**/AGENTS_Antigravity.md" -> "agents_antigravity.md"
  const cleanTarget = query.split('/').filter(Boolean).pop()?.replace(/[*?]/g, '').toLowerCase()

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // Skip CLI log headers and notices
    if (
      line.startsWith('GROK_TOOL_RESULT') ||
      line.startsWith('No disk change') ||
      line.startsWith('NOTE:') ||
      line.startsWith('Found ') ||
      line.startsWith('[ERROR]')
    ) {
      continue
    }

    // 1. JSON result lines (grep / search), e.g. {"File":"C:\\...", "LineNumber": 123}
    const jsonFileMatch = line.match(/"(?:File|file|filePath|path)"\s*:\s*"([^"]+)"/)
    if (jsonFileMatch) {
      const p = jsonFileMatch[1].replace(/\\\\/g, '\\')
      const lineMatch = line.match(/"(?:LineNumber|line|lineNumber)"\s*:\s*(\d+)/)
      const lNo = lineMatch ? parseInt(lineMatch[1], 10) : undefined
      candidates.push({ path: p, lineNo: lNo })
      continue
    }

    // 2. Absolute POSIX jail paths: /home/developer/projects/... or /workspace/projects/...
    const jailMatch = line.match(/((?:\/home\/developer|\/workspace)\/projects\/[^\s:?*<>|]+)(?::(\d+))?/)
    if (jailMatch) {
      candidates.push({
        path: jailMatch[1],
        lineNo: jailMatch[2] ? parseInt(jailMatch[2], 10) : undefined,
      })
      continue
    }

    // 3. Absolute Windows paths: C:\... or C:/...
    const winMatch = line.match(/([a-zA-Z]:[/\\][^\s:*?"<>|]+)(?::(\d+))?/)
    if (winMatch) {
      candidates.push({
        path: winMatch[1],
        lineNo: winMatch[2] ? parseInt(winMatch[2], 10) : undefined,
      })
      continue
    }

    // 4. Relative paths with extensions (e.g. src/foo.ts:42)
    const relMatch = line.match(/^([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]{1,10})(?::(\d+))?/)
    if (relMatch && !relMatch[1].startsWith('http') && !relMatch[1].includes('//')) {
      candidates.push({
        path: relMatch[1],
        lineNo: relMatch[2] ? parseInt(relMatch[2], 10) : undefined,
      })
      continue
    }
  }

  if (candidates.length === 0) return {}

  // Prioritize candidates matching the target filename if query was a pattern
  if (cleanTarget) {
    const matched = candidates.find((c) => c.path.toLowerCase().includes(cleanTarget))
    if (matched) return { extractedPath: matched.path, lineNo: matched.lineNo }
  }

  return { extractedPath: candidates[0].path, lineNo: candidates[0].lineNo }
}

export function parseExploreFileContent(item: ExploreItem): ParsedFileContent {
  const rawOutput = item.output || item.error || ''
  let content = rawOutput
  let filePath = item.fullPath || item.pathOrQuery

  // 1. Extract <path> tag if present (Grok / OpenCode wrapped outputs)
  const pathMatch = rawOutput.match(/<path>([\s\S]*?)<\/path>/i)
  if (pathMatch) {
    filePath = pathMatch[1].trim()
  }

  // 2. Extract <content> tag if present
  const contentMatch = rawOutput.match(/<content>([\s\S]*?)<\/content>/i)
  if (contentMatch) {
    content = contentMatch[1]
    if (content.startsWith('\n')) content = content.slice(1)
    if (content.endsWith('\n')) content = content.slice(0, -1)
  }

  let lineRange = item.lineRange

  // 3. If filePath contains wildcards (* or ?) or was a search without fullPath, extract concrete path from rawOutput
  if (!item.fullPath || /[*?]/.test(filePath) || item.kind === 'search') {
    const { extractedPath, lineNo } = extractConcreteFilePathFromOutput(rawOutput, item.pathOrQuery)
    if (extractedPath) {
      filePath = extractedPath
      if (!lineRange && lineNo) {
        lineRange = `L${lineNo}`
      }
    }
  }

  const fileName =
    filePath && !/[*?]/.test(filePath)
      ? filePath.split(/[/\\]/).filter(Boolean).pop() || item.pathOrQuery || 'file'
      : item.pathOrQuery || 'file'

  // 3. Parse lines and line numbers
  const rawLines = content.split('\n')

  let hasNumberedPrefix = false
  if (rawLines.length > 0) {
    const sample = rawLines.slice(0, Math.min(rawLines.length, 25)).filter((l) => l.trim().length > 0)
    if (sample.length > 0 && sample.every((l) => /^\s*\d+[:|]\s?/.test(l))) {
      hasNumberedPrefix = true
    }
  }

  const lines: Array<{ lineNo: string; text: string }> = []
  const cleanLineTexts: string[] = []

  rawLines.forEach((line, idx) => {
    if (hasNumberedPrefix) {
      const match = line.match(/^(\s*\d+)[:|]\s?(.*)$/)
      if (match) {
        const no = match[1].trim()
        const txt = match[2]
        lines.push({ lineNo: no, text: txt })
        cleanLineTexts.push(txt)
        return
      }
    }
    const no = String(idx + 1)
    lines.push({ lineNo: no, text: line })
    cleanLineTexts.push(line)
  })

  return {
    fileName,
    filePath,
    lineRange,
    lines,
    cleanText: cleanLineTexts.join('\n'),
    rawOutput,
  }
}

export function FileViewModal({ item, onClose }: FileViewModalProps) {
  const { tr, isZh } = useI18n()
  const [copiedContent, setCopiedContent] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)

  useEffect(() => {
    if (!item) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [item, onClose])

  const parsed = useMemo(() => {
    if (!item) return null
    return parseExploreFileContent(item)
  }, [item])

  if (!item || !parsed) return null
  if (typeof document === 'undefined') return null

  const isRunning = item.status === 'running' || item.status === 'pending'
  const isError = item.status === 'error'
  const hasNoContent = parsed.lines.length === 0 || (parsed.lines.length === 1 && !parsed.lines[0].text)

  const handleCopyContent = () => {
    navigator.clipboard.writeText(parsed.cleanText)
    setCopiedContent(true)
    setTimeout(() => setCopiedContent(false), 2000)
  }

  const handleCopyPath = () => {
    navigator.clipboard.writeText(parsed.filePath)
    setCopiedPath(true)
    setTimeout(() => setCopiedPath(false), 2000)
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isZh ? `文件查看器: ${parsed.fileName}` : `File Viewer: ${parsed.fileName}`}
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
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#272a30] bg-[#121418]/90 select-none shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
            <span className="px-2 py-0.5 rounded bg-blue-950/70 border border-blue-800/60 text-blue-400 font-mono text-[10px] font-semibold shrink-0">
              {item.kind === 'file' ? tr('文件', 'FILE') : tr('搜索', 'SEARCH')}
            </span>
            <FileTypeIcon filename={parsed.fileName} className="w-4 h-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-zinc-100 font-mono truncate" title={parsed.fileName}>
                  {parsed.fileName}
                </span>

                {parsed.lineRange && (
                  <span className="px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/60 text-cyan-400 font-mono text-[10px] font-medium shrink-0">
                    #{parsed.lineRange}
                  </span>
                )}

                <span className="px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 text-[10px] font-mono text-zinc-400 shrink-0">
                  {parsed.lines.length} {parsed.lines.length === 1 ? tr('行', 'line') : tr('行', 'lines')}
                </span>
              </div>

              {parsed.filePath && (
                <div
                  className="text-[10px] font-mono text-zinc-500 truncate cursor-pointer hover:text-zinc-300 transition-colors"
                  title={tr('点击复制路径', 'Click to copy path')}
                  onClick={handleCopyPath}
                >
                  {parsed.filePath.replace(/\\/g, '/')}
                  {copiedPath && (
                    <span className="ml-1.5 text-emerald-400 text-[9px] font-sans font-medium">
                      ({tr('已复制路径', 'Copied path')})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyContent}
              disabled={hasNoContent}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded transition-all cursor-pointer shadow-sm active:scale-95 ${
                hasNoContent
                  ? 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/40 cursor-not-allowed'
                  : 'bg-emerald-950/70 hover:bg-emerald-900/90 border border-emerald-700/60 text-emerald-300 hover:text-emerald-100'
              }`}
              title={tr('复制文件纯净内容', 'Copy clean file content')}
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
            {parsed.filePath && (
              <FileActionMenu filePath={parsed.filePath} line={parsed.lineRange} />
            )}
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

        {/* Modal Body: Code Content Display */}
        <div className="flex-1 overflow-auto bg-[#090a0c] min-w-0 p-2 font-mono text-[11px] leading-5">
          {isRunning ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-2 py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span>{tr('正在读取文件内容…', 'Reading file content...')}</span>
            </div>
          ) : isError && hasNoContent ? (
            <div className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-lg text-rose-300 m-3 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-rose-400">
                <AlertCircle className="w-4 h-4" />
                <span>{tr('文件读取失败或无响应', 'Failed to read file or no response')}</span>
              </div>
              <div className="text-[11px] font-mono text-zinc-400">
                {item.error || item.warningTooltip || tr('未能在输出中获取到该文件内容', 'Unable to retrieve file content from output')}
              </div>
            </div>
          ) : hasNoContent ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-1.5 py-16 select-none">
              <FileText className="w-8 h-8 text-zinc-600" />
              <span>{tr('暂无文件内容输出', 'No file content output')}</span>
            </div>
          ) : (
            <div className="min-w-0">
              {parsed.lines.map((line, idx) => (
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

        {/* Footer Bar */}
        <div className="px-4 py-2 border-t border-[#1f2228] bg-[#0f1115] text-[10px] text-zinc-500 flex items-center justify-between select-none shrink-0">
          <span>{tr('按 Esc 或点击右上角关闭', 'Press Esc or click top-right to close')}</span>
          <span className="font-mono text-zinc-500 font-medium">
            {parsed.lines.length} {tr('行', 'LINES')} · {parsed.cleanText.length} {tr('字符', 'CHARS')} · {item.tool?.toUpperCase() || 'READ'}
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}
