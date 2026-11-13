// Builds map/nus-walk.graph, the walking map the service routes on, from OpenStreetMap data for
// about 6 x 6 km around NUS. Run it by hand, about once a semester, check the routes it prints,
// and commit both files in map/. The service itself never downloads anything.
//
//   node dev/build-walk-map.ts                    downloads the area from the Overpass API
//   node dev/build-walk-map.ts --input area.json  uses an Overpass download you already have
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import { encodeGraph, metresBetween, prepareMap, walkingRoute, type WalkGraph } from '../src/domain/walking.ts'

// South, west, north, east: campus, Prince George's Park, Clementi, Dover, one-north, West Coast.
const AREA = [1.2696, 103.7494, 1.3236, 103.8034] as const
const OUT = path.join(import.meta.dirname, '..', 'map')
const OVERPASS = 'https://overpass-api.de/api/interpreter'

// Ways nobody may walk on. Everything else with a highway tag counts, from footways and stairs to
// roads with a pavement, unless it says foot=no or is private without foot access.
const NOT_WALKABLE = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'construction', 'proposed', 'raceway', 'bus_guideway'])

interface OsmElement {
  type: 'node' | 'way'
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  tags?: Record<string, string>
}
interface OsmData {
  osm3s?: { timestamp_osm_base?: string }
  elements: OsmElement[]
}

function walkable(tags: Record<string, string>): boolean {
  if (!tags.highway || NOT_WALKABLE.has(tags.highway) || tags.foot === 'no') return false
  const footAllowed = tags.foot === 'yes' || tags.foot === 'designated' || tags.foot === 'permissive'
  return footAllowed || (tags.access !== 'private' && tags.access !== 'no')
}

// The Overpass servers are often busy. Its usage policy asks for waits that double, and the
// User-Agent says who is asking.
async function download(): Promise<OsmData> {
  const query = `[out:json][timeout:240];way["highway"](${AREA.join(',')});out body;>;out skel qt;`
  for (const seconds of [0, 30, 60, 120, 240]) {
    if (seconds) {
      console.log(`Overpass is busy; trying again in ${seconds} s`)
      await wait(seconds * 1000)
    }
    const response = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': 'Relay supplier-service walking map build (CS3219 student project)' },
      body: new URLSearchParams({ data: query }),
    }).catch(() => null)
    if (response?.ok && response.headers.get('content-type')?.includes('json')) return (await response.json()) as OsmData
  }
  throw new Error('Overpass did not answer. Try later, or pass --input with a download you made yourself.')
}

function build(data: OsmData): WalkGraph {
  const coordinates = new Map<number, [number, number]>()
  for (const e of data.elements) if (e.type === 'node') coordinates.set(e.id, [e.lat!, e.lon!])

  const index = new Map<number, number>()
  const lat: number[] = []
  const lng: number[] = []
  const links: number[] = []
  const indexOf = (osmId: number) => {
    let i = index.get(osmId)
    if (i === undefined) {
      i = lat.length
      index.set(osmId, i)
      const [a, b] = coordinates.get(osmId)!
      lat.push(a)
      lng.push(b)
    }
    return i
  }
  for (const way of data.elements) {
    if (way.type !== 'way' || !walkable(way.tags ?? {})) continue
    const nodes = (way.nodes ?? []).filter((id) => coordinates.has(id))
    for (let k = 0; k + 1 < nodes.length; k++) links.push(indexOf(nodes[k]!), indexOf(nodes[k + 1]!))
  }

  // Only the largest connected part. A path mapped on its own, such as a corridor inside one
  // building, would otherwise catch a point with no way out.
  const all = lat.length
  const neighbours: number[][] = Array.from({ length: all }, () => [])
  for (let k = 0; k < links.length; k += 2) {
    neighbours[links[k]!]!.push(links[k + 1]!)
    neighbours[links[k + 1]!]!.push(links[k]!)
  }
  const part = new Int32Array(all).fill(-1)
  let largest = -1
  let largestSize = 0
  for (let root = 0, label = 0; root < all; root++) {
    if (part[root] !== -1) continue
    part[root] = label
    const stack = [root]
    let size = 0
    while (stack.length > 0) {
      const u = stack.pop()!
      size++
      for (const v of neighbours[u]!) {
        if (part[v] === -1) {
          part[v] = label
          stack.push(v)
        }
      }
    }
    if (size > largestSize) {
      largestSize = size
      largest = label
    }
    label++
  }

  const kept = new Int32Array(all).fill(-1)
  let n = 0
  for (let i = 0; i < all; i++) if (part[i] === largest) kept[i] = n++
  const latitude = new Float64Array(n)
  const longitude = new Float64Array(n)
  for (let i = 0; i < all; i++) {
    if (kept[i]! >= 0) {
      latitude[kept[i]!] = lat[i]!
      longitude[kept[i]!] = lng[i]!
    }
  }
  const offset = new Int32Array(n + 1)
  for (let k = 0; k < links.length; k += 2) {
    const a = kept[links[k]!]!
    if (a < 0) continue
    offset[a + 1]!++
    offset[kept[links[k + 1]!]! + 1]!++
  }
  for (let i = 0; i < n; i++) offset[i + 1]! += offset[i]!
  const target = new Int32Array(offset[n]!)
  const metres = new Float32Array(offset[n]!)
  const next = offset.slice(0, n)
  for (let k = 0; k < links.length; k += 2) {
    const a = kept[links[k]!]!
    const b = kept[links[k + 1]!]!
    if (a < 0) continue
    const d = metresBetween(latitude[a]!, longitude[a]!, latitude[b]!, longitude[b]!)
    target[next[a]!] = b
    metres[next[a]!++] = d
    target[next[b]!] = a
    metres[next[b]!++] = d
  }
  console.log(`${all} walkable points, ${n} in the largest connected part, ${offset[n]} links`)
  return { latitude, longitude, offset, target, metres }
}

// Walks whose length people know, to compare with the last map before committing a new one.
const CHECKS: [string, [number, number], [number, number]][] = [
  ['NUS Co-op to Prince George\'s Park', [1.2967866, 103.7732677], [1.2908, 103.7809]],
  ['Arise and Shine (E4) to Octobox', [1.2991517, 103.769064], [1.2904347, 103.7787588]],
  ['Printer @ Com 2 to Central Square', [1.2938347, 103.7744572], [1.2984401, 103.7726256]],
  ['Central Library to Clementi MRT', [1.2967866, 103.7732677], [1.3151, 103.7652]],
]

const inputAt = process.argv.indexOf('--input')
const data: OsmData =
  inputAt > 0 ? (JSON.parse(await readFile(process.argv[inputAt + 1]!, 'utf8')) as OsmData) : await download()
const graph = build(data)
// The date of the OpenStreetMap data, so every route says which map it was walked on.
const version = (data.osm3s?.timestamp_osm_base ?? new Date().toISOString()).slice(0, 10)

await writeFile(path.join(OUT, 'nus-walk.graph'), encodeGraph(graph))
await writeFile(
  path.join(OUT, 'nus-walk.json'),
  `${JSON.stringify(
    {
      version,
      area: { south: AREA[0], west: AREA[1], north: AREA[2], east: AREA[3] },
      points: graph.latitude.length,
      links: graph.target.length,
      source: 'OpenStreetMap, through the Overpass API',
      licence: 'Open Database License (ODbL) 1.0',
      attribution: '© OpenStreetMap contributors',
    },
    null,
    2,
  )}\n`,
)

const map = prepareMap(graph, version)
for (const [name, from, to] of CHECKS) {
  const route = walkingRoute(map, { latitude: from[0], longitude: from[1] }, { latitude: to[0], longitude: to[1] })
  console.log(`${name}: ${route.metres} m, ${Math.ceil(route.seconds / 60)} min${route.estimated ? ' (estimate)' : ''}`)
}
console.log(`Wrote map/nus-walk.graph and map/nus-walk.json, version ${version}`)
