import test from "node:test"
import assert from "node:assert/strict"
import type { TalkMap } from "../schema/talk-map"
import {
  INITIAL_MAP_HISTORY,
  recordHistorySnapshot,
  undoHistory,
  redoHistory,
} from "./map-history"

function createMockMap(version: number): TalkMap {
  return {
    version: 1,
    cards: [
      {
        id: `card-${version}`,
        sessionId: `sess-${version}`,
        position: { x: version * 10, y: version * 10 },
      },
    ],
    groups: [],
    customEdges: [],
  }
}

test("map-history pure state transitions", async (t) => {
  await t.test("recordHistorySnapshot pushes snapshot and resets future", () => {
    const map1 = createMockMap(1)
    const map2 = createMockMap(2)

    const h1 = recordHistorySnapshot(INITIAL_MAP_HISTORY, map1)
    assert.equal(h1.past.length, 1)
    assert.equal(h1.future.length, 0)
    assert.equal(h1.past[0], map1)

    const h2 = recordHistorySnapshot(h1, map2)
    assert.equal(h2.past.length, 2)
    assert.equal(h2.past[1], map2)
  })

  await t.test("recordHistorySnapshot caps at maxHistory (e.g. 3)", () => {
    let history = INITIAL_MAP_HISTORY
    for (let i = 1; i <= 5; i++) {
      history = recordHistorySnapshot(history, createMockMap(i), 3)
    }
    assert.equal(history.past.length, 3)
    assert.equal(history.past[0].cards[0].id, "card-3")
    assert.equal(history.past[1].cards[0].id, "card-4")
    assert.equal(history.past[2].cards[0].id, "card-5")
  })

  await t.test("undoHistory steps backward and pushes currentMap to future", () => {
    const map1 = createMockMap(1)
    const map2 = createMockMap(2)
    const map3 = createMockMap(3)

    let history = recordHistorySnapshot(INITIAL_MAP_HISTORY, map1)
    history = recordHistorySnapshot(history, map2)

    // Current state is map3. Undo should return map2.
    const u1 = undoHistory(history, map3)
    assert.equal(u1.map, map2)
    assert.equal(u1.history.past.length, 1)
    assert.equal(u1.history.past[0], map1)
    assert.equal(u1.history.future.length, 1)
    assert.equal(u1.history.future[0], map3)

    // Undo again should return map1.
    const u2 = undoHistory(u1.history, map2)
    assert.equal(u2.map, map1)
    assert.equal(u2.history.past.length, 0)
    assert.equal(u2.history.future.length, 2)
    assert.equal(u2.history.future[0], map2)
    assert.equal(u2.history.future[1], map3)

    // Undo on empty past returns null map and unchanged history
    const u3 = undoHistory(u2.history, map1)
    assert.equal(u3.map, null)
    assert.equal(u3.history.past.length, 0)
  })

  await t.test("redoHistory steps forward and pushes currentMap to past", () => {
    const map1 = createMockMap(1)
    const map2 = createMockMap(2)
    const map3 = createMockMap(3)

    let history = recordHistorySnapshot(INITIAL_MAP_HISTORY, map1)
    history = recordHistorySnapshot(history, map2)

    const u1 = undoHistory(history, map3) // currently at map2, future has [map3]
    const r1 = redoHistory(u1.history, map2)

    assert.equal(r1.map, map3)
    assert.equal(r1.history.future.length, 0)
    assert.equal(r1.history.past.length, 2)
    assert.equal(r1.history.past[0], map1)
    assert.equal(r1.history.past[1], map2)

    // Redo on empty future returns null map
    const r2 = redoHistory(r1.history, map3)
    assert.equal(r2.map, null)
  })
})
