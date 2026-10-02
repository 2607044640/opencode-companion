import test from "node:test"
import assert from "node:assert/strict"
import {
  filterProjectSessions,
  filterCategorizedSessions,
  sessionIdFromNodeData,
  executeConnectAction,
} from "./blueprint-action-helpers"
import type { TalkMap } from "../schema/talk-map"
import type { ViewState } from "./map-interactions"

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

test("filterCategorizedSessions separates existing cards from unowned sessions", () => {
  const cards = {
    c1: { cardId: "c1", sessionId: "s1", directory: "/root", position: { x: 0, y: 0 }, ghost: false },
  }

  const titles = {
    s1: "Fix authentication bug",
    s2: "Unowned session in root",
    s3: "Unowned session in other",
  }

  const sessions = [
    { id: "s1", title: "Fix authentication bug", directory: "/root", timeUpdated: 100 },
    { id: "s2", title: "Unowned session in root", directory: "/root", timeUpdated: 200 },
    { id: "s3", title: "Unowned session in other", directory: "/other", timeUpdated: 300 },
  ]

  const categorized = filterCategorizedSessions({
    cards,
    titles,
    sessions,
    directory: "/root",
    query: "",
  })

  assert.equal(categorized.existingSessions.length, 1)
  assert.equal(categorized.existingSessions[0].cardId, "c1")
  assert.equal(categorized.existingSessions[0].isUnowned, false)

  assert.equal(categorized.unownedSessions.length, 1)
  assert.equal(categorized.unownedSessions[0].sessionId, "s2")
  assert.equal(categorized.unownedSessions[0].isUnowned, true)
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

  // 2. Locate card when fromNode is null (does not enter session directly)
  let selectedSessionId = ""
  let locatedCardId = ""
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
    onLocateCard: (id) => {
      locatedCardId = id
    },
  })
  assert.equal(selectResult, true)
  assert.equal(selectedSessionId, "", "Must not call onSelectSession")
  assert.equal(locatedCardId, "card_2", "Must locate existing card")
  assert.equal(toastMsg, "已在地图中定位会话")
})

test("executeConnectAction handles unowned session instantiation and wiring", () => {
  let toastMsg = ""
  const setToast = (msg: string) => {
    toastMsg = msg
  }

  let persisted: TalkMap | undefined = undefined
  const initialMap: TalkMap = {
    version: 1,
    cards: {
      card_parent: {
        cardId: "card_parent",
        sessionId: "ses_parent",
        position: { x: 0, y: 0 },
        ghost: false,
        directory: "/root",
      },
    },
    edges: {},
    boards: {
      "/root": { cardIds: ["card_parent"], groupIds: [] },
    },
  }

  const initialView: ViewState = {
    kind: "ready",
    map: initialMap,
    directory: "/root",
    projects: [],
    titles: { ses_parent: "Parent Session" },
    running: {},
    updated: {},
  }

  let currentView: ViewState = initialView
  const setView = (updater: any) => {
    currentView = typeof updater === "function" ? updater(currentView) : updater
  }

  // Connect unowned session from parent node
  const res = executeConnectAction({
    menu: {
      clientPoint: { x: 100, y: 100 },
      flowPos: { x: 250, y: 150 },
      fromNode: { id: "card_parent", data: {} },
    },
    view: currentView,
    session: {
      sessionId: "ses_unowned",
      title: "Newly Added Unowned Session",
      directory: "/root",
      isUnowned: true,
    },
    persistMap: (m) => {
      persisted = m
    },
    setView,
    setToast,
    newCardId: () => "card_unowned_1",
    isZh: true,
  })

  assert.equal(res, true)
  assert.equal(toastMsg, "已添加并连接会话")
  assert.ok(persisted)
  assert.ok(persisted!.cards["card_unowned_1"])
  assert.equal(persisted!.cards["card_unowned_1"].sessionId, "ses_unowned")
  assert.equal(persisted!.cards["card_unowned_1"].position.x, 250)
  assert.equal(persisted!.cards["card_unowned_1"].position.y, 150)
  assert.ok(persisted!.edges["link:card_parent:card_unowned_1"])

  // Test English mode
  let enToast = ""
  executeConnectAction({
    menu: {
      clientPoint: { x: 0, y: 0 },
      flowPos: { x: 0, y: 0 },
      fromNode: { id: "card_parent", data: {} },
    },
    view: currentView,
    session: {
      cardId: "card_parent",
      title: "Parent",
      isUnowned: false,
    },
    persistMap: () => {},
    setView: () => {},
    setToast: (msg) => {
      enToast = msg
    },
    isZh: false,
  })
  assert.equal(enToast, "Cannot connect to self")

  // Test selecting existing session without fromNode (locates card, does NOT enter session)
  let locatedCardId = ""
  let locatedPos: any = null
  let sessionSelected = false
  let locateToast = ""

  const locateRes = executeConnectAction({
    menu: {
      clientPoint: { x: 50, y: 50 },
      flowPos: { x: 100, y: 100 },
      fromNode: null,
    },
    view: currentView,
    session: {
      cardId: "card_parent",
      sessionId: "ses_parent",
      title: "Parent Session",
      isUnowned: false,
    },
    persistMap: () => {},
    setView: () => {},
    setToast: (msg) => {
      locateToast = msg
    },
    onSelectSession: () => {
      sessionSelected = true
    },
    onLocateCard: (cardId, pos) => {
      locatedCardId = cardId
      locatedPos = pos
    },
    isZh: true,
  })

  assert.equal(locateRes, true)
  assert.equal(sessionSelected, false, "Must NOT call onSelectSession to prevent prematurely entering dialogue")
  assert.equal(locatedCardId, "card_parent")
  assert.equal(locateToast, "已在地图中定位会话")
})


