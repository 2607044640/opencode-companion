import type { ReactNode } from "react"
import { escapeRegExp } from "../../../utils/regex"

export { escapeRegExp }

export type HighlightPreset = "yellow" | "orange"

export const HIGHLIGHT_PRESETS: Record<HighlightPreset, string> = {
  yellow: "text-yellow-300 font-bold bg-yellow-500/25 px-0.5 rounded-xs",
  orange: "bg-orange-500/30 text-orange-300 font-semibold rounded-xs px-0.5",
}

export interface HighlightedTextProps {
  readonly text: string
  readonly query: string
  readonly className?: string
  readonly preset?: HighlightPreset
  readonly highlightClassName?: string
}

export function HighlightedText({
  text,
  query,
  className,
  preset = "yellow",
  highlightClassName,
}: HighlightedTextProps): ReactNode {
  const trimmed = query.trim()
  if (!trimmed) {
    return <span className={className}>{text}</span>
  }

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return <span className={className}>{text}</span>
  }

  const effectiveHighlightClass = highlightClassName || HIGHLIGHT_PRESETS[preset]

  let tokens: { isMatch: boolean; text: string }[] = []
  try {
    const sortedWords = [...words].sort((a, b) => b.length - a.length)
    const pattern = sortedWords.map(escapeRegExp).join("|")
    const regex = new RegExp(`(${pattern})`, "gi")
    const rawParts = text.split(regex)
    const wordSet = new Set(words.map((w) => w.toLowerCase()))
    tokens = rawParts.map((part) => ({
      isMatch: wordSet.has(part.toLowerCase()),
      text: part,
    }))
  } catch {
    tokens = [{ isMatch: false, text }]
  }

  return (
    <span className={className}>
      {tokens.map((token, i) =>
        token.isMatch ? (
          <span key={i} className={effectiveHighlightClass}>
            {token.text}
          </span>
        ) : (
          <span key={i}>{token.text}</span>
        ),
      )}
    </span>
  )
}
