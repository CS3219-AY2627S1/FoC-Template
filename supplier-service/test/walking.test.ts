import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DETOUR,
  WALK_SPEED,
  decodeGraph,
  encodeGraph,
  metresBetween,
  parseRouteRequest,
  prepareMap,
  snap,
  walkingRoute,
  type WalkGraph,
} from '../src/domain/walking.ts'
import { loadWalkMap } from '../src/map.ts'

// A 3 x 3 grid of points about 111 m apart. The link between the two top-left points is missing,
// so the walk between them has to go around: down, across and up.
//   (0,0)   (0,1) - (0,2)
//     |       |       |
//   (1,0) - (1,1) - (1,2)
//     |       |       |
//   (2,0) - (2,1) - (2,2)
const STEP = 0.001
const at = (row: number, col: number) => ({ latitude: 1.3 + row * STEP, longitude: 103.8 + col * STEP })

function gridGraph(): WalkGraph {
  const id = (row: number, col: number) => row * 3 + col
  const links: [number, number][] = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (c < 2 && !(r === 0 && c === 0)) links.push([id(r, c), id(r, c + 1)])
      if (r < 2) links.push([id(r, c), id(r + 1, c)])
    }
  }
  const latitude = Float64Array.from({ length: 9 }, (_, i) => at(Math.floor(i / 3), i % 3).latitude)
  const longitude = Float64Array.from({ length: 9 }, (_, i) => at(Math.floor(i / 3), i % 3).longitude)
  const neighbours: number[][] = Array.from({ length: 9 }, () => [])
  for (const [a, b] of links) neighbours[a]!.push(b), neighbours[b]!.push(a)
  const offset = new Int32Array(10)
  for (let i = 0; i < 9; i++) offset[i + 1] = offset[i]! + neighbours[i]!.length
  const target = Int32Array.from(neighbours.flat())
  const metres = Float32Array.from(
    neighbours.flatMap((list, a) => list.map((b) => metresBetween(latitude[a]!, longitude[a]!, latitude[b]!, longitude[b]!))),
  )
  return { latitude, longitude, offset, target, metres }
}

const map = prepareMap(gridGraph(), 'test-map')
const step = metresBetween(at(0, 0).latitude, at(0, 0).longitude, at(0, 1).latitude, at(0, 1).longitude)

describe('walking routes', () => {
  it('walks around a missing link, and says which map it used', () => {
    const route = walkingRoute(map, at(0, 0), at(0, 1))
    assert.equal(route.estimated, false)
    assert.equal(route.mapVersion, 'test-map')
    assert.ok(Math.abs(route.metres - 3 * step) <= 2, `${route.metres} m, expected about ${3 * step}`)
    assert.equal(route.seconds, Math.round(route.metres / WALK_SPEED))
  })

  it('takes the straight path where there is one', () => {
    assert.ok(Math.abs(walkingRoute(map, at(2, 0), at(2, 2)).metres - 2 * step) <= 2)
  })

  it('adds the short walk from each point to the nearest path', () => {
    const offPath = { latitude: at(2, 0).latitude - 0.0002, longitude: at(2, 0).longitude }
    const route = walkingRoute(map, offPath, at(2, 1))
    assert.ok(Math.abs(route.metres - (step + 22)) <= 2, `${route.metres} m`)
  })

  it('gives the same answer the second time, so one search leaves nothing behind for the next', () => {
    const first = walkingRoute(map, at(0, 0), at(2, 2))
    walkingRoute(map, at(1, 1), at(0, 2))
    assert.deepEqual(walkingRoute(map, at(0, 0), at(2, 2)), first)
  })

  it('estimates a walk to a point off the map, and every walk without a map', () => {
    const far = { latitude: 1.36, longitude: 103.99 }
    const straight = metresBetween(at(0, 0).latitude, at(0, 0).longitude, far.latitude, far.longitude)
    const route = walkingRoute(map, at(0, 0), far)
    assert.deepEqual(route, {
      metres: Math.round(straight * DETOUR),
      seconds: Math.round(Math.round(straight * DETOUR) / WALK_SPEED),
      estimated: true,
      mapVersion: null,
    })
    assert.equal(walkingRoute(null, at(0, 0), at(0, 1)).estimated, true)
  })

  it('finds the nearest point only within 150 m', () => {
    assert.equal(snap(map, { latitude: at(0, 0).latitude - 0.001, longitude: at(0, 0).longitude })?.node, 0)
    assert.equal(snap(map, { latitude: at(0, 0).latitude - 0.002, longitude: at(0, 0).longitude }), null)
  })
})

describe('the walking map file', () => {
  it('reads back exactly what was written', () => {
    const graph = gridGraph()
    const back = decodeGraph(encodeGraph(graph))
    for (const key of ['latitude', 'longitude', 'offset', 'target', 'metres'] as const) {
      assert.deepEqual([...back[key]], [...graph[key]], key)
    }
  })

  it('refuses a file that is not a walking map, or is cut short', () => {
    const bytes = encodeGraph(gridGraph())
    assert.throws(() => decodeGraph(Buffer.from('not a map at all')), /not a walking map/)
    assert.throws(() => decodeGraph(bytes.subarray(0, bytes.length - 4)), /wrong size/)
  })

  it('loads the committed map of the NUS area, where known walks keep their length', async () => {
    const { map: nus } = await loadWalkMap()
    assert.ok(nus, 'map/nus-walk.graph must load')
    // What these walks measured when the map was built, give or take 10% for a later map.
    const checks: [[number, number], [number, number], number][] = [
      [[1.2967866, 103.7732677], [1.2908, 103.7809], 1424],
      [[1.2991517, 103.769064], [1.2904347, 103.7787588], 1983],
    ]
    for (const [[fromLat, fromLng], [toLat, toLng], expected] of checks) {
      const route = walkingRoute(nus, { latitude: fromLat, longitude: fromLng }, { latitude: toLat, longitude: toLng })
      assert.equal(route.estimated, false)
      assert.ok(Math.abs(route.metres - expected) <= expected * 0.1, `${route.metres} m, expected about ${expected}`)
    }
  })

  it('reports a missing map instead of failing', async () => {
    const result = await loadWalkMap('/no/such/folder/nus-walk.graph')
    assert.equal(result.map, null)
    assert.match(result.message, /every route is an estimate/)
  })
})

describe('the route request', () => {
  it('takes a point to walk to', () => {
    assert.deepEqual(parseRouteRequest({ to: { latitude: 1.29, longitude: 103.78 } }), {
      value: { latitude: 1.29, longitude: 103.78 },
    })
  })

  it('names every field it refuses', () => {
    const result = parseRouteRequest({ to: { latitude: 95, longitude: '103' }, from: 'x' })
    assert.ok('errors' in result)
    assert.deepEqual(result.errors.map((e) => e.field).sort(), ['from', 'to.latitude', 'to.longitude'])
    assert.deepEqual(parseRouteRequest({}), { errors: [{ field: 'to', message: 'must be an object with latitude and longitude' }] })
  })
})
