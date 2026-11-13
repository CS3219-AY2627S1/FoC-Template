export type MapPoint = { latitude: number; longitude: number }
export type MapPin = MapPoint & { id: string; name: string }
export type AddressResult = MapPoint & { id: string; label: string }

/** Public, replaceable map providers. Never send Firebase tokens to these hosts. */
export const MAP_PROVIDER = {
  tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  search: "https://photon.komoot.io/api/",
  center: { latitude: 1.2966, longitude: 103.7764 },
}

export function coordinates(latitude: string, longitude: string): MapPoint | null {
  if (!latitude.trim() || !longitude.trim()) return null
  const point = { latitude: Number(latitude), longitude: Number(longitude) }
  return validPoint(point) ? point : null
}

export function validPoint(point: MapPoint): boolean {
  return Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null
}

export function photonAddresses(payload: unknown): AddressResult[] {
  const features = object(payload)?.features
  if (!Array.isArray(features)) throw new Error("Address search returned an invalid response.")
  const results: AddressResult[] = []
  const seen = new Set<string>()
  for (const value of features) {
    const feature = object(value)
    const geometry = object(feature?.geometry)
    const location = geometry?.coordinates
    if (geometry?.type !== "Point" || !Array.isArray(location)) continue
    const point = { longitude: location[0], latitude: location[1] }
    if (typeof point.latitude !== "number" || typeof point.longitude !== "number" || !validPoint(point)) continue
    const properties = object(feature?.properties)
    const parts = ["name", "housenumber", "street", "district", "city", "postcode", "country"]
      .map((field) => properties?.[field]).filter((part): part is string => typeof part === "string" && !!part.trim())
    const label = [...new Set(parts)].join(", ")
    const id = label + ":" + point.latitude + ":" + point.longitude
    if (!label || seen.has(id)) continue
    seen.add(id)
    results.push({ ...point, label, id })
    if (results.length === 5) break
  }
  return results
}

export async function searchAddresses(query: string, signal: AbortSignal): Promise<AddressResult[]> {
  if (query.trim().length < 3) return []
  const params = new URLSearchParams({ q: query.trim().slice(0, 200), limit: "5", lang: "en",
    lat: String(MAP_PROVIDER.center.latitude), lon: String(MAP_PROVIDER.center.longitude) })
  const controller = new AbortController()
  const cancel = () => controller.abort()
  if (signal.aborted) cancel()
  signal.addEventListener("abort", cancel, { once: true })
  const timer = window.setTimeout(cancel, 8000)
  try {
    const response = await fetch(MAP_PROVIDER.search + "?" + params, {
      signal: controller.signal, credentials: "omit", headers: { Accept: "application/json" },
    })
    if (!response.ok) throw new Error("Address search is unavailable. Try again or enter coordinates manually.")
    return photonAddresses(await response.json())
  } finally {
    window.clearTimeout(timer)
    signal.removeEventListener("abort", cancel)
  }
}
