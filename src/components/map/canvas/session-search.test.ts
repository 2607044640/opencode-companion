import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  collectMatchedSessionCards,
  normalizeSearchQuery,
  searchHighlight,
  sessionMatchesQuery,
  withSearchHighlight,
} from "./session-search"

describe("sessionMatchesQuery", () => {
  it("matches every field when the query is empty", () => {
    assert.equal(
      sessionMatchesQuery("", { title: "Alpha", nextStep: "ship", sessionId: "ses_1" }),
      true,
    )
  })

  it("matches title, nextStep, or sessionId case-insensitively", () => {
    const fields = { title: "Talk Map", nextStep: "Wire inject", sessionId: "ses_AbC" }
    assert.equal(sessionMatchesQuery("talk", fields), true)
    assert.equal(sessionMatchesQuery("inject", fields), true)
    assert.equal(sessionMatchesQuery("ses_abc", fields), true)
    assert.equal(sessionMatchesQuery("missing", fields), false)
  })

  it("matches multi-token queries like fix c across words", () => {
    const fields = {
      title: "Fix Companion agent dispatch UnknownError",
      nextStep: "Ship patch",
      sessionId: "ses_fix",
    }
    assert.equal(sessionMatchesQuery("fix c", fields), true)
    assert.equal(sessionMatchesQuery("dispatch unknown", fields), true)
    assert.equal(sessionMatchesQuery("fix nonexistent", fields), false)
  })
})

describe("searchHighlight", () => {
  it("dims non-matches only while a query is active", () => {
    assert.deepEqual(searchHighlight({ query: "", matches: true, selected: false }), {
      isDimmed: false,
      isHighlighted: false,
      isSelected: false,
    })
    assert.deepEqual(searchHighlight({ query: "map", matches: true, selected: true }), {
      isDimmed: false,
      isHighlighted: true,
      isSelected: true,
      searchQuery: "map",
    })
    assert.deepEqual(searchHighlight({ query: "map", matches: false, selected: false }), {
      isDimmed: true,
      isHighlighted: false,
      isSelected: false,
      searchQuery: "map",
    })
  })
})

describe("collectMatchedSessionCards", () => {
  it("skips nodes without a sessionId and reports only query hits", () => {
    const nodes = [
      {
        id: "card_ghost",
        position: { x: 0, y: 0 },
        data: { title: "Ghost" },
      },
      {
        id: "card_hit",
        position: { x: 10, y: 20 },
        data: { title: "Board review", sessionId: "ses_hit", nextStep: "ship" },
      },
      {
        id: "card_miss",
        position: { x: 1, y: 1 },
        data: { title: "Other", sessionId: "ses_miss" },
      },
    ]
    assert.deepEqual(collectMatchedSessionCards(nodes, normalizeSearchQuery("board")), [
      {
        cardId: "card_hit",
        sessionId: "ses_hit",
        title: "Board review",
        position: { x: 10, y: 20 },
      },
    ])
  })
})

describe("withSearchHighlight", () => {
  it("applies dim/highlight/selected from one matcher", () => {
    const nodes = [
      {
        id: "a",
        position: { x: 0, y: 0 },
        data: { title: "Alpha", sessionId: "ses_a" },
      },
      {
        id: "b",
        position: { x: 1, y: 1 },
        data: { title: "Beta", sessionId: "ses_b" },
      },
    ]
    const highlighted = withSearchHighlight(nodes, "alpha", "ses_a")
    assert.equal(highlighted[0]?.data.isHighlighted, true)
    assert.equal(highlighted[0]?.data.isSelected, true)
    assert.equal(highlighted[0]?.data.searchQuery, "alpha")
    assert.equal(highlighted[1]?.data.isDimmed, true)
    assert.equal(highlighted[1]?.data.isHighlighted, false)
  })
})
