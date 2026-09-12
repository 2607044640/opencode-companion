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
    if (line.startsWith('---') || line.startsWith('+++')) {
      continue
    }

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
      // If content appears before first hunk header, create an implicit hunk
      currentHunk = {
        header: '@@ -1 +1 @@',
        oldStart: 1,
        newStart: 1,
        lines: [],
      }
      oldCounter = 1
      newCounter = 1
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
