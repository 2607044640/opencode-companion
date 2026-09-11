export type Point = {
  readonly x: number
  readonly y: number
}

export type Segment = {
  readonly start: Point
  readonly end: Point
}

export type NodeHandleResolver = (
  nodeId: string,
  type: "source" | "target",
) => Point | undefined

export type EdgeWithEndpoints = {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly data?: { readonly kind?: string }
}

export function ccw(a: Point, b: Point, c: Point): number {
  return (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x)
}

export function onSegment(p: Point, q: Point, r: Point): boolean {
  return (
    q.x <= Math.max(p.x, r.x) &&
    q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) &&
    q.y >= Math.min(p.y, r.y)
  )
}

export function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  // Fast AABB bounding box check
  const b1MinX = Math.min(p1.x, p2.x)
  const b1MaxX = Math.max(p1.x, p2.x)
  const b1MinY = Math.min(p1.y, p2.y)
  const b1MaxY = Math.max(p1.y, p2.y)

  const b2MinX = Math.min(p3.x, p4.x)
  const b2MaxX = Math.max(p3.x, p4.x)
  const b2MinY = Math.min(p3.y, p4.y)
  const b2MaxY = Math.max(p3.y, p4.y)

  if (b1MaxX < b2MinX || b1MinX > b2MaxX || b1MaxY < b2MinY || b1MinY > b2MaxY) {
    return false
  }

  const d1 = ccw(p3, p4, p1)
  const d2 = ccw(p3, p4, p2)
  const d3 = ccw(p1, p2, p3)
  const d4 = ccw(p1, p2, p4)

  // General case: segments straddle each other
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true
  }

  // Collinear or endpoint touching cases
  const EPSILON = 1e-9
  if (Math.abs(d1) <= EPSILON && onSegment(p3, p1, p4)) return true
  if (Math.abs(d2) <= EPSILON && onSegment(p3, p2, p4)) return true
  if (Math.abs(d3) <= EPSILON && onSegment(p1, p3, p2)) return true
  if (Math.abs(d4) <= EPSILON && onSegment(p1, p4, p2)) return true

  return false
}

export function discretizeBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  segments = 16,
): Point[] {
  const points: Point[] = []
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    const u = 1 - t
    const u2 = u * u
    const u3 = u2 * u
    const t2 = t * t
    const t3 = t2 * t

    const x = u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x
    const y = u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y
    points.push({ x, y })
  }
  return points
}

export function calculateControlOffset(distance: number, curvature = 0.25): number {
  if (distance >= 0) {
    return 0.5 * distance
  }
  return curvature * 25 * Math.sqrt(-distance)
}

export function getBezierCurvePoints(
  source: Point,
  target: Point,
  segments = 16,
): Point[] {
  const offset = calculateControlOffset(target.x - source.x, 0.25)
  const p0 = source
  const p1 = { x: source.x + offset, y: source.y }
  const p2 = { x: target.x - offset, y: target.y }
  const p3 = target
  return discretizeBezier(p0, p1, p2, p3, segments)
}

export function curveIntersectsSegment(
  curvePoints: readonly Point[],
  segment: Segment,
): boolean {
  if (curvePoints.length < 2) {
    return false
  }

  // Curve AABB check
  let curveMinX = Infinity
  let curveMaxX = -Infinity
  let curveMinY = Infinity
  let curveMaxY = -Infinity

  for (const pt of curvePoints) {
    if (pt.x < curveMinX) curveMinX = pt.x
    if (pt.x > curveMaxX) curveMaxX = pt.x
    if (pt.y < curveMinY) curveMinY = pt.y
    if (pt.y > curveMaxY) curveMaxY = pt.y
  }

  const segMinX = Math.min(segment.start.x, segment.end.x)
  const segMaxX = Math.max(segment.start.x, segment.end.x)
  const segMinY = Math.min(segment.start.y, segment.end.y)
  const segMaxY = Math.max(segment.start.y, segment.end.y)

  if (
    curveMaxX < segMinX ||
    curveMinX > segMaxX ||
    curveMaxY < segMinY ||
    curveMinY > segMaxY
  ) {
    return false
  }

  for (let i = 0; i < curvePoints.length - 1; i += 1) {
    const p1 = curvePoints[i]
    const p2 = curvePoints[i + 1]
    if (segmentsIntersect(p1, p2, segment.start, segment.end)) {
      return true
    }
  }

  return false
}

export function findIntersectedEdges(input: {
  readonly cutter: Segment
  readonly edges: readonly EdgeWithEndpoints[]
  readonly resolveHandlePoint: NodeHandleResolver
  readonly skipNative?: boolean
}): string[] {
  const intersected: string[] = []

  for (const edge of input.edges) {
    if (input.skipNative && edge.data?.kind === "native") {
      continue
    }

    const sourcePoint = input.resolveHandlePoint(edge.source, "source")
    const targetPoint = input.resolveHandlePoint(edge.target, "target")

    if (sourcePoint === undefined || targetPoint === undefined) {
      continue
    }

    const curvePoints = getBezierCurvePoints(sourcePoint, targetPoint, 16)
    if (curveIntersectsSegment(curvePoints, input.cutter)) {
      intersected.push(edge.id)
    }
  }

  return intersected
}

export function createNodeHandleResolver(
  nodes: readonly {
    readonly id: string
    readonly position: Point
    readonly width?: number
    readonly height?: number
    readonly measured?: { readonly width?: number; readonly height?: number }
  }[],
  defaultWidth = 240,
  defaultHeight = 120,
): NodeHandleResolver {
  const map = new Map<string, (typeof nodes)[number]>()
  for (const node of nodes) {
    map.set(node.id, node)
  }

  return (nodeId: string, type: "source" | "target") => {
    const node = map.get(nodeId)
    if (!node) return undefined
    const width = node.measured?.width ?? node.width ?? defaultWidth
    const height = node.measured?.height ?? node.height ?? defaultHeight
    if (type === "source") {
      return { x: node.position.x + width, y: node.position.y + height / 2 }
    } else {
      return { x: node.position.x, y: node.position.y + height / 2 }
    }
  }
}

