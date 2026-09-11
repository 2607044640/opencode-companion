import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getLayoutedNodes, applyLayoutToMap, shouldAutoLayoutCards } from "./layout-dagre"
import { emptyTalkMap } from "../schema/talk-map"
import { COMMENT_GROUP_TYPE, SESSION_CARD_TYPE } from "./flow-nodes"
import type { Edge, Node } from "@xyflow/react"

describe("layout-dagre", () => {
  it("lays out parent and child sessions from left to right (LR)", () => {
    const nodes: Node[] = [
      {
        id: "card_parent",
        type: SESSION_CARD_TYPE,
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: "card_child",
        type: SESSION_CARD_TYPE,
        position: { x: 0, y: 0 },
        data: {},
      },
    ]
    const edges: Edge[] = [
      {
        id: "edge_1",
        source: "card_parent",
        target: "card_child",
      },
    ]

    const layouted = getLayoutedNodes(nodes, edges, {
      direction: "LR",
      nodeWidth: 240,
      nodeHeight: 140,
      rankSep: 80,
    })

    const parent = layouted.find((n) => n.id === "card_parent")
    const child = layouted.find((n) => n.id === "card_child")

    assert.ok(parent)
    assert.ok(child)
    // In LR layout, child must be to the right of parent
    assert.ok(
      child.position.x >= parent.position.x + 240 + 80,
      `child x (${child.position.x}) should be at least parent x (${parent.position.x}) + width + rankSep`,
    )
  })

  it("leaves comment group nodes unchanged without breaking graph", () => {
    const nodes: Node[] = [
      {
        id: "card_1",
        type: SESSION_CARD_TYPE,
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: "group_1",
        type: COMMENT_GROUP_TYPE,
        position: { x: 500, y: 500 },
        data: {},
      },
    ]
    const layouted = getLayoutedNodes(nodes, [])
    const group = layouted.find((n) => n.id === "group_1")
    assert.ok(group)
    assert.deepEqual(group.position, { x: 500, y: 500 })
  })

  it("re-bounds and moves comment groups when child cards are laid out", () => {
    const nodes: Node[] = [
      {
        id: "card_1",
        type: SESSION_CARD_TYPE,
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: "group_1",
        type: COMMENT_GROUP_TYPE,
        position: { x: 500, y: 500 },
        data: { w: 100, h: 100 },
      },
    ]
    const groups = {
      group_1: {
        groupId: "group_1",
        title: "Group 1",
        color: "#3a4150",
        x: 500,
        y: 500,
        w: 100,
        h: 100,
        childCardIds: ["card_1"],
        createdAt: Date.now(),
        directory: "/test",
      },
    }
    const layouted = getLayoutedNodes(nodes, [], {}, groups)
    const groupNode = layouted.find((n) => n.id === "group_1")
    const cardNode = layouted.find((n) => n.id === "card_1")
    assert.ok(groupNode)
    assert.ok(cardNode)
    // Group must enclose card_1 (with padding 24)
    assert.equal(groupNode.position.x, cardNode.position.x - 24)
    assert.equal(groupNode.position.y, cardNode.position.y - 24)
  })

  it("applies layouted positions back to TalkMap and updates group bounds", () => {
    const map = emptyTalkMap()
    const mapWithCardsAndGroup = {
      ...map,
      cards: {
        c1: {
          cardId: "c1",
          sessionId: "s1",
          ghost: false,
          position: { x: 0, y: 0 },
          directory: "/test",
        },
      },
      groups: {
        g1: {
          groupId: "g1",
          title: "Group 1",
          color: "#3a4150",
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          childCardIds: ["c1"],
          createdAt: 1,
          directory: "/test",
        },
      },
    }
    const layoutedNodes: Node[] = [
      {
        id: "c1",
        position: { x: 150, y: 250 },
        data: {},
      },
    ]
    const updated = applyLayoutToMap(mapWithCardsAndGroup, layoutedNodes)
    assert.equal(updated.cards["c1"]?.position.x, 150)
    assert.equal(updated.cards["c1"]?.position.y, 250)
    // g1 should be re-bounded around c1
    assert.equal(updated.groups["g1"]?.x, 150 - 24)
    assert.equal(updated.groups["g1"]?.y, 250 - 24)
    assert.equal(updated.groups["g1"]?.w, 240 + 48)
    assert.equal(updated.groups["g1"]?.h, 140 + 48)
  })

  it("detects heavily clustered and single-column cards", () => {
    // 0 or 1 cards: not clustered
    assert.equal(shouldAutoLayoutCards([]), false)
    assert.equal(shouldAutoLayoutCards([{ position: { x: 10, y: 10 } }]), false)

    // Overlapping cards with identical coords: clustered
    assert.equal(
      shouldAutoLayoutCards([
        { position: { x: 100, y: 100 } },
        { position: { x: 100, y: 100 } },
      ]),
      true,
    )

    // Two cards stacked in a single vertical column (initial load stack at x=48): clustered
    assert.equal(
      shouldAutoLayoutCards([
        { position: { x: 48, y: 48 } },
        { position: { x: 48, y: 168 } },
      ]),
      true,
    )

    // Three or more cards in a single vertical column: clustered
    assert.equal(
      shouldAutoLayoutCards([
        { position: { x: 48, y: 48 } },
        { position: { x: 48, y: 168 } },
        { position: { x: 48, y: 288 } },
      ]),
      true,
    )

    // Two cards overlapping within standard card bounds (e.g. collided): clustered
    assert.equal(
      shouldAutoLayoutCards([
        { position: { x: 100, y: 100 } },
        { position: { x: 150, y: 120 } },
      ]),
      true,
    )

    // Distributed cards: not clustered
    assert.equal(
      shouldAutoLayoutCards([
        { position: { x: 48, y: 48 } },
        { position: { x: 368, y: 48 } },
        { position: { x: 688, y: 180 } },
      ]),
      false,
    )
  })
})
