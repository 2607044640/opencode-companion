import test from "node:test"
import assert from "node:assert/strict"
import {
  segmentsIntersect,
  discretizeBezier,
  calculateControlOffset,
  getBezierCurvePoints,
  curveIntersectsSegment,
  findIntersectedEdges,
  createNodeHandleResolver,
} from "./cutting-wire"

test("segmentsIntersect tests", async (t) => {
  await t.test("detects standard perpendicular intersection", () => {
    const p1 = { x: 0, y: 5 }
    const p2 = { x: 10, y: 5 }
    const p3 = { x: 5, y: 0 }
    const p4 = { x: 5, y: 10 }
    assert.equal(segmentsIntersect(p1, p2, p3, p4), true)
  })

  await t.test("detects diagonal intersection", () => {
    const p1 = { x: 0, y: 0 }
    const p2 = { x: 10, y: 10 }
    const p3 = { x: 0, y: 10 }
    const p4 = { x: 10, y: 0 }
    assert.equal(segmentsIntersect(p1, p2, p3, p4), true)
  })

  await t.test("returns false for parallel non-intersecting segments", () => {
    const p1 = { x: 0, y: 0 }
    const p2 = { x: 10, y: 0 }
    const p3 = { x: 0, y: 5 }
    const p4 = { x: 10, y: 5 }
    assert.equal(segmentsIntersect(p1, p2, p3, p4), false)
  })

  await t.test("returns false for near-miss segments", () => {
    const p1 = { x: 0, y: 0 }
    const p2 = { x: 10, y: 0 }
    const p3 = { x: 5, y: 0.05 }
    const p4 = { x: 5, y: 10 }
    assert.equal(segmentsIntersect(p1, p2, p3, p4), false)
  })

  await t.test("detects T-junction where endpoint touches line segment", () => {
    const p1 = { x: 0, y: 0 }
    const p2 = { x: 10, y: 0 }
    const p3 = { x: 5, y: 0 }
    const p4 = { x: 5, y: 10 }
    assert.equal(segmentsIntersect(p1, p2, p3, p4), true)
  })

  await t.test("detects collinear overlapping segments", () => {
    const p1 = { x: 0, y: 0 }
    const p2 = { x: 10, y: 0 }
    const p3 = { x: 5, y: 0 }
    const p4 = { x: 15, y: 0 }
    assert.equal(segmentsIntersect(p1, p2, p3, p4), true)
  })

  await t.test("returns false for disjoint collinear segments", () => {
    const p1 = { x: 0, y: 0 }
    const p2 = { x: 4, y: 0 }
    const p3 = { x: 6, y: 0 }
    const p4 = { x: 10, y: 0 }
    assert.equal(segmentsIntersect(p1, p2, p3, p4), false)
  })
})

test("discretizeBezier and getBezierCurvePoints", async (t) => {
  await t.test("generates expected number of points with accurate endpoints", () => {
    const source = { x: 100, y: 200 }
    const target = { x: 400, y: 300 }
    const points = getBezierCurvePoints(source, target, 16)
    assert.equal(points.length, 17)
    assert.equal(points[0].x, 100)
    assert.equal(points[0].y, 200)
    assert.equal(points[16].x, 400)
    assert.equal(points[16].y, 300)

    const rawPoints = discretizeBezier(source, { x: 200, y: 200 }, { x: 300, y: 300 }, target, 16)
    assert.equal(rawPoints.length, 17)
  })

  await t.test("calculateControlOffset computes linear forward and sqrt backward offsets", () => {
    assert.equal(calculateControlOffset(200, 0.25), 100)
    assert.equal(calculateControlOffset(0, 0.25), 0)
    // -100 distance -> 0.25 * 25 * Math.sqrt(100) = 62.5
    assert.equal(calculateControlOffset(-100, 0.25), 62.5)
  })

  await t.test("handles backward edge where target is to the left of source", () => {
    const source = { x: 300, y: 100 }
    const target = { x: 100, y: 100 }
    const points = getBezierCurvePoints(source, target, 16)
    assert.equal(points.length, 17)
    assert.equal(points[0].x, 300)
    assert.equal(points[16].x, 100)
  })
})

test("curveIntersectsSegment", async (t) => {
  await t.test("returns true when laser cuts through middle of bezier curve", () => {
    const source = { x: 100, y: 100 }
    const target = { x: 300, y: 100 }
    const curvePoints = getBezierCurvePoints(source, target, 16)
    const cutter = { start: { x: 200, y: 50 }, end: { x: 200, y: 150 } }
    assert.equal(curveIntersectsSegment(curvePoints, cutter), true)
  })

  await t.test("returns false when cutter is completely outside curve bounding box", () => {
    const source = { x: 100, y: 100 }
    const target = { x: 300, y: 100 }
    const curvePoints = getBezierCurvePoints(source, target, 16)
    const cutter = { start: { x: 500, y: 50 }, end: { x: 500, y: 150 } }
    assert.equal(curveIntersectsSegment(curvePoints, cutter), false)
  })

  await t.test("returns false when cutter passes nearby but does not cross", () => {
    const source = { x: 100, y: 100 }
    const target = { x: 300, y: 100 }
    const curvePoints = getBezierCurvePoints(source, target, 16)
    const cutter = { start: { x: 200, y: 120 }, end: { x: 200, y: 200 } }
    assert.equal(curveIntersectsSegment(curvePoints, cutter), false)
  })
})

test("findIntersectedEdges", async (t) => {
  const nodeHandles: Record<string, { source: { x: number; y: number }; target: { x: number; y: number } }> = {
    nodeA: { source: { x: 200, y: 100 }, target: { x: 50, y: 100 } },
    nodeB: { source: { x: 500, y: 100 }, target: { x: 350, y: 100 } },
    nodeC: { source: { x: 500, y: 300 }, target: { x: 350, y: 300 } },
  }

  const resolveHandlePoint = (nodeId: string, type: "source" | "target") => {
    return nodeHandles[nodeId]?.[type]
  }

  const edges = [
    { id: "e1", source: "nodeA", target: "nodeB", data: { kind: "link" } },
    { id: "e2", source: "nodeA", target: "nodeC", data: { kind: "inject" } },
    { id: "e3", source: "nodeA", target: "nodeB", data: { kind: "native" } },
  ]

  await t.test("finds intersected edges and skips native edges when skipNative is true", () => {
    // Cutter crosses line from (200, 100) to (350, 100) at x=275
    const cutter = { start: { x: 275, y: 50 }, end: { x: 275, y: 150 } }
    const intersected = findIntersectedEdges({
      cutter,
      edges,
      resolveHandlePoint,
      skipNative: true,
    })

    assert.deepEqual(intersected, ["e1"])
  })

  await t.test("includes native edges when skipNative is false", () => {
    const cutter = { start: { x: 275, y: 50 }, end: { x: 275, y: 150 } }
    const intersected = findIntersectedEdges({
      cutter,
      edges,
      resolveHandlePoint,
      skipNative: false,
    })

    assert.deepEqual(intersected, ["e1", "e3"])
  })

  await t.test("returns empty array when cutter hits nothing", () => {
    const cutter = { start: { x: 10, y: 10 }, end: { x: 20, y: 20 } }
    const intersected = findIntersectedEdges({
      cutter,
      edges,
      resolveHandlePoint,
      skipNative: true,
    })

    assert.deepEqual(intersected, [])
  })

  await t.test("createNodeHandleResolver computes handle positions correctly", () => {
    const nodes = [
      { id: "node1", position: { x: 100, y: 100 }, width: 200, height: 100 },
      { id: "node2", position: { x: 400, y: 200 }, measured: { width: 300, height: 150 } },
    ]
    const resolver = createNodeHandleResolver(nodes)
    assert.deepEqual(resolver("node1", "source"), { x: 300, y: 150 })
    assert.deepEqual(resolver("node1", "target"), { x: 100, y: 150 })
    assert.deepEqual(resolver("node2", "source"), { x: 700, y: 275 })
    assert.deepEqual(resolver("node2", "target"), { x: 400, y: 275 })
    assert.equal(resolver("node_nonexistent", "source"), undefined)
  })

  await t.test("finds intersected edges for backward looping edge", () => {
    // nodeB is at x=500, nodeA is at x=50. Backward edge from nodeB to nodeA
    const backwardEdge = [
      { id: "e_back", source: "nodeB", target: "nodeA", data: { kind: "link" } },
    ]
    // nodeB source handle is at x=500, y=100. nodeA target handle is at x=50, y=100.
    // The curve loops backwards between 500 and 50. Cutter slices at x=250, y from 0 to 200.
    const cutter = { start: { x: 250, y: 0 }, end: { x: 250, y: 200 } }
    const intersected = findIntersectedEdges({
      cutter,
      edges: backwardEdge,
      resolveHandlePoint,
      skipNative: true,
    })
    assert.deepEqual(intersected, ["e_back"])
  })
})

