import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { emptyTalkMap } from "../schema/talk-map"
import { applyLinkConnection, finishRubberBandGroup } from "./map-gestures"

describe("applyLinkConnection", () => {
  it("returns undefined unless both endpoints exist", () => {
    const map = emptyTalkMap()
    assert.equal(applyLinkConnection(map, null, "b"), undefined)
    assert.equal(applyLinkConnection(map, "a", null), undefined)
  })

  it("writes a link edge when both endpoints exist", () => {
    const next = applyLinkConnection(emptyTalkMap(), "card_a", "card_b")
    assert.equal(next?.edges["link:card_a:card_b"]?.kind, "link")
  })
})

describe("finishRubberBandGroup", () => {
  it("returns null when the box contains no cards", () => {
    const next = finishRubberBandGroup({
      map: emptyTalkMap(),
      directory: "/proj",
      band: { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      now: 1,
      newGroupId: () => "grp_1",
    })
    assert.equal(next, null)
  })
})
