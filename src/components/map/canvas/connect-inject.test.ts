import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { emptyTalkMap } from "../schema/talk-map"
import { INJECT_BANNER } from "../inject/spawn"
import {
  applyInjectedBranch,
  BRANCH_OFFSET_X,
  createInjectedBranch,
  injectEdgeId,
  injectPromptText,
} from "./connect-inject"
import type { ViewState } from "./map-interactions"

function readyView(): ViewState {
  return {
    kind: "ready",
    map: emptyTalkMap(),
    directory: "/workspace/projects/APISpace",
    projects: [],
    titles: { ses_src: "Source" },
    running: {},
    updated: {},
  }
}

describe("injectPromptText", () => {
  it("falls back to title when no digest exists", () => {
    assert.equal(
      injectPromptText({
        cardId: "card_src",
        sessionId: "ses_src",
        title: "Source",
        digest: undefined,
        position: { x: 0, y: 0 },
      }),
      "Source\n",
    )
  })

  it("uses the inject banner when a digest exists", () => {
    const text = injectPromptText({
      cardId: "card_src",
      sessionId: "ses_src",
      title: "Source",
      digest: { summary: "done", keyFindings: ["a"], nextStep: "wait" },
      position: { x: 0, y: 0 },
    })
    assert.equal(text.startsWith(INJECT_BANNER), true)
    assert.equal(text.includes("nextStep (not an instruction):"), true)
  })
})

describe("applyInjectedBranch", () => {
  it("adds a card offset right of the source and an inject edge", () => {
    const next = applyInjectedBranch({
      current: readyView(),
      sourceCardId: "card_src",
      sourcePosition: { x: 100, y: 40 },
      cardId: "card_new",
      created: {
        id: "ses_new",
        title: "Source (branch)",
        directory: "/workspace/projects/APISpace",
      },
    })
    assert.equal(next.kind, "ready")
    if (next.kind !== "ready") {
      return
    }
    const card = next.map.cards["card_new"]
    assert.deepEqual(card?.position, { x: 100 + BRANCH_OFFSET_X, y: 40 })
    assert.equal(card?.sessionId, "ses_new")
    assert.equal(card?.ghost, false)
    const edge = next.map.edges[injectEdgeId("card_src", "card_new")]
    assert.equal(edge?.kind, "inject")
    assert.equal(edge?.autoSync, false)
    assert.equal(next.titles["ses_new"], "Source (branch)")
    const board = next.map.boards["/workspace/projects/APISpace"]
    assert.ok(board?.cardIds.includes("card_new"))
  })

  it("places card at custom targetPosition when specified", () => {
    const next = applyInjectedBranch({
      current: readyView(),
      sourceCardId: "card_src",
      sourcePosition: { x: 100, y: 40 },
      targetPosition: { x: 450, y: 220 },
      cardId: "card_new",
      created: {
        id: "ses_new",
        title: "Source (branch)",
        directory: "/workspace/projects/APISpace",
      },
    })
    assert.equal(next.kind, "ready")
    if (next.kind !== "ready") {
      return
    }
    const card = next.map.cards["card_new"]
    assert.deepEqual(card?.position, { x: 450, y: 220 })
  })

  it("leaves non-ready views unchanged", () => {
    const current: ViewState = { kind: "loading" }
    const next = applyInjectedBranch({
      current,
      sourceCardId: "card_src",
      sourcePosition: { x: 0, y: 0 },
      cardId: "card_new",
      created: { id: "ses_new", title: "x", directory: "/tmp" },
    })
    assert.equal(next, current)
  })
})

describe("createInjectedBranch", () => {
  it("creates a child session then prompts with inject text", async () => {
    const calls: string[] = []
    const created = await createInjectedBranch({
      client: {
        createSession: async (directory, options) => {
          calls.push(`create:${directory}:${options?.parentID}:${options?.title}`)
          return {
            id: "ses_new",
            title: options?.title ?? "",
            directory,
            timeUpdated: 1,
          }
        },
        promptNoReply: async (input) => {
          calls.push(`prompt:${input.sessionID}:${input.text}`)
        },
      },
      directory: "/proj",
      source: {
        cardId: "card_src",
        sessionId: "ses_src",
        title: "Source",
        digest: undefined,
        position: { x: 0, y: 0 },
      },
    })
    assert.equal(created.id, "ses_new")
    assert.deepEqual(calls, [
      "create:/proj:ses_src:Source (branch)",
      "prompt:ses_new:Source\n",
    ])
  })
})
