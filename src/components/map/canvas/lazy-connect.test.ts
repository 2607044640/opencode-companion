import test from "node:test"
import assert from "node:assert/strict"
import { resolveLazyConnect, findCardAtFlowPosition } from "./lazy-connect"

test("resolveLazyConnect", async (t) => {
  await t.test("connects fromNode -> targetCardId when dragging from source pin", () => {
    const res = resolveLazyConnect({
      fromNodeId: "card_a",
      fromHandleType: "source",
      targetCardId: "card_b",
    })
    assert.deepEqual(res, {
      finalSource: "card_a",
      finalTarget: "card_b",
    })
  })

  await t.test("connects targetCardId -> fromNode when dragging from target pin", () => {
    const res = resolveLazyConnect({
      fromNodeId: "card_b",
      fromHandleType: "target",
      targetCardId: "card_a",
    })
    assert.deepEqual(res, {
      finalSource: "card_a",
      finalTarget: "card_b",
    })
  })

  await t.test("defaults to fromNode -> targetCardId when handle type is undefined", () => {
    const res = resolveLazyConnect({
      fromNodeId: "card_x",
      targetCardId: "card_y",
    })
    assert.deepEqual(res, {
      finalSource: "card_x",
      finalTarget: "card_y",
    })
  })
})

test("findCardAtFlowPosition", async (t) => {
  const cards = {
    card_1: {
      cardId: "card_1",
      directory: "/proj",
      position: { x: 100, y: 100 },
    },
    card_2: {
      cardId: "card_2",
      directory: "/proj",
      position: { x: 500, y: 300 },
    },
    card_other_dir: {
      cardId: "card_other_dir",
      directory: "/other",
      position: { x: 100, y: 100 },
    },
  }

  await t.test("detects hit inside card boundaries", () => {
    const hit = findCardAtFlowPosition({
      flowPos: { x: 150, y: 150 },
      cards,
      directory: "/proj",
    })
    assert.equal(hit, "card_1")
  })

  await t.test("detects hit within padding area around card", () => {
    // Card 1 is at (100, 100) with default padding 12, width 240, height 140
    // x=95 is within 100 - 12 = 88
    const hit = findCardAtFlowPosition({
      flowPos: { x: 95, y: 105 },
      cards,
      directory: "/proj",
    })
    assert.equal(hit, "card_1")
  })

  await t.test("ignores cards belonging to other directories", () => {
    const hit = findCardAtFlowPosition({
      flowPos: { x: 150, y: 150 },
      cards,
      directory: "/other",
    })
    assert.equal(hit, "card_other_dir")
  })

  await t.test("returns undefined when position is in empty space", () => {
    const hit = findCardAtFlowPosition({
      flowPos: { x: 380, y: 220 },
      cards,
      directory: "/proj",
    })
    assert.equal(hit, undefined)
  })

  await t.test("selects the closest card when two cards overlap in padding bounds", () => {
    const closeCards = {
      card_left: {
        cardId: "card_left",
        directory: "/proj",
        position: { x: 100, y: 100 },
      },
      card_right: {
        cardId: "card_right",
        directory: "/proj",
        position: { x: 345, y: 100 }, // right next to card_left (width 240, so ends at 340)
      },
    }
    // (342, 120) is in padding of both, but center of card_right is at (465, 170), center of card_left is at (220, 170)
    // distance to card_left: |342 - 220| = 122
    // distance to card_right: |342 - 465| = 123 -> card_left is closer
    const hitLeft = findCardAtFlowPosition({
      flowPos: { x: 341, y: 120 },
      cards: closeCards,
      directory: "/proj",
      padding: 12,
    })
    assert.equal(hitLeft, "card_left")

    // (344, 120): distance to card_left = 124, distance to card_right = 121 -> card_right is closer
    const hitRight = findCardAtFlowPosition({
      flowPos: { x: 344, y: 120 },
      cards: closeCards,
      directory: "/proj",
      padding: 12,
    })
    assert.equal(hitRight, "card_right")
  })
})
