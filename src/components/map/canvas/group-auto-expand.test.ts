import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { emptyTalkMap, type TalkMap } from "../schema/talk-map"
import {
  applyCardDropToGroups,
  CARD_HEIGHT,
  CARD_WIDTH,
  deleteGroupFromMap,
  expandGroupToEncloseCard,
  GROUP_PADDING,
  isCardOverlappingGroup,
  resizeGroup,
} from "../groups/group-commands"
import { SESSION_CARD_TYPE, type TalkMapFlowNode } from "./flow-nodes"
import { applyDragStop } from "./map-graph"

describe("group-auto-expand and resize", () => {
  const directory = "/test/project"
  const sampleGroup: TalkMap["groups"][string] = {
    groupId: "group_1",
    title: "Analysis Group",
    color: "#38bdf8",
    x: 100,
    y: 100,
    w: 300,
    h: 200,
    childCardIds: [],
    createdAt: 1000,
    directory,
  }

  describe("isCardOverlappingGroup", () => {
    it("returns true when card is within group bounds", () => {
      // Card is at (120, 120), group is at (100, 100, 300, 200)
      assert.equal(isCardOverlappingGroup({ x: 120, y: 120 }, sampleGroup), true)
    })

    it("returns true when card partially intersects group boundary", () => {
      // Card at (350, 150) overlaps right side [100..400]
      assert.equal(isCardOverlappingGroup({ x: 350, y: 150 }, sampleGroup), true)
    })

    it("returns false when card is completely separated from group", () => {
      // Card at (600, 600) is far away
      assert.equal(isCardOverlappingGroup({ x: 600, y: 600 }, sampleGroup), false)
      // Card at (-300, 100) ends at -60, strictly left of 100
      assert.equal(isCardOverlappingGroup({ x: -300, y: 100 }, sampleGroup), false)
    })
  })

  describe("expandGroupToEncloseCard", () => {
    it("expands group to the right and bottom when card extends outside", () => {
      // Card placed at (300, 200). Card ends at (300 + 240 = 540, 200 + 96 = 296).
      // Group was [100, 100, 300, 200] -> right 400, bottom 300.
      // Expected maxX: 540 + 24 = 564. Expected maxY: 296 + 24 = 320.
      const expanded = expandGroupToEncloseCard(sampleGroup, { x: 300, y: 200 })
      assert.equal(expanded.x, 100)
      assert.equal(expanded.y, 100)
      assert.equal(expanded.w, 564 - 100)
      assert.equal(expanded.h, 320 - 100)
    })

    it("expands group to the left and top when card is placed near top-left", () => {
      // Card placed at (80, 80).
      // Group x=100, y=100.
      // Expected minX: 80 - 24 = 56. Expected minY: 80 - 24 = 56.
      const expanded = expandGroupToEncloseCard(sampleGroup, { x: 80, y: 80 })
      assert.equal(expanded.x, 56)
      assert.equal(expanded.y, 56)
      assert.equal(expanded.w, 400 - 56)
      assert.equal(expanded.h, 300 - 56)
    })

    it("preserves group bounds if card is already enclosed with ample padding", () => {
      // Group: [100, 100, w: 400, h: 300]
      const bigGroup: TalkMap["groups"][string] = {
        ...sampleGroup,
        w: 400,
        h: 300,
      }
      const notExpanded = expandGroupToEncloseCard(bigGroup, { x: 150, y: 150 })
      assert.equal(notExpanded.x, bigGroup.x)
      assert.equal(notExpanded.y, bigGroup.y)
      assert.equal(notExpanded.w, bigGroup.w)
      assert.equal(notExpanded.h, bigGroup.h)
    })
  })

  describe("applyCardDropToGroups", () => {
    function setupMap(): TalkMap {
      return {
        ...emptyTalkMap(),
        cards: {
          card_1: {
            cardId: "card_1",
            sessionId: "ses_1",
            ghost: false,
            position: { x: 500, y: 500 },
            directory,
            groupId: null,
          },
        },
        groups: {
          group_1: { ...sampleGroup },
        },
        boards: {
          [directory]: {
            cardIds: ["card_1"],
            groupIds: ["group_1"],
          },
        },
      }
    }

    it("assigns card to group and auto-expands group when dropped onto group", () => {
      const map = setupMap()
      // Drop card_1 into group_1 at (250, 180)
      const nextMap = applyCardDropToGroups(map, "card_1", { x: 250, y: 180 })

      // Card assigned
      const card = nextMap.cards["card_1"]
      assert.equal(card?.groupId, "group_1")
      assert.deepEqual(card?.position, { x: 250, y: 180 })

      // Group has child card
      const group = nextMap.groups["group_1"]
      assert.ok(group?.childCardIds.includes("card_1"))

      // Group auto-expanded
      const expectedRight = 250 + CARD_WIDTH + GROUP_PADDING
      const expectedBottom = 180 + CARD_HEIGHT + GROUP_PADDING
      assert.ok((group?.x ?? 0) + (group?.w ?? 0) >= expectedRight)
      assert.ok((group?.y ?? 0) + (group?.h ?? 0) >= expectedBottom)
    })

    it("detaches card from group when dragged out to empty space", () => {
      const map = setupMap()
      // First assign card to group_1
      const groupedMap = applyCardDropToGroups(map, "card_1", { x: 150, y: 120 })
      assert.equal(groupedMap.cards["card_1"]?.groupId, "group_1")

      // Now drag card away to (800, 800)
      const detachedMap = applyCardDropToGroups(groupedMap, "card_1", { x: 800, y: 800 })
      const detachedCard = detachedMap.cards["card_1"]
      assert.equal(detachedCard?.groupId, null)
      assert.deepEqual(detachedCard?.position, { x: 800, y: 800 })

      // Group no longer lists card
      const group = detachedMap.groups["group_1"]
      assert.ok(!group?.childCardIds.includes("card_1"))
    })
  })

  describe("resizeGroup", () => {
    it("updates group dimensions and enforces minimum size bounds", () => {
      const map: TalkMap = {
        ...emptyTalkMap(),
        groups: {
          group_1: { ...sampleGroup },
        },
      }

      // Valid resize
      const resized = resizeGroup(map, "group_1", { x: 50, y: 60, w: 450, h: 320 })
      assert.deepEqual(resized.groups["group_1"]?.x, 50)
      assert.deepEqual(resized.groups["group_1"]?.y, 60)
      assert.deepEqual(resized.groups["group_1"]?.w, 450)
      assert.deepEqual(resized.groups["group_1"]?.h, 320)

      // Resize too small clamped to minW: 140, minH: 80
      const clamped = resizeGroup(map, "group_1", { x: 50, y: 60, w: 50, h: 20 })
      assert.equal(clamped.groups["group_1"]?.w, 140)
      assert.equal(clamped.groups["group_1"]?.h, 80)
    })
  })

  describe("deleteGroupFromMap", () => {
    it("deletes group from map and unlinks all child cards without deleting the cards", () => {
      const map: TalkMap = {
        ...emptyTalkMap(),
        cards: {
          card_1: {
            cardId: "card_1",
            sessionId: "ses_1",
            ghost: false,
            position: { x: 120, y: 120 },
            directory,
            groupId: "group_1",
          },
          card_2: {
            cardId: "card_2",
            sessionId: "ses_2",
            ghost: false,
            position: { x: 200, y: 200 },
            directory,
            groupId: "group_1",
          },
        },
        groups: {
          group_1: {
            ...sampleGroup,
            childCardIds: ["card_1", "card_2"],
          },
        },
        boards: {
          [directory]: {
            cardIds: ["card_1", "card_2"],
            groupIds: ["group_1"],
          },
        },
      }

      const nextMap = deleteGroupFromMap(map, "group_1")

      // Group removed
      assert.equal(nextMap.groups["group_1"], undefined)
      assert.ok(!nextMap.boards[directory]?.groupIds.includes("group_1"))

      // Cards still exist but unlinked
      assert.ok(nextMap.cards["card_1"] !== undefined)
      assert.equal(nextMap.cards["card_1"]?.groupId, null)
      assert.ok(nextMap.cards["card_2"] !== undefined)
      assert.equal(nextMap.cards["card_2"]?.groupId, null)
    })
  })

  describe("applyDragStop integration", () => {
    it("triggers applyCardDropToGroups on card drop", () => {
      const map: TalkMap = {
        ...emptyTalkMap(),
        cards: {
          card_1: {
            cardId: "card_1",
            sessionId: "ses_1",
            ghost: false,
            position: { x: 10, y: 10 },
            directory,
            groupId: null,
          },
        },
        groups: {
          group_1: { ...sampleGroup },
        },
        boards: {
          [directory]: {
            cardIds: ["card_1"],
            groupIds: ["group_1"],
          },
        },
      }

      const node: TalkMapFlowNode = {
        id: "card_1",
        type: SESSION_CARD_TYPE,
        position: { x: 150, y: 150 }, // Overlaps sampleGroup [100..400, 100..300]
        data: { title: "Test", ghost: false, running: false },
      }

      const committed = applyDragStop(map, node)
      assert.ok(committed !== undefined)
      assert.equal(committed?.cards["card_1"]?.groupId, "group_1")
    })
  })
})
