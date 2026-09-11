import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { emptyTalkMap } from "../schema/talk-map"
import { disconnectPinEdges, removeCardFromMap, removeEdgesFromMap, removeNodesFromMap } from "./map-mutations"

function mapWithCardAndEdge() {
  const map = emptyTalkMap()
  return {
    ...map,
    cards: {
      card_a: {
        cardId: "card_a",
        sessionId: "ses_a",
        ghost: false,
        position: { x: 0, y: 0 },
        directory: "/proj",
      },
      card_b: {
        cardId: "card_b",
        sessionId: "ses_b",
        ghost: false,
        position: { x: 10, y: 0 },
        directory: "/proj",
      },
    },
    groups: {
      grp_1: {
        groupId: "grp_1",
        title: "Group 1",
        color: "#3a4150",
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        childCardIds: ["card_a"],
        createdAt: 1,
        directory: "/proj",
      },
    },
    edges: {
      "link:card_a:card_b": {
        edgeId: "link:card_a:card_b",
        sourceCardId: "card_a",
        targetCardId: "card_b",
        kind: "link" as const,
        autoSync: false,
        comment: "",
      },
    },
  }
}

describe("removeCardFromMap", () => {
  it("drops the card and every incident edge", () => {
    const next = removeCardFromMap(mapWithCardAndEdge(), "card_a")
    assert.equal(next.cards["card_a"], undefined)
    assert.equal(next.cards["card_b"]?.cardId, "card_b")
    assert.equal(next.edges["link:card_a:card_b"], undefined)
  })
})

describe("removeNodesFromMap", () => {
  it("removes session cards, groups, and incident edges", () => {
    const next = removeNodesFromMap(
      mapWithCardAndEdge(),
      [
        { id: "card_a", type: "sessionCard" },
        { id: "grp_1", type: "commentGroup" },
      ],
      "sessionCard",
      "commentGroup",
    )
    assert.equal(next.cards["card_a"], undefined)
    assert.equal(next.groups["grp_1"], undefined)
    assert.equal(next.edges["link:card_a:card_b"], undefined)
    assert.equal(next.cards["card_b"]?.cardId, "card_b")
  })
})

describe("removeEdgesFromMap", () => {
  it("deletes only the named edges", () => {
    const next = removeEdgesFromMap(mapWithCardAndEdge(), ["link:card_a:card_b"])
    assert.equal(next.edges["link:card_a:card_b"], undefined)
    assert.equal(next.cards["card_a"]?.cardId, "card_a")
  })
})

describe("disconnectPinEdges", () => {
  it("disconnects source edges matching cardId", () => {
    const res = disconnectPinEdges(mapWithCardAndEdge(), "card_a", "source")
    assert.equal(res.removedCount, 1)
    assert.equal(res.nativeCount, 0)
    assert.equal(res.map.edges["link:card_a:card_b"], undefined)
  })

  it("disconnects target edges matching cardId", () => {
    const res = disconnectPinEdges(mapWithCardAndEdge(), "card_b", "target")
    assert.equal(res.removedCount, 1)
    assert.equal(res.nativeCount, 0)
    assert.equal(res.map.edges["link:card_a:card_b"], undefined)
  })

  it("does not remove native edges but counts them", () => {
    const map = mapWithCardAndEdge()
    map.edges["link:card_a:card_b"].kind = "native"
    const res = disconnectPinEdges(map, "card_a", "source")
    assert.equal(res.removedCount, 0)
    assert.equal(res.nativeCount, 1)
    assert.ok(res.map.edges["link:card_a:card_b"])
  })

  it("reports 0 removed when pin has no edges", () => {
    const res = disconnectPinEdges(mapWithCardAndEdge(), "card_a", "target")
    assert.equal(res.removedCount, 0)
    assert.equal(res.nativeCount, 0)
  })
})

