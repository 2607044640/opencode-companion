import { useMemo } from 'react'
import type { DiffDrawerPayload } from './DiffDrawerContext'
import { parseUnifiedHunks } from '../../utils/tool-diff'

interface DiffViewerProps {
  payload: DiffDrawerPayload
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
          <div className="mt-4 text-left bg-zinc-950/80 p-3 rounded border border-zinc-800/60 overflow-x-auto">
            <span className="text-zinc-400 font-semibold block mb-1 uppercase text-[10px]">
              Tool Input Arguments:
            </span>
            <pre className="text-zinc-300 text-[11px] leading-relaxed">
              {JSON.stringify(payload.rawInput, null, 2)}
            </pre>
          </div>
        )}
      </div>
    )
  }

  // If hunks parsed successfully
  if (hunks.length > 0) {
    return (
      <div className="font-mono text-xs select-text divide-y divide-zinc-800/40">
        {hunks.map((hunk, hIdx) => (
          <div key={`hunk_${hIdx}`} className="pb-3">
            {/* Hunk Header */}
            <div className="sticky top-0 z-10 bg-[#15181e]/95 backdrop-blur px-3 py-1.5 text-[11px] font-mono text-cyan-400/90 border-y border-zinc-800/60 shadow-sm flex items-center justify-between">
              <span>{hunk.header}</span>
              <span className="text-zinc-500 text-[10px]">
                Lines {hunk.oldStart} → {hunk.newStart}
              </span>
            </div>

            {/* Hunk Lines */}
            <div className="divide-y divide-zinc-900/30">
              {hunk.lines.map((line, lIdx) => {
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
                  <div
                    key={`line_${hIdx}_${lIdx}`}
                    className={`flex items-stretch font-mono text-[11px] leading-5 min-w-full ${rowBg} transition-colors`}
                  >
                    {/* Old Line Gutter */}
                    <div className="w-10 shrink-0 text-right pr-2 select-none text-zinc-600 bg-zinc-950/40 text-[10px]">
                      {line.oldNo ?? ''}
                    </div>

                    {/* New Line Gutter */}
                    <div className="w-10 shrink-0 text-right pr-2 select-none text-zinc-600 bg-zinc-950/40 border-r border-zinc-800/50 text-[10px]">
                      {line.newNo ?? ''}
                    </div>

                    {/* Sign (+ / -) */}
                    <div className={`w-5 shrink-0 text-center select-none ${signColor}`}>
                      {sign}
                    </div>

                    {/* Code Content */}
                    <div className={`flex-1 px-1 overflow-x-auto whitespace-pre ${textColor}`}>
                      {line.text}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Fallback raw view
  return (
    <pre className="p-4 font-mono text-[11px] leading-relaxed overflow-x-auto text-zinc-300">
      {payload.unified}
    </pre>
  )
}
