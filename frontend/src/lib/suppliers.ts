// Types and helpers for the Supplier Service API (/api/suppliers). See the service's OpenAPI
// docs at /api/suppliers/docs for the full contract.

export type Supplier = {
  id: string
  name: string
  type: string
  building: string
  floor: string | null
  locationDescription: string | null
  latitude: number
  longitude: number
  openingTime: string
  closingTime: string
  imageUrl: string | null
  active: boolean
  openNow: boolean
  distanceMeters?: number
  createdAt: string
  updatedAt: string
}

export type Page<T> = {
  items: T[]
  page: number
  size: number
  totalItems: number
  totalPages: number
  message?: string
}

export type SupplierLookupResponse = {
  items: Supplier[]
  missingIds: string[]
}

export type SupplierPermissions = {
  uid: string
  email: string | null
  roles: string[]
  canManageSuppliers: boolean
}

export type SupplierInput = {
  name: string
  type: string
  building: string
  floor: string
  locationDescription: string
  latitude: number
  longitude: number
  openingTime: string
  closingTime: string
  imageUrl: string
}

export const SORT_LABELS = {
  name: "Name",
  type: "Type",
  building: "Building",
  distance: "Distance",
  updatedAt: "Recently updated",
} as const
export type SortKey = keyof typeof SORT_LABELS

export const PAGE_SIZE = 12

export function supplierLookupPath(): string {
  return "/api/suppliers/lookup"
}

export function supplierLookupPayload(ids: readonly string[]): { ids: string[] } {
  return { ids: Array.from(new Set(ids.filter(Boolean))) }
}

/**
 * Catalogue view state, kept in the URL so searches are shareable and survive back/forward.
 * The catalogue lists active suppliers only; administrators see inactive ones in Admin Mode.
 */
export type SupplierQuery = {
  q: string
  type: string
  openNow: boolean
  sort: SortKey
  order: "asc" | "desc"
  page: number
  near: { lat: number; lng: number } | null
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export function queryFromParams(params: URLSearchParams): SupplierQuery {
  const lat = Number(params.get("lat"))
  const lng = Number(params.get("lng"))
  const near = params.has("lat") && params.has("lng") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  const sort = oneOf(params.get("sort"), Object.keys(SORT_LABELS) as SortKey[], near ? "distance" : "name")
  return {
    q: params.get("q") ?? "",
    type: params.get("type") ?? "",
    openNow: params.get("openNow") === "true",
    sort: sort === "distance" && !near ? "name" : sort,
    order: params.get("order") === "desc" ? "desc" : "asc",
    page: Math.max(1, Math.floor(Number(params.get("page")) || 1)),
    near,
  }
}

/** URL for the catalogue page; defaults are omitted to keep links short. */
export function paramsFromQuery(query: SupplierQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.q.trim()) params.set("q", query.q.trim())
  if (query.type) params.set("type", query.type)
  if (query.openNow) params.set("openNow", "true")
  if (query.near) {
    params.set("lat", query.near.lat.toFixed(6))
    params.set("lng", query.near.lng.toFixed(6))
  }
  const defaultSort = query.near ? "distance" : "name"
  if (query.sort !== defaultSort) params.set("sort", query.sort)
  if (query.order !== "asc") params.set("order", query.order)
  if (query.page > 1) params.set("page", String(query.page))
  return params
}

/** Supplier Service request for the current view. */
export function apiPathForQuery(query: SupplierQuery): string {
  const params = paramsFromQuery(query)
  params.set("size", String(PAGE_SIZE))
  if (query.near) params.set("sort", query.sort)
  return `/api/suppliers?${params.toString()}`
}

export function formatDistance(meters: number | undefined): string | null {
  if (meters === undefined) return null
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`
}

export function formatHours(supplier: Pick<Supplier, "openingTime" | "closingTime">): string {
  if (supplier.openingTime === "00:00" && supplier.closingTime === "23:59") return "Open 24 hours"
  return `${supplier.openingTime} – ${supplier.closingTime}`
}

export function formatLocation(supplier: Pick<Supplier, "building" | "floor">): string {
  return supplier.floor ? `${supplier.building}, level ${supplier.floor}` : supplier.building
}

/** Compact human-readable label for selecting a supplier while preserving its stable ID. */
export function supplierOptionLabel(supplier: Pick<Supplier, "name" | "building">): string {
  return supplier.building ? `${supplier.name} — ${supplier.building}` : supplier.name
}


export function mapsUrl(supplier: Pick<Supplier, "latitude" | "longitude">): string {
  return `https://www.google.com/maps/search/?api=1&query=${supplier.latitude},${supplier.longitude}`
}

/**
 * The fields an edit actually changed. Sending only these in the PATCH means two administrators
 * editing different fields of the same supplier don't overwrite each other's changes.
 */
export function changedFields(before: SupplierInput, after: SupplierInput): Partial<SupplierInput> {
  return Object.fromEntries(
    (Object.keys(after) as (keyof SupplierInput)[])
      .filter((key) => after[key] !== before[key])
      .map((key) => [key, after[key]]),
  ) as Partial<SupplierInput>
}

export function toInput(supplier: Supplier): SupplierInput {
  return {
    name: supplier.name,
    type: supplier.type,
    building: supplier.building,
    floor: supplier.floor ?? "",
    locationDescription: supplier.locationDescription ?? "",
    latitude: supplier.latitude,
    longitude: supplier.longitude,
    openingTime: supplier.openingTime,
    closingTime: supplier.closingTime,
    imageUrl: supplier.imageUrl ?? "",
  }
}
