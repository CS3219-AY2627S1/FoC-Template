import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { decodeGraph, prepareMap, type WalkMap } from './domain/walking.ts'

// Built by dev/build-walk-map.ts and shipped in the image, so the service needs no network for it.
export const WALK_MAP_FILE = path.join(import.meta.dirname, '..', 'map', 'nus-walk.graph')

// Routes are an extra. Without the map the service still starts and serves suppliers, and every
// route is an estimate, which the answer says. The message is for the log.
export async function loadWalkMap(file = WALK_MAP_FILE): Promise<{ map: WalkMap | null; message: string }> {
  try {
    const [bytes, about] = await Promise.all([readFile(file), readFile(file.replace(/\.graph$/, '.json'), 'utf8')])
    const version = String((JSON.parse(about) as { version?: unknown }).version ?? 'unknown')
    const map = prepareMap(decodeGraph(bytes), version)
    return { map, message: `Walking map ${version} loaded: ${map.graph.latitude.length} points` }
  } catch (error) {
    return { map: null, message: `No walking map, so every route is an estimate: ${(error as Error).message}` }
  }
}
