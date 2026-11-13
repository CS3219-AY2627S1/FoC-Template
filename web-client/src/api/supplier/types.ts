// Mirrors the supplier JSON in supplier-service/README.md, section "API", and the fields
// accepted by supplier-service/src/domain/validation.ts. Change both together.

export type SupplierStatus = 'Active' | 'Inactive'

// The order the supplier-service lists them in. Monday is the first day of its week.
export const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

export type Weekday = (typeof weekdays)[number]

// Times are "HH:MM". closes may be "24:00", and a closing time before the opening time runs past midnight.
export type SupplierHours = {
  day: Weekday
  opens: string
  closes: string
}

export type SupplierAvailability = {
  open: boolean
  closesAt: string | null
  nextOpensAt: { day: Weekday; time: string } | null
}

export type Supplier = {
  id: string
  name: string
  type: string
  zone: string
  building: string
  address: string
  description: string | null
  latitude: number | null
  longitude: number | null
  contact: { phone: string | null; email: string | null }
  // Only the days it opens. A weekday that is not listed is closed all day.
  hours: SupplierHours[]
  status: SupplierStatus
  // Paths on the supplier-service; supplierImageUrl in ./photos turns them into URLs.
  photo: { path: string; thumbnailPath: string } | null
  availability: SupplierAvailability
  // Whole metres from the list's `near` point. Null without one, or without coordinates.
  distanceMeters: number | null
  createdAt: string
  updatedAt: string
}

// GET /suppliers/favorites: the ids of the logged-in account's favorites.
export type SupplierFavorites = {
  supplierIds: string[]
}

// PUT /suppliers/:id/photo: both images as data URLs, at most 1 MB and 256 KB.
export type SupplierPhotoInput = {
  photo: string
  thumbnail: string
}

// The supplier-service matches type, zone and building ignoring case.
export type SupplierFilters = {
  q?: string
  type?: string
  zone?: string
  building?: string
  // The supplier-service lists only Active suppliers unless told otherwise.
  status?: SupplierStatus | 'all'
  // Only the favorites of whoever is logged in; the supplier-service knows whose from the session.
  favorites?: boolean
  // Only the suppliers open now, on the campus clock.
  openNow?: boolean
  // "latitude,longitude" to measure distances from. 'distance' needs it.
  near?: string
  sort?: 'name' | 'distance'
  page: number
  // 1 to 20. The supplier-service uses 20 when none is given.
  pageSize?: number
}

// GET /suppliers/filters: every type, zone and building in use by suppliers of that status.
export type SupplierFilterValues = {
  types: string[]
  zones: string[]
  buildings: string[]
}

// POST /suppliers/:id/route. The walk from the supplier (from) to a point. seconds is the metres at the
// supplier-service's walking speed, and estimated is true when the point is off its walking map.
export type WalkingRoute = {
  from: { latitude: number; longitude: number }
  metres: number
  seconds: number
  estimated: boolean
  mapVersion: string | null
}

// The body of a create or update. Numbers and times are sent as the user typed them when they
// do not read as one, so the supplier-service names the field it refuses (N5.4).
export type SupplierInput = {
  name: string
  type: string
  zone: string
  building: string
  address: string
  description: string
  latitude: number | string | null
  longitude: number | string | null
  contact: { phone: string; email: string }
  hours: SupplierHours[]
}
