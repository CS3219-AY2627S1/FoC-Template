import type { FieldError, Validated } from './validation.ts'

// Walking routes on a graph of the paths around NUS, built from OpenStreetMap data by
// dev/build-walk-map.ts. Nothing outside the service is asked at runtime.

export interface Point {
  latitude: number
  longitude: number
}

// Compressed adjacency: the links of point i are target[offset[i]] up to target[offset[i + 1] - 1],
// each metres[k] long. Every path can be walked both ways, so each link is stored in both directions.
export interface WalkGraph {
  latitude: Float64Array
  longitude: Float64Array
  offset: Int32Array
  target: Int32Array
  metres: Float32Array
}

export interface WalkRoute {
  metres: number
  seconds: number
  // True when the route could not be walked on the map, so it is the straight line times DETOUR.
  estimated: boolean
  // The map the route was walked on; null for an estimate.
  mapVersion: string | null
}

// The speed the pgRouting workshop uses for walking, about 4.7 km/h.
export const WALK_SPEED = 1.3
// A point further than this from every mapped path point is not on the map.
const MAX_SNAP_METRES = 150
// A rough guess at how much longer a walk is than the straight line, for when the map cannot help.
export const DETOUR = 1.3

const EARTH_RADIUS = 6371008.8
const RAD = Math.PI / 180

export function metresBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const a =
    Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lng2 - lng1) * RAD) / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a))
}

// ---- The file format: a header, then the arrays, in the machine's byte order (little-endian on
// every server we use). The header comes first so that a wrong or cut-off file is refused.

const MAGIC = 0x31475752 // "RWG1"
const HEADER_BYTES = 16

export function encodeGraph(graph: WalkGraph): Buffer {
  const n = graph.latitude.length
  const header = new Int32Array([MAGIC, 1, n, graph.target.length])
  return Buffer.concat(
    [header, graph.latitude, graph.longitude, graph.offset, graph.target, graph.metres].map((a) =>
      Buffer.from(a.buffer, a.byteOffset, a.byteLength),
    ),
  )
}

export function decodeGraph(bytes: Uint8Array): WalkGraph {
  // A copy, so that the Float64Array views start on an 8-byte boundary.
  const buffer = new Uint8Array(bytes).buffer
  if (buffer.byteLength < HEADER_BYTES) throw new Error('the walking map is too short')
  const [magic, format, n, m] = new Int32Array(buffer, 0, 4) as unknown as [number, number, number, number]
  if (magic !== MAGIC || format !== 1) throw new Error('this is not a walking map in format 1')
  if (buffer.byteLength !== HEADER_BYTES + n * 16 + (n + 1) * 4 + m * 8) throw new Error('the walking map has the wrong size')

  let at = HEADER_BYTES
  const take = <T>(make: (start: number) => T, bytesTaken: number): T => {
    const array = make(at)
    at += bytesTaken
    return array
  }
  const graph: WalkGraph = {
    latitude: take((s) => new Float64Array(buffer, s, n), n * 8),
    longitude: take((s) => new Float64Array(buffer, s, n), n * 8),
    offset: take((s) => new Int32Array(buffer, s, n + 1), (n + 1) * 4),
    target: take((s) => new Int32Array(buffer, s, m), m * 4),
    metres: take((s) => new Float32Array(buffer, s, m), m * 4),
  }
  if (graph.offset[0] !== 0 || graph.offset[n] !== m) throw new Error('the walking map has broken links')
  for (let i = 0; i < n; i++) if (graph.offset[i]! > graph.offset[i + 1]!) throw new Error('the walking map has broken links')
  for (let k = 0; k < m; k++) if (graph.target[k]! < 0 || graph.target[k]! >= n) throw new Error('the walking map has broken links')
  return graph
}

// ---- A map ready for routing: the graph, a grid to find the nearest point quickly, and one set of
// search buffers. Routing runs to the end without waiting, so requests never share them at once.

const CELL = 0.001 // degrees, about 110 m

const cellKey = (row: number, col: number) => row * 1_000_000 + col

export interface WalkMap {
  graph: WalkGraph
  version: string
  cells: Map<number, Int32Array>
  distance: Float64Array
  reached: number[]
}

export function prepareMap(graph: WalkGraph, version: string): WalkMap {
  const n = graph.latitude.length
  const keys = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    keys[i] = cellKey(Math.floor(graph.latitude[i]! / CELL), Math.floor(graph.longitude[i]! / CELL))
  }
  const order = Int32Array.from({ length: n }, (_, i) => i).sort((a, b) => keys[a]! - keys[b]!)
  const cells = new Map<number, Int32Array>()
  for (let start = 0; start < n; ) {
    let end = start
    while (end < n && keys[order[end]!] === keys[order[start]!]) end++
    cells.set(keys[order[start]!]!, order.subarray(start, end))
    start = end
  }
  return { graph, version, cells, distance: new Float64Array(n).fill(Infinity), reached: [] }
}

// The mapped point nearest to `point`, if one is within MAX_SNAP_METRES.
export function snap(map: WalkMap, point: Point): { node: number; metres: number } | null {
  const { latitude, longitude } = map.graph
  const row = Math.floor(point.latitude / CELL)
  const col = Math.floor(point.longitude / CELL)
  let node = -1
  let best = Infinity
  // Two cells in every direction cover more than MAX_SNAP_METRES.
  for (let r = row - 2; r <= row + 2; r++) {
    for (let c = col - 2; c <= col + 2; c++) {
      for (const i of map.cells.get(cellKey(r, c)) ?? []) {
        const d = metresBetween(point.latitude, point.longitude, latitude[i]!, longitude[i]!)
        if (d < best) {
          best = d
          node = i
        }
      }
    }
  }
  return node >= 0 && best <= MAX_SNAP_METRES ? { node, metres: best } : null
}

// A*: Dijkstra's search, led towards the goal by the straight-line distance. The straight line is
// never longer than a path, so the first time the goal is taken off the queue its path is the shortest.
export function shortestMetres(map: WalkMap, from: number, to: number): number | null {
  const { latitude, longitude, offset, target, metres } = map.graph
  const { distance, reached } = map
  for (const i of reached) distance[i] = Infinity
  reached.length = 0

  const towards = (i: number) => metresBetween(latitude[i]!, longitude[i]!, latitude[to]!, longitude[to]!)
  const priority: number[] = []
  const queue: number[] = []
  const push = (p: number, node: number) => {
    let i = priority.length
    priority.push(p)
    queue.push(node)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (priority[parent]! <= p) break
      priority[i] = priority[parent]!
      queue[i] = queue[parent]!
      i = parent
    }
    priority[i] = p
    queue[i] = node
  }
  const pop = () => {
    const top = queue[0]!
    const lastP = priority.pop()!
    const lastNode = queue.pop()!
    if (priority.length > 0) {
      let i = 0
      for (;;) {
        let child = 2 * i + 1
        if (child >= priority.length) break
        if (child + 1 < priority.length && priority[child + 1]! < priority[child]!) child++
        if (priority[child]! >= lastP) break
        priority[i] = priority[child]!
        queue[i] = queue[child]!
        i = child
      }
      priority[i] = lastP
      queue[i] = lastNode
    }
    return top
  }

  distance[from] = 0
  reached.push(from)
  push(towards(from), from)
  while (queue.length > 0) {
    const u = pop()
    if (u === to) return distance[to]!
    const du = distance[u]!
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      const v = target[k]!
      const dv = du + metres[k]!
      if (dv < distance[v]!) {
        if (distance[v] === Infinity) reached.push(v)
        distance[v] = dv
        push(dv + towards(v), v)
      }
    }
  }
  return null
}

const estimate = (from: Point, to: Point): WalkRoute => {
  const metres = Math.round(metresBetween(from.latitude, from.longitude, to.latitude, to.longitude) * DETOUR)
  return { metres, seconds: Math.round(metres / WALK_SPEED), estimated: true, mapVersion: null }
}

// The walk from one point to another. Without a map, or for a point off the map, it is an estimate,
// so a caller always gets an answer.
export function walkingRoute(map: WalkMap | null, from: Point, to: Point): WalkRoute {
  if (!map) return estimate(from, to)
  const start = snap(map, from)
  const goal = snap(map, to)
  if (!start || !goal) return estimate(from, to)
  const along = shortestMetres(map, start.node, goal.node)
  if (along === null) return estimate(from, to)
  // Plus the short straight walks from each point to the path.
  const metres = Math.round(along + start.metres + goal.metres)
  return { metres, seconds: Math.round(metres / WALK_SPEED), estimated: false, mapVersion: map.version }
}

// The body of POST /suppliers/{id}/route: { "to": { "latitude": 1.29, "longitude": 103.78 } }.
export function parseRouteRequest(body: unknown): Validated<Point> {
  const to = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>).to : undefined
  if (typeof to !== 'object' || to === null || Array.isArray(to)) {
    return { errors: [{ field: 'to', message: 'must be an object with latitude and longitude' }] }
  }
  const errors: FieldError[] = []
  for (const key of Object.keys(body as object)) if (key !== 'to') errors.push({ field: key, message: 'is not a known field' })
  const { latitude, longitude } = to as Record<string, unknown>
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90) {
    errors.push({ field: 'to.latitude', message: 'must be a number from -90 to 90' })
  }
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    errors.push({ field: 'to.longitude', message: 'must be a number from -180 to 180' })
  }
  return errors.length > 0 ? { errors } : { value: { latitude: latitude as number, longitude: longitude as number } }
}
