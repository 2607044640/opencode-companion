import test from "node:test"
import assert from "node:assert/strict"
import { filterProjectSessions } from "./blueprint-action-helpers"

test("filterProjectSessions", async (t) => {
  const cards = {
    c1: { cardId: "c1", sessionId: "s1", directory: "/root", position: { x: 0, y: 0 }, ghost: false },
    c2: { cardId: "c2", sessionId: "s2", directory: "/root", position: { x: 10, y: 10 }, ghost: false },
    c3: { cardId: "c3", sessionId: "s3", directory: "/root", position: { x: 20, y: 20 }, ghost: false },
    c_other: { cardId: "c_other", sessionId: "s4", directory: "/other", position: { x: 0, y: 0 }, ghost: false },
  }

  const titles = {
    s1: "Fix authentication bug",
    s2: "Refactor sidebar component",
    s3: "Optimize database queries",
    s4: "Foreign directory session",
  }

  await t.test("returns all sessions in directory when query is empty, excluding excludeCardId", () => {
    const results = filterProjectSessions({
      cards,
      titles,
      directory: "/root",
      query: "",
      excludeCardId: "c1",
    })
    assert.equal(results.length, 2)
    assert.deepEqual(results.map((r) => r.cardId), ["c2", "c3"])
  })

  await t.test("filters sessions matching query case-insensitively", () => {
    const results = filterProjectSessions({
      cards,
      titles,
      directory: "/root",
      query: "database",
      excludeCardId: "c1",
    })
    assert.equal(results.length, 1)
    assert.equal(results[0].cardId, "c3")
    assert.equal(results[0].title, "Optimize database queries")
  })

  await t.test("matches against sessionId if query contains it", () => {
    const results = filterProjectSessions({
      cards,
      titles,
      directory: "/root",
      query: "s2",
    })
    assert.equal(results.length, 1)
    assert.equal(results[0].cardId, "c2")
  })
})
