import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { calculateHalfLineCutHeight } from './half-line-cut'

describe('Half-Line Cut Algorithm (图2 半行截断对齐算法)', () => {
  test('returns null for null, undefined, or zero-height container', () => {
    assert.equal(calculateHalfLineCutHeight(null as any), null)

    const zeroHeightEl = {
      getBoundingClientRect: () => ({ top: 100, bottom: 100, height: 0, width: 200, left: 0, right: 200 }),
    } as any
    assert.equal(calculateHalfLineCutHeight(zeroHeightEl), null)
  })

  test('returns null when lines are fewer than 2 (single line text)', () => {
    const textNode = { textContent: 'Just a single line' }
    const docMock = {
      createTreeWalker: () => {
        let visited = false
        return {
          nextNode: () => {
            if (!visited) {
              visited = true
              return textNode
            }
            return null
          },
        }
      },
      createRange: () => ({
        selectNodeContents: () => {},
        getClientRects: () => [
          { top: 100, bottom: 124, height: 24, width: 150 },
        ],
      }),
    }

    const containerMock = {
      getBoundingClientRect: () => ({ top: 100, bottom: 124, height: 24, width: 300 }),
      ownerDocument: docMock,
    } as any

    const result = calculateHalfLineCutHeight(containerMock, 4)
    assert.equal(result, null)
  })

  test('accurately slices line 4 at 50% height (3.5 lines) for user input', () => {
    // 4 visual lines @ 24px each
    // Line 1: top: 100, bottom: 124, height: 24
    // Line 2: top: 124, bottom: 148, height: 24
    // Line 3: top: 148, bottom: 172, height: 24
    // Line 4: top: 172, bottom: 196, height: 24
    // Container top: 100.
    // Line 4 midline: 172 + (24 * 0.5) = 184.
    // Relative cut: 184 - 100 = 84px! (Exactly 3.5 lines)
    const textNode1 = { textContent: 'Line 1' }
    const textNode2 = { textContent: 'Line 2' }
    const textNode3 = { textContent: 'Line 3' }
    const textNode4 = { textContent: 'Line 4' }

    const nodes = [textNode1, textNode2, textNode3, textNode4]
    const rects = [
      [{ top: 100, bottom: 124, height: 24, width: 200 }],
      [{ top: 124, bottom: 148, height: 24, width: 180 }],
      [{ top: 148, bottom: 172, height: 24, width: 220 }],
      [{ top: 172, bottom: 196, height: 24, width: 160 }],
    ]

    let currIdx = 0
    let rangeIdx = 0
    const docMock = {
      createTreeWalker: () => ({
        nextNode: () => {
          if (currIdx < nodes.length) {
            return nodes[currIdx++]
          }
          return null
        },
      }),
      createRange: () => ({
        selectNodeContents: () => {},
        getClientRects: () => rects[rangeIdx++],
      }),
    }

    const containerMock = {
      getBoundingClientRect: () => ({ top: 100, bottom: 196, height: 96, width: 300 }),
      ownerDocument: docMock,
    } as any

    const cut = calculateHalfLineCutHeight(containerMock, 4)
    assert.equal(cut, 84)
  })

  test('accurately slices line 5 at 50% height (4.5 lines) for AI response', () => {
    // 6 visual lines @ 24px each
    // Line 1: top: 50, bottom: 74, height: 24
    // Line 2: top: 74, bottom: 98, height: 24
    // Line 3: top: 98, bottom: 122, height: 24
    // Line 4: top: 122, bottom: 146, height: 24
    // Line 5: top: 146, bottom: 170, height: 24
    // Line 6: top: 170, bottom: 194, height: 24
    // Container top: 50.
    // Line 5 midline: 146 + (24 * 0.5) = 158.
    // Relative cut: 158 - 50 = 108px!
    const nodes = [
      { textContent: 'L1' },
      { textContent: 'L2' },
      { textContent: 'L3' },
      { textContent: 'L4' },
      { textContent: 'L5' },
      { textContent: 'L6' },
    ]
    const rects = [
      [{ top: 50, bottom: 74, height: 24, width: 200 }],
      [{ top: 74, bottom: 98, height: 24, width: 200 }],
      [{ top: 98, bottom: 122, height: 24, width: 200 }],
      [{ top: 122, bottom: 146, height: 24, width: 200 }],
      [{ top: 146, bottom: 170, height: 24, width: 200 }],
      [{ top: 170, bottom: 194, height: 24, width: 200 }],
    ]

    let currIdx = 0
    let rangeIdx = 0
    const docMock = {
      createTreeWalker: () => ({
        nextNode: () => (currIdx < nodes.length ? nodes[currIdx++] : null),
      }),
      createRange: () => ({
        selectNodeContents: () => {},
        getClientRects: () => rects[rangeIdx++],
      }),
    }

    const containerMock = {
      getBoundingClientRect: () => ({ top: 50, bottom: 194, height: 144, width: 400 }),
      ownerDocument: docMock,
    } as any

    const cut = calculateHalfLineCutHeight(containerMock, 5)
    assert.equal(cut, 108)
  })

  test('slices last line in half when lines count is less than target (e.g. 3 lines with target 4)', () => {
    // 3 visual lines @ 24px each
    // Line 1: top: 0, bottom: 24, height: 24
    // Line 2: top: 24, bottom: 48, height: 24
    // Line 3: top: 48, bottom: 72, height: 24
    // Container top: 0.
    // Actual target = Math.min(4, 3) = 3 (line 3).
    // Line 3 midline: 48 + 12 = 60px!
    const nodes = [{ textContent: 'L1' }, { textContent: 'L2' }, { textContent: 'L3' }]
    const rects = [
      [{ top: 0, bottom: 24, height: 24, width: 200 }],
      [{ top: 24, bottom: 48, height: 24, width: 200 }],
      [{ top: 48, bottom: 72, height: 24, width: 200 }],
    ]

    let currIdx = 0
    let rangeIdx = 0
    const docMock = {
      createTreeWalker: () => ({
        nextNode: () => (currIdx < nodes.length ? nodes[currIdx++] : null),
      }),
      createRange: () => ({
        selectNodeContents: () => {},
        getClientRects: () => rects[rangeIdx++],
      }),
    }

    const containerMock = {
      getBoundingClientRect: () => ({ top: 0, bottom: 72, height: 72, width: 300 }),
      ownerDocument: docMock,
    } as any

    const cut = calculateHalfLineCutHeight(containerMock, 4)
    assert.equal(cut, 60)
  })

  test('merges inline tokens on the same visual line (tolerance < 4px)', () => {
    // One physical line composed of 3 inline spans (e.g. bold, code, link)
    // Span 1: top: 10.0, height: 22
    // Span 2: top: 10.5, height: 24 (e.g. code font slightly taller)
    // Span 3: top: 10.2, height: 22
    // Line 2: top: 38.0, height: 22
    const nodes = [
      { textContent: 'Normal ' },
      { textContent: 'code_token' },
      { textContent: ' more text' },
      { textContent: 'Second line text' },
    ]
    const rects = [
      [{ top: 10.0, bottom: 32.0, height: 22, width: 50 }],
      [{ top: 10.5, bottom: 34.5, height: 24, width: 60 }],
      [{ top: 10.2, bottom: 32.2, height: 22, width: 50 }],
      [{ top: 38.0, bottom: 60.0, height: 22, width: 120 }],
    ]

    let currIdx = 0
    let rangeIdx = 0
    const docMock = {
      createTreeWalker: () => ({
        nextNode: () => (currIdx < nodes.length ? nodes[currIdx++] : null),
      }),
      createRange: () => ({
        selectNodeContents: () => {},
        getClientRects: () => rects[rangeIdx++],
      }),
    }

    const containerMock = {
      getBoundingClientRect: () => ({ top: 10, bottom: 60, height: 50, width: 300 }),
      ownerDocument: docMock,
    } as any

    // Target line 2:
    // Line 1 spans 10.0 to 34.5 (merged height: 24.5)
    // Line 2 spans 38.0 to 60.0 (height: 22)
    // Midline of line 2: 38 + 11 = 49.
    // Cut: 49 - 10 = 39px.
    const cut = calculateHalfLineCutHeight(containerMock, 2)
    assert.equal(cut, 39)
  })
})
