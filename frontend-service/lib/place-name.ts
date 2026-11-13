/**
 * Names a map pin with OpenStreetMap's Nominatim reverse geocoder. Its usage
 * policy asks for an identifying User-Agent, at most one request per second
 * and cached results, so lookups run here on the server rather than in the
 * browser.
 */

import 'server-only';

import { isOnCampus, type LatLng } from '@/lib/drop-off';
import { MAX_DELIVERY_LABEL_LENGTH } from '@/lib/orders';

const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ?? 'FoC-CS3219/1.0 (NUS course project)';
const TIMEOUT_MS = 3000;
const MIN_INTERVAL_MS = 1000;
const MAX_CACHED = 1000;

/** Names by pin rounded to ~10 m; null when OSM has no name there. */
const cache = new Map<string, string | null>();
/** Earliest time the next request may start. */
let nextSlot = 0;

function cacheKey({ latitude, longitude }: LatLng) {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

function remember(key: string, name: string | null) {
  // Maps keep insertion order, so the first key is the oldest.
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
  cache.set(key, name);
}

/** The place name in a Nominatim `jsonv2` reverse result, if it has one. */
export function placeNameOf(result: unknown) {
  const { name } = (result ?? {}) as { name?: unknown };
  if (typeof name !== 'string' || !name.trim()) return null;
  return name.trim().slice(0, MAX_DELIVERY_LABEL_LENGTH);
}

/**
 * The name OSM gives the place at `position`, or null when it has none, the
 * pin is off campus, or the lookup fails. Callers fall back to `labelFor`.
 */
export async function placeNameAt(position: LatLng): Promise<string | null> {
  if (!isOnCampus(position)) return null;
  const key = cacheKey(position);
  if (cache.has(key)) return cache.get(key)!;

  // Queue behind earlier lookups, but give up rather than keep the user
  // waiting longer than a lookup could take.
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  if (wait > TIMEOUT_MS) return null;
  nextSlot = now + wait + MIN_INTERVAL_MS;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));

  const url = new URL(REVERSE_URL);
  url.search = new URLSearchParams({
    format: 'jsonv2',
    lat: String(position.latitude),
    lon: String(position.longitude),
    zoom: '18',
    'accept-language': 'en',
  }).toString();

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const name = placeNameOf(await response.json());
    remember(key, name);
    return name;
  } catch {
    // Network errors and timeouts are not cached, so a later pin retries.
    return null;
  }
}
