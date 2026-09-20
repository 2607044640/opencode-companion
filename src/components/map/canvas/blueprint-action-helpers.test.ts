import test from "node:test"
import assert from "node:assert/strict"
import {
  filterProjectSessions,
  sessionIdFromNodeData,
  executeConnectAction,
} from "./blueprint-action-helpers"

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

  await t.test("matches multi-token query like fix c across words", () => {
    const results = filterProjectSessions({
      cards: {
        ...cards,
        c_fix: {
          cardId: "c_fix",
          sessionId: "s_fix",
          directory: "/projects/APISpace",
          position: { x: 0, y: 0 },
          ghost: false,
        },
      },
      titles: {
        ...titles,
        s_fix: "Fix Companion agent dispatch UnknownError",
      },
      directory: "all",
      query: "fix c",
    })
    assert.ok(results.some((r) => r.cardId === "c_fix"))
    const hit = results.find((r) => r.cardId === "c_fix")
    assert.equal(hit?.title, "Fix Companion agent dispatch UnknownError")
    assert.equal(hit?.projectBadge, "[APISpace]")
  })

  await t.test("searches across all directories when directory is all", () => {
    const results = filterProjectSessions({
      cards,
      titles,
      directory: "all",
      query: "",
    })
    assert.equal(results.length, 4)
  })
})

test("sessionIdFromNodeData extracts sessionId safely", () => {
  assert.equal(sessionIdFromNodeData(null), undefined)
  assert.equal(sessionIdFromNodeData({}), undefined)
  assert.equal(sessionIdFromNodeData({ sessionId: "ses_123" }), "ses_123")
  assert.equal(sessionIdFromNodeData({ sessionId: 123 }), undefined)
})

test("executeConnectAction handles self connection and session select", () => {
  let toastMsg = ""
  const setToast = (msg: string) => {
    toastMsg = msg
  }

  // 1. Self connection attempt
  const selfResult = executeConnectAction({
    menu: {
      clientPoint: { x: 0, y: 0 },
      flowPos: { x: 0, y: 0 },
      fromNode: { id: "card_1", data: {} },
    },
    view: { kind: "unreachable" },
    session: { cardId: "card_1", title: "Self" },
    persistMap: () => {},
    setView: () => {},
    setToast,
  })
  assert.equal(selfResult, false)
  assert.equal(toastMsg, "无法连接自身")

  // 2. Select session when fromNode is null
  let selectedSessionId = ""
  const selectResult = executeConnectAction({
    menu: {
      clientPoint: { x: 0, y: 0 },
      flowPos: { x: 0, y: 0 },
      fromNode: null,
    },
    view: { kind: "unreachable" },
    session: { cardId: "card_2", sessionId: "ses_target", title: "Target" },
    persistMap: () => {},
    setView: () => {},
    setToast,
    onSelectSession: (id) => {
      selectedSessionId = id
    },
  })
  assert.equal(selectResult, true)
  assert.equal(selectedSessionId, "ses_target")
})

