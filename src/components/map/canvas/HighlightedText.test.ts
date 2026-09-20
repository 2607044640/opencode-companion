import test from "node:test"
import assert from "node:assert/strict"
import { escapeRegExp } from "./HighlightedText"

test("HighlightedText helpers", async (t) => {
  await t.test("escapeRegExp escapes special characters", () => {
    assert.equal(escapeRegExp("test.*+?^${}()|[]\\"), "test\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\")
  })

  await t.test("multi-token regex splitting works accurately for fix c", () => {
    const text = "Fix Companion agent dispatch UnknownError"
    const words = ["fix", "c"]
    const sortedWords = [...words].sort((a, b) => b.length - a.length)
    const pattern = sortedWords.map(escapeRegExp).join("|")
    const regex = new RegExp(`(${pattern})`, "gi")
    const rawParts = text.split(regex)
    const wordSet = new Set(words.map((w) => w.toLowerCase()))
    const tokens = rawParts.map((part) => ({
      isMatch: wordSet.has(part.toLowerCase()),
      text: part,
    }))

    const matchedTexts = tokens.filter((t) => t.isMatch).map((t) => t.text)
    assert.ok(matchedTexts.includes("Fix"))
    assert.ok(matchedTexts.includes("C"))
  })
})
