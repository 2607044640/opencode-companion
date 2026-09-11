import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { emptyTalkMap } from "../schema/talk-map"
import { COMMENT_GROUP_TYPE, SESSION_CARD_TYPE, type TalkMapFlowNode } from "./flow-nodes"
import { applyDragStop, mergeFlowPositions, miniMapNodeColor } from "./map-graph"

describe("mergeFlowPositions", () => {
  it("keeps previous positions while dragging", () => {
    const previous: TalkMapFlowNode[] = [
      {
        id: "a",
        type: SESSION_CARD_TYPE,
        position: { x: 10, y: 20 },
        data: { title: "A", ghost: false, running: false },
      },
    ]
    const next: TalkMapFlowNode[] = [
      {
        id: "a",
        type: SESSION_CARD_TYPE,
        position: { x: 99, y: 99 },
        data: { title: "A", ghost: false, running: false, isHighlighted: true },
      },
    ]
    const merged = mergeFlowPositions(previous, next, true)
    const dragged = merged[0]
    assert.equal(dragged?.position.x, 10)
    assert.equal(dragged?.type, SESSION_CARD_TYPE)
    if (dragged?.type === SESSION_CARD_TYPE) {
      assert.equal(dragged.data.isHighlighted, undefined)
    }
  })

  it("keeps previous positions when not dragging so live drag is not overwritten", () => {
    const previous: TalkMapFlowNode[] = [
      {
        id: "a",
        type: SESSION_CARD_TYPE,
        position: { x: 10, y: 20 },
        data: { title: "A", ghost: false, running: false },
      },
    ]
    const next: TalkMapFlowNode[] = [
      {
        id: "a",
        type: SESSION_CARD_TYPE,
        position: { x: 99, y: 99 },
        data: { title: "A", ghost: false, running: false, isHighlighted: true },
      },
    ]
    const merged = mergeFlowPositions(previous, next, false)
    const kept = merged[0]
    assert.deepEqual(kept?.position, { x: 10, y: 20 })
    assert.equal(kept?.type, SESSION_CARD_TYPE)
    if (kept?.type === SESSION_CARD_TYPE) {
      assert.equal(kept.data.isHighlighted, true)
    }
  })
})

describe("applyDragStop", () => {
  it("moves a card and returns undefined when the position is unchanged", () => {
    const map = {
      ...emptyTalkMap(),
      cards: {
        card_a: {
          cardId: "card_a",
          sessionId: "ses_a",
          ghost: false,
          position: { x: 8, y: 8 },
          directory: "/proj",
        },
      },
    }
    const node: TalkMapFlowNode = {
      id: "card_a",
      type: SESSION_CARD_TYPE,
      position: { x: 8, y: 8 },
      data: { title: "A", ghost: false, running: false },
    }
    assert.equal(applyDragStop(map, node), undefined)
    const moved = applyDragStop(map, { ...node, position: { x: 40, y: 12 } })
    assert.deepEqual(moved?.cards["card_a"]?.position, { x: 40, y: 12 })
  })
})

describe("miniMapNodeColor", () => {
  it("uses group, colorTag, running, then ghost, then default", () => {
    assert.equal(miniMapNodeColor({ type: COMMENT_GROUP_TYPE, data: {} }), "rgba(58, 65, 80, 0.4)")
    assert.equal(miniMapNodeColor({ data: { colorTag: "#ff00aa" } }), "#ff00aa")
    assert.equal(miniMapNodeColor({ data: { running: true } }), "#1f6feb")
    assert.equal(miniMapNodeColor({ data: { ghost: true } }), "#4b5563")
    assert.equal(miniMapNodeColor({ data: {} }), "#38bdf8")
  })
})
