export interface SlashTrigger {
  /** Index of the `/` that opened the menu. */
  slashIndex: number
  /** Text between that `/` and the cursor. Not lowercased. */
  query: string
}

/**
 * Open the slash menu when `/` is the start of the field or sits after whitespace,
 * and the token up to the cursor has no space or newline.
 * A `/` glued to a word (`http://`, `a/b`) does not open it.
 */
export function detectSlashTrigger(text: string, cursor: number): SlashTrigger | null {
  if (cursor < 1 || cursor > text.length) return null
  const slashIndex = text.lastIndexOf('/', cursor - 1)
  if (slashIndex === -1) return null
  const charBefore = slashIndex > 0 ? text[slashIndex - 1] : ' '
  if (slashIndex > 0 && !/\s/.test(charBefore)) return null
  const query = text.slice(slashIndex + 1, cursor)
  if (query.includes(' ') || query.includes('\n')) return null
  return { slashIndex, query }
}

/** Replace only the `/query` slice. Text before the slash and after the cursor stays. */
export function applySlashCommand(
  text: string,
  cursor: number,
  name: string
): { text: string; cursor: number } | null {
  const trigger = detectSlashTrigger(text, cursor)
  if (!trigger) return null
  const before = text.slice(0, trigger.slashIndex)
  const after = text.slice(cursor)
  const insertion = `/${name} `
  return {
    text: `${before}${insertion}${after}`,
    cursor: before.length + insertion.length,
  }
}
