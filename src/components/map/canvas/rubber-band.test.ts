import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { rubberBandBox, rubberBandOverlayStyle, shouldStartRubberBand } from "./rubber-band"

describe("rubberBandBox", () => {
  it("keeps start as origin even when dragged up-left", () => {
    assert.deepEqual(
      rubberBandBox({ start: { x: 40, y: 50 }, end: { x: 10, y: 20 } }),
      { x: 40, y: 50, w: -30, h: -30 },
    )
  })
})

describe("rubberBandOverlayStyle", () => {
  it("uses min/abs so the overlay rectangle stays positive", () => {
    assert.deepEqual(
      rubberBandOverlayStyle({ start: { x: 40, y: 50 }, end: { x: 10, y: 20 } }),
      { left: 10, top: 20, width: 30, height: 30 },
    )
  })
})

describe("shouldStartRubberBand", () => {
  it("starts only on Ctrl + primary pointer off a node", () => {
    assert.equal(shouldStartRubberBand({ ctrlKey: true, button: 0, onNode: false }), true)
    assert.equal(shouldStartRubberBand({ ctrlKey: false, button: 0, onNode: false }), false)
    assert.equal(shouldStartRubberBand({ ctrlKey: true, button: 2, onNode: false }), false)
    assert.equal(shouldStartRubberBand({ ctrlKey: true, button: 0, onNode: true }), false)
  })
})
