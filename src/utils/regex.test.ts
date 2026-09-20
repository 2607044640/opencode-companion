import test from "node:test"
import assert from "node:assert/strict"
import { escapeRegExp } from "./regex"

test("escapeRegExp escapes regex special characters", () => {
  assert.equal(escapeRegExp("hello.world*+?^${}()|[]\\"), "hello\\.world\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\")
  assert.equal(escapeRegExp("normal text"), "normal text")
})
