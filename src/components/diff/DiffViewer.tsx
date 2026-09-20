import { useMemo, useState } from 'react'
import type { DiffDrawerPayload } from './DiffDrawerContext'
import {
  parseUnifiedHunks,
  collapseUnchangedLines,
  type DiffLineItem,
  type DiffViewRow,
} from '../../utils/tool-diff'

interface DiffViewerProps {
  payload: DiffDrawerPayload
}

function DiffLineRow({ line }: { line: DiffLineItem }) {
  const isAdd = line.kind === 'add'
  const isDel = line.kind === 'del'

  let rowBg = 'hover:bg-zinc-800/20'
  let textColor = 'text-zinc-300'
  let sign = ' '
  let signColor = 'text-zinc-600'

  if (isAdd) {
    rowBg = 'bg-emerald-950/30 hover:bg-emerald-950/50 border-l-2 border-emerald-500/80'
    textColor = 'text-emerald-200'
    sign = '+'
    signColor = 'text-emerald-400 font-bold'
  } else if (isDel) {
    rowBg = 'bg-rose-950/30 hover:bg-rose-950/50 border-l-2 border-rose-500/80'
    textColor = 'text-rose-200'
    sign = '-'
    signColor = 'text-rose-400 font-bold'
  }

  return (
    <div className={`flex items-start font-mono text-[11px] leading-5 min-w-0 ${rowBg} transition-colors`}>
      <div className="w-10 shrink-0 text-right pr-2 select-none text-zinc-600 bg-zinc-950/40 text-[10px] leading-5">
        {line.oldNo ?? ''}
      </div>
      <div className="w-10 shrink-0 text-right pr-2 select-none text-zinc-600 bg-zinc-950/40 border-r border-zinc-800/50 text-[10px] leading-5">
        {line.newNo ?? ''}
      </div>
      <div className={`w-5 shrink-0 text-center select-none leading-5 ${signColor}`}>{sign}</div>
      <div className={`flex-1 min-w-0 px-1 whitespace-pre-wrap break-all overflow-hidden ${textColor}`}>
        {line.text}
      </div>
    </div>
  )
}

function HunkBody({ hunkId, lines }: { hunkId: number; lines: DiffLineItem[] }) {
  const [revealed, setRevealed] = useState<Record<string, { head: number; tail: number }>>({})
  const rows = useMemo(() => collapseUnchangedLines(lines, { revealed }), [lines, revealed])

  const hasAnyRevealed = useMemo(
    () => Object.values(revealed).some((r) => (r.head || 0) > 0 || (r.tail || 0) > 0),
    [revealed]
  )

  return (
    <div className="min-w-0">
      {hasAnyRevealed && (
        <div className="flex justify-end px-3 py-1 bg-zinc-950/40 border-b border-zinc-800/40">
          <button
            type="button"
            onClick={() => setRevealed({})}
            className="text-[10px] font-mono text-zinc-400 hover:text-cyan-300 underline cursor-pointer"
          >
            Reset all collapsed lines
          </button>
        </div>
      )}
      {rows.map((row: DiffViewRow) => {
        if (row.type === 'line') {
          return <DiffLineRow key={`line_${hunkId}_${row.index}`} line={row.line} />
        }

        return (
          <div
            key={row.id}
            className="flex items-center justify-between px-3 py-1.5 bg-[#10131a] hover:bg-[#141822] border-y border-dashed border-zinc-800 transition-colors select-none"
          >
            <div className="w-12 shrink-0" />
            <button
              type="button"
              onClick={() =>
                setRevealed((prev) => ({
                  ...prev,
                  [row.id]: { head: lines.length, tail: 0 },
                }))
              }
              className="px-3 py-1 rounded-full text-[11px] font-mono font-medium text-zinc-400 hover:text-zinc-100 bg-[#161a24] hover:bg-[#1e2330] border border-zinc-700/60 shadow-sm cursor-pointer transition-all"
              title="展开全部剩余未修改行 (Expand remaining unchanged lines)"
            >
              +{row.count} more lines
            </button>

            <div className="flex flex-col gap-0.5 items-end w-12 shrink-0">
              {row.count > 10 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRevealed((prev) => ({
                        ...prev,
                        [row.id]: {
                          head: (prev[row.id]?.head || 0) + 10,
                          tail: prev[row.id]?.tail || 0,
                        },
                      }))
                    }}
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-400 hover:text-cyan-300 bg-[#181c26] hover:bg-zinc-700/60 border border-zinc-700/60 cursor-pointer"
                    title="向下展开 10 行 (Reveal 10 lines downward)"
                  >
                    +10
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRevealed((prev) => ({
                        ...prev,
                        [row.id]: {
                          head: prev[row.id]?.head || 0,
                          tail: (prev[row.id]?.tail || 0) + 10,
                        },
                      }))
                    }}
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-400 hover:text-cyan-300 bg-[#181c26] hover:bg-zinc-700/60 border border-zinc-700/60 cursor-pointer"
                    title="向上展开 10 行 (Reveal 10 lines upward)"
                  >
                    +10
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function DiffViewer({ payload }: DiffViewerProps) {
  const hunks = useMemo(() => {
    if (payload.hunks && payload.hunks.length > 0) {
      return payload.hunks
    }
    if (payload.unified) {
      return parseUnifiedHunks(payload.unified)
    }
    return []
  }, [payload.hunks, payload.unified])

  if (hunks.length === 0 && !payload.unified) {
    return (
      <div className="p-6 text-center text-zinc-500 font-mono text-xs">
        <p className="mb-2">该修改步骤未产生或未返回内联差异文本。</p>
        {payload.rawInput && Object.keys(payload.rawInput).length > 0 && (
          <div className="mt-4 text-left bg-zinc-950/80 p-3 rounded border border-zinc-800/60 overflow-x-hidden">
            <span className="text-zinc-400 font-semibold block mb-1 uppercase text-[10px]">
              Tool Input Arguments:
            </span>
            <pre className="text-zinc-300 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
              {JSON.stringify(payload.rawInput, null, 2)}
            </pre>
          </div>
        )}
      </div>
    )
  }

  if (hunks.length > 0) {
    return (
      <div className="font-mono text-xs select-text divide-y divide-zinc-800/40 min-w-0">
        {hunks.map((hunk, hIdx) => (
          <div key={`hunk_${hIdx}`} className="pb-3 min-w-0">
            <div className="sticky top-0 z-10 bg-[#15181e]/95 backdrop-blur px-3 py-1.5 text-[11px] font-mono text-cyan-400/90 border-y border-zinc-800/60 shadow-sm flex items-center justify-between gap-2 min-w-0">
              <span className="truncate min-w-0">{hunk.header}</span>
              <span className="text-zinc-500 text-[10px] shrink-0">
                Lines {hunk.oldStart} → {hunk.newStart}
              </span>
            </div>
            <HunkBody hunkId={hIdx} lines={hunk.lines} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <pre className="p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all overflow-x-hidden text-zinc-300">
      {payload.unified}
    </pre>
  )
}
