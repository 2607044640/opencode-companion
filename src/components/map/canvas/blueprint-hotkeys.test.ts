import test from "node:test"
import assert from "node:assert/strict"
import { isBlueprintReservedKey } from "./blueprint-hotkeys"

function mockKey(init: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): KeyboardEvent {
  return {
    key: init.key,
    ctrlKey: Boolean(init.ctrlKey),
    metaKey: Boolean(init.metaKey),
    altKey: Boolean(init.altKey),
  } as unknown as KeyboardEvent
}

test("isBlueprintReservedKey", async (t) => {
  await t.test("returns false when search is focused so user can type queries", () => {
    assert.equal(isBlueprintReservedKey(mockKey({ key: "f" }), true), false)
    assert.equal(isBlueprintReservedKey(mockKey({ key: "c" }), true), false)
  })

  await t.test("reserves F, C, Home, Space, and Delete when search is not focused", () => {
    assert.equal(isBlueprintReservedKey(mockKey({ key: "f" }), false), true)
    assert.equal(isBlueprintReservedKey(mockKey({ key: "F" }), false), true)
    assert.equal(isBlueprintReservedKey(mockKey({ key: "c" }), false), true)
    assert.equal(isBlueprintReservedKey(mockKey({ key: "C" }), false), true)
    assert.equal(isBlueprintReservedKey(mockKey({ key: "Home" }), false), true)
    assert.equal(isBlueprintReservedKey(mockKey({ key: " " }), false), true)
    assert.equal(isBlueprintReservedKey(mockKey({ key: "Delete" }), false), true)
    assert.equal(isBlueprintReservedKey(mockKey({ key: "Backspace" }), false), true)
  })

  await t.test("reserves Ctrl+A / Cmd+A when search is not focused", () => {
    assert.equal(isBlueprintReservedKey(mockKey({ key: "a", ctrlKey: true }), false), true)
    assert.equal(isBlueprintReservedKey(mockKey({ key: "a", metaKey: true }), false), true)
  })

  await t.test("reserves Ctrl+Z, Cmd+Z, and Ctrl+Y when search is not focused", () => {
    assert.equal(isBlueprintReservedKey(mockKey({ key: "z", ctrlKey: true }), false), true)
    assert.equal(isBlueprintReservedKey(mockKey({ key: "z", metaKey: true }), false), true)
    assert.equal(isBlueprintReservedKey(mockKey({ key: "y", ctrlKey: true }), false), true)
  })

  await t.test("reserves Alt+R (rearrange) when search is not focused", () => {
    assert.equal(isBlueprintReservedKey(mockKey({ key: "r", altKey: true }), false), true)
    assert.equal(isBlueprintReservedKey(mockKey({ key: "R", altKey: true }), false), true)
    assert.equal(isBlueprintReservedKey(mockKey({ key: "r", altKey: true }), true), false)
  })

  await t.test("returns false for non-reserved keys", () => {
    assert.equal(isBlueprintReservedKey(mockKey({ key: "x" }), false), false)
    assert.equal(isBlueprintReservedKey(mockKey({ key: "1" }), false), false)
  })
})

