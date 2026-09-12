/**
 * Drag-and-drop file categorization and mention injection utilities.
 */

export interface CategorizedDroppedFiles {
  readonly imageFiles: File[]
  readonly otherFiles: File[]
}

/**
 * Checks if a DragEvent contains external files (rather than internal text selection).
 */
export function hasFilePayload(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer || !dataTransfer.types) return false
  return Array.from(dataTransfer.types).includes('Files')
}

/**
 * Categorizes dropped files into image files (for thumbnail preview attachments)
 * and non-image files (for @file mention insertion).
 */
export function categorizeDroppedFiles(files: FileList | readonly File[] | File[]): CategorizedDroppedFiles {
  const imageFiles: File[] = []
  const otherFiles: File[] = []
  const list = Array.from(files)

  for (const file of list) {
    if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(file.name)) {
      imageFiles.push(file)
    } else {
      otherFiles.push(file)
    }
  }

  return { imageFiles, otherFiles }
}

export interface MentionFormatResult {
  readonly newText: string
  readonly newCursorPosition: number
}

/**
 * Inserts @file mentions at the specified cursor position with intelligent space padding.
 */
export function formatFileMentions(
  files: readonly File[] | File[],
  currentText: string,
  cursorPosition?: number
): MentionFormatResult {
  if (files.length === 0) {
    return {
      newText: currentText,
      newCursorPosition: cursorPosition ?? currentText.length,
    }
  }

  const mentions = files
    .map((f) => `@${f.name.trim()}`)
    .filter((m) => m.length > 1)
    .join(' ')

  if (!mentions) {
    return {
      newText: currentText,
      newCursorPosition: cursorPosition ?? currentText.length,
    }
  }

  const pos =
    cursorPosition !== undefined && cursorPosition >= 0 && cursorPosition <= currentText.length
      ? cursorPosition
      : currentText.length

  const before = currentText.slice(0, pos)
  const after = currentText.slice(pos)

  const needsLeadingSpace = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n')
  const needsTrailingSpace = !after.startsWith(' ') && !after.startsWith('\n')

  const prefix = needsLeadingSpace ? ' ' : ''
  const suffix = needsTrailingSpace ? ' ' : ''

  const insertion = `${prefix}${mentions}${suffix}`
  const newText = `${before}${insertion}${after}`
  const newCursorPosition = before.length + insertion.length

  return { newText, newCursorPosition }
}
