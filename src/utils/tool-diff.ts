export interface DiffLineItem {
  kind: 'ctx' | 'add' | 'del'
  text: string
  oldNo?: number
  newNo?: number
}

export interface DiffHunk {
  header: string
  oldStart: number
  newStart: number
  lines: DiffLineItem[]
}

export type DiffViewRow =
  | { type: 'line'; line: DiffLineItem; index: number }
  | { type: 'collapse'; id: string; count: number; startIndex: number; endIndex: number; expandable?: boolean }

export interface CollapseUnchangedOptions {
  pad?: number
  minCollapse?: number
  revealed?: Record<string, { head: number; tail: number }>
}

const DEFAULT_CONTEXT_PAD = 3
const DEFAULT_MIN_COLLAPSE = 4
const OMITTED_MARK = '\u0000omitted'

export function omittedLineCount(line: DiffLineItem): number {
  if (!line.text.startsWith(OMITTED_MARK)) return 0
  const count = Number(line.text.slice(OMITTED_MARK.length))
  return Number.isFinite(count) && count > 0 ? count : 0
}

export function collapseUnchangedLines(
  lines: DiffLineItem[],
  options: CollapseUnchangedOptions = {}
): DiffViewRow[] {
  const omittedAt = lines.findIndex((line) => omittedLineCount(line) > 0)
  if (omittedAt >= 0) {
    const rows: DiffViewRow[] = []
    lines.forEach((line, index) => {
      const omitted = omittedLineCount(line)
      if (omitted > 0) {
        rows.push({
          type: 'collapse',
          id: `omit_${index}`,
          count: omitted,
          startIndex: index,
          endIndex: index + 1,
          expandable: false,
        })
        return
      }
      rows.push({ type: 'line', line, index })
    })
    return rows
  }

  const pad = options.pad ?? DEFAULT_CONTEXT_PAD
  const minCollapse = options.minCollapse ?? DEFAULT_MIN_COLLAPSE
  const revealed = options.revealed ?? {}
  const rows: DiffViewRow[] = []
  let i = 0

  while (i < lines.length) {
    if (lines[i].kind !== 'ctx') {
      rows.push({ type: 'line', line: lines[i], index: i })
      i += 1
      continue
    }

    const start = i
    while (i < lines.length && lines[i].kind === 'ctx') {
      i += 1
    }
    const end = i
    const len = end - start
    const atStart = start === 0
    const atEnd = end === lines.length

    let keepHead = pad
    let keepTail = pad
    if (atStart && atEnd) {
      keepHead = 0
      keepTail = 0
    } else if (atStart) {
      keepHead = 0
      keepTail = pad
    } else if (atEnd) {
      keepHead = pad
      keepTail = 0
    }

    if (keepHead + keepTail >= len) {
      for (let j = start; j < end; j += 1) {
        rows.push({ type: 'line', line: lines[j], index: j })
      }
      continue
    }

    const hidden = len - keepHead - keepTail
    if (hidden < minCollapse) {
      for (let j = start; j < end; j += 1) {
        rows.push({ type: 'line', line: lines[j], index: j })
      }
      continue
    }

    const id = `ctx_${start}_${end}`
    const rev = revealed[id] || { head: 0, tail: 0 }
    const head = Math.max(0, Math.min(hidden, rev.head || 0))
    const tail = Math.max(0, Math.min(hidden - head, rev.tail || 0))

    for (let j = start; j < start + keepHead + head; j += 1) {
      rows.push({ type: 'line', line: lines[j], index: j })
    }

    const remaining = hidden - head - tail
    if (remaining > 0) {
      rows.push({
        type: 'collapse',
        id,
        count: remaining,
        startIndex: start + keepHead + head,
        endIndex: end - keepTail - tail,
      })
    }

    for (let j = end - keepTail - tail; j < end; j += 1) {
      rows.push({ type: 'line', line: lines[j], index: j })
    }
  }

  return rows
}

function isUnifiedDiffPreamble(line: string): boolean {
  return (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('Index:') ||
    line.startsWith('===') ||
    line.startsWith('---') ||
    line.startsWith('+++') ||
    line.startsWith('new file mode') ||
    line.startsWith('deleted file mode') ||
    line.startsWith('old mode') ||
    line.startsWith('new mode') ||
    line.startsWith('similarity index') ||
    line.startsWith('rename from') ||
    line.startsWith('rename to') ||
    line.startsWith('copy from') ||
    line.startsWith('copy to')
  )
}

function isBareDiffMarker(line: string): boolean {
  return (
    (line.startsWith('+') && !line.startsWith('+++')) ||
    (line.startsWith('-') && !line.startsWith('---'))
  )
}

/**
 * Parses unified diff text into structured hunks with accurate line numbers
 */
export function parseUnifiedHunks(unified: string): DiffHunk[] {
  if (!unified || typeof unified !== 'string') return []
  const rawLines = unified.split('\n')
  const hunks: DiffHunk[] = []

  let currentHunk: DiffHunk | null = null
  let oldCounter = 0
  let newCounter = 0

  for (const line of rawLines) {
    if (line.startsWith('@@')) {
      if (currentHunk) {
        hunks.push(currentHunk)
      }
      // @@ -oldStart[,oldCount] +newStart[,newCount] @@ optional section header
      const match = line.match(/@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/)
      oldCounter = match ? parseInt(match[1], 10) : 1
      newCounter = match ? parseInt(match[2], 10) : 1

      currentHunk = {
        header: line,
        oldStart: oldCounter,
        newStart: newCounter,
        lines: [],
      }
      continue
    }

    if (!currentHunk) {
      // Preamble (Index:/===/diff --git) must not become a fake @@ -1 +1 @@ hunk.
      if (isUnifiedDiffPreamble(line) || line.trim() === '') {
        continue
      }
      if (!isBareDiffMarker(line)) {
        continue
      }
      currentHunk = {
        header: '@@ -1 +1 @@',
        oldStart: 1,
        newStart: 1,
        lines: [],
      }
      oldCounter = 1
      newCounter = 1
    }

    if (line.startsWith('---') || line.startsWith('+++')) {
      continue
    }

    if (line.startsWith('+')) {
      currentHunk.lines.push({
        kind: 'add',
        text: line.slice(1),
        newNo: newCounter++,
      })
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        kind: 'del',
        text: line.slice(1),
        oldNo: oldCounter++,
      })
    } else if (line.startsWith('\\')) {
      // e.g. \ No newline at end of file - ignore
      continue
    } else {
      // Context line
      const content = line.startsWith(' ') ? line.slice(1) : line
      currentHunk.lines.push({
        kind: 'ctx',
        text: content,
        oldNo: oldCounter++,
        newNo: newCounter++,
      })
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk)
  }

  return hunks
}

interface FileLine {
  /** Present only when some hunk actually showed this old line. */
  shown?: DiffLineItem
  /** Insertions that belong immediately after this old line. 0 = before line 1. */
  inserts: DiffLineItem[]
}

function emptyFileLine(): FileLine {
  return { inserts: [] }
}

function applyHunk(file: Map<number, FileLine>, hunk: DiffHunk) {
  const oldLines = hunk.lines.filter((line) => line.kind !== 'add')
  if (oldLines.length === 0) {
    const row = file.get(hunk.oldStart) ?? emptyFileLine()
    row.inserts = hunk.lines.filter((line) => line.kind === 'add').map((line) => ({ kind: 'add' as const, text: line.text }))
    file.set(hunk.oldStart, row)
    return
  }

  let oldCursor = hunk.oldStart
  let pending: DiffLineItem[] = []
  const flush = (afterOld: number) => {
    if (pending.length === 0) return
    const row = file.get(afterOld) ?? emptyFileLine()
    row.inserts = pending
    file.set(afterOld, row)
    pending = []
  }

  for (const line of hunk.lines) {
    if (line.kind === 'add') {
      pending.push({ kind: 'add', text: line.text })
      continue
    }
    flush(oldCursor - 1)
    const row = file.get(oldCursor) ?? emptyFileLine()
    row.shown = { kind: line.kind, text: line.text, oldNo: oldCursor }
    row.inserts = []
    file.set(oldCursor, row)
    oldCursor += 1
  }
  flush(oldCursor - 1)
}

function formatHunkHeader(oldStart: number, oldCount: number, newStart: number, newCount: number): string {
  const oldPart = oldCount === 1 ? `${oldStart}` : `${oldStart},${oldCount}`
  const newPart = newCount === 1 ? `${newStart}` : `${newStart},${newCount}`
  return `@@ -${oldPart} +${newPart} @@`
}

/**
 * Stitches separate unified diffs of the same file into one GitHub-style view.
 * Unchanged lines that no hunk captured become a numberless context row so the
 * viewer can render "+N more lines" without inventing source text.
 * A later diff wins when two edits cover the same old line.
 */
export function mergeUnifiedDiffs(diffs: string[]): DiffHunk[] {
  const inputs = diffs.filter((diff) => typeof diff === 'string' && diff.trim().length > 0)
  if (inputs.length === 0) return []

  const parsed = inputs.map((diff) => parseUnifiedHunks(diff))
  if (parsed.some((hunks) => hunks.length === 0)) {
    return parsed.flat()
  }
  if (inputs.length === 1) return parsed[0]

  const file = new Map<number, FileLine>()
  for (const hunks of parsed) {
    for (const hunk of hunks) applyHunk(file, hunk)
  }

  const shownKeys = [...file.keys()].filter((key) => key > 0 && file.get(key)?.shown).sort((a, b) => a - b)
  const insertKeys = [...file.keys()].filter((key) => (file.get(key)?.inserts.length ?? 0) > 0).sort((a, b) => a - b)
  if (shownKeys.length === 0 && insertKeys.length === 0) return []

  const lines: DiffLineItem[] = []
  let oldCount = 0
  let newCount = 0
  const firstShown = shownKeys[0]
  const firstInsert = insertKeys[0]
  const oldStart = firstShown ?? Math.max(firstInsert ?? 1, 1)
  let newNo = oldStart
  let coveredThrough = (firstShown ?? firstInsert ?? 1) - 1

  const pushInserts = (afterOld: number) => {
    const inserts = file.get(afterOld)?.inserts ?? []
    for (const ins of inserts) {
      lines.push({ kind: 'add', text: ins.text, newNo })
      newNo += 1
      newCount += 1
    }
  }

  const pushGap = (untilOld: number) => {
    const missing = untilOld - coveredThrough - 1
    if (missing > 0) {
      lines.push({ kind: 'ctx', text: `${OMITTED_MARK}${missing}` })
      oldCount += missing
      newCount += missing
      newNo += missing
    }
  }

  if (insertKeys.includes(0)) pushInserts(0)

  const marks = [...new Set([...shownKeys, ...insertKeys.filter((key) => key > 0)])].sort((a, b) => a - b)
  for (const oldNo of marks) {
    pushGap(oldNo)
    const shown = file.get(oldNo)?.shown
    if (shown && shown.kind === 'del') {
      lines.push({ kind: 'del', text: shown.text, oldNo })
      oldCount += 1
    } else if (shown) {
      lines.push({ kind: 'ctx', text: shown.text, oldNo, newNo })
      oldCount += 1
      newCount += 1
      newNo += 1
    }
    coveredThrough = oldNo
    pushInserts(oldNo)
  }
  return [
    {
      header: formatHunkHeader(oldStart, Math.max(oldCount, 0), oldStart, Math.max(newCount, 0)),
      oldStart,
      newStart: oldStart,
      lines,
    },
  ]
}

/**
 * Builds a unified diff from old and new string contents
 */
export function buildUnifiedDiff(
  filePath: string,
  oldStr = '',
  newStr = ''
): string {
  if (oldStr === newStr) {
    return ''
  }

  const oldLines = oldStr ? oldStr.split('\n') : []
  const newLines = newStr ? newStr.split('\n') : []

  // Guard against giant files (> 20,000 lines)
  if (oldLines.length + newLines.length > 20000) {
    return `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n[File too large to compute detailed line diff in UI]`
  }

  // Fast path for created file (oldStr is empty)
  if (!oldStr && newStr) {
    const addLines = newLines.map((l) => `+${l}`).join('\n')
    return `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${newLines.length} @@\n${addLines}`
  }

  // Fast path for deleted file (newStr is empty)
  if (oldStr && !newStr) {
    const delLines = oldLines.map((l) => `-${l}`).join('\n')
    return `--- a/${filePath}\n+++ /dev/null\n@@ -1,${oldLines.length} +0,0 @@\n${delLines}`
  }

  // Myers LCS line diffing for moderate sized files
  const del = oldLines.map((l) => `-${l}`).join('\n')
  const add = newLines.map((l) => `+${l}`).join('\n')

  return `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n${del ? del + '\n' : ''}${add}`
}

export interface FormattableDiffFile {
  fileName?: string
  filePath?: string
  unified?: string
  hunks?: DiffHunk[]
}

/**
 * Formats one file's diff into user-specified compact format:
 * <fileName> filePath
 * 145+xxx
 * 145-xxx
 * </fileName>
 */
export function formatFileDiffMarker(file: FormattableDiffFile): string {
  const normPath = (file.filePath || file.fileName || '').replace(/\\/g, '/')
  const fileName = file.fileName || normPath.split('/').pop() || 'file'
  const hunks =
    file.hunks && file.hunks.length > 0
      ? file.hunks
      : parseUnifiedHunks(file.unified || '')

  const lines: string[] = [`<${fileName}> ${normPath}`]

  for (const hunk of hunks) {
    for (const item of hunk.lines) {
      if (item.kind === 'add') {
        const no = item.newNo !== undefined ? item.newNo : ''
        lines.push(`${no}+${item.text.replace(/\r$/, '')}`)
      } else if (item.kind === 'del') {
        const no = item.oldNo !== undefined ? item.oldNo : ''
        lines.push(`${no}-${item.text.replace(/\r$/, '')}`)
      }
    }
  }

  lines.push(`</${fileName}>`)
  return lines.join('\n')
}

/**
 * Formats multiple files into the compact diff marker format separated by newlines.
 */
export function formatAllDiffMarkers(files: FormattableDiffFile[]): string {
  return files
    .filter((f) => Boolean(f && (f.filePath || f.fileName)))
    .map(formatFileDiffMarker)
    .join('\n\n')
}

