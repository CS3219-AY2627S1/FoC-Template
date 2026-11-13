import type { FieldError, Validated } from './validation.ts'

export const MAX_PAGE_SIZE = 20

export interface ListFilters {
  terms: string[]
  type: string | null
  zone: string | null
  building: string | null
  status: 'Active' | 'Inactive' | 'all'
  // Only the caller's own favorites. Whose they are comes from the session, never the query.
  favorites: boolean
  // Only the suppliers open at the moment of the request, on the campus clock.
  openNow: boolean
  // Where distances are measured from, usually the student's own position.
  near: { latitude: number; longitude: number } | null
  sort: 'name' | 'distance'
  page: number
  pageSize: number
}

type Query = Record<string, unknown>

// A query string value is a string, or an array when the parameter is repeated.
function single(query: Query, key: string, errors: FieldError[]): string | null {
  const raw = query[key]
  if (raw === undefined) return null
  if (typeof raw !== 'string') {
    errors.push({ field: key, message: 'must be given once' })
    return null
  }
  return raw.trim() === '' ? null : raw.trim()
}

function whole(
  query: Query,
  key: string,
  min: number,
  max: number,
  fallback: number,
  errors: FieldError[],
): number {
  const raw = single(query, key, errors)
  if (raw === null) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push({ field: key, message: `must be a whole number from ${min} to ${max}` })
    return fallback
  }
  return value
}

function flag(query: Query, key: string, errors: FieldError[]): boolean {
  const text = single(query, key, errors)
  if (text === null || text === 'false') return false
  if (text === 'true') return true
  errors.push({ field: key, message: 'must be true or false' })
  return false
}

function point(query: Query, key: string, errors: FieldError[]): ListFilters['near'] {
  const text = single(query, key, errors)
  if (text === null) return null
  const parts = text.split(',')
  const [latitude, longitude] = parts.map((part) => (part.trim() === '' ? Number.NaN : Number(part)))
  if (
    parts.length !== 2 ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude!) > 90 ||
    Math.abs(longitude!) > 180
  ) {
    errors.push({ field: key, message: 'must be latitude,longitude, such as 1.297,103.776' })
    return null
  }
  return { latitude: latitude!, longitude: longitude! }
}

function status(query: Query, errors: FieldError[]): ListFilters['status'] {
  const text = single(query, 'status', errors)
  if (text === null) return 'Active'
  if (text === 'Active' || text === 'Inactive' || text === 'all') return text
  errors.push({ field: 'status', message: 'must be one of Active, Inactive, all' })
  return 'Active'
}

export function parseListQuery(query: Query): Validated<ListFilters> {
  const errors: FieldError[] = []

  const q = single(query, 'q', errors)
  if (q !== null && q.length > 100) {
    errors.push({ field: 'q', message: 'must be at most 100 characters' })
  }

  const text = (key: string, max: number) => {
    const value = single(query, key, errors)
    if (value !== null && value.length > max) {
      errors.push({ field: key, message: `must be at most ${max} characters` })
    }
    return value
  }

  const listStatus = status(query, errors)
  const near = point(query, 'near', errors)
  const sortText = single(query, 'sort', errors) ?? 'name'
  if (sortText !== 'name' && sortText !== 'distance') {
    errors.push({ field: 'sort', message: 'must be name or distance' })
  } else if (sortText === 'distance' && near === null && !errors.some((e) => e.field === 'near')) {
    errors.push({ field: 'near', message: 'is needed to sort by distance' })
  }

  const filters: ListFilters = {
    terms: q === null ? [] : q.split(/\s+/).slice(0, 5),
    type: text('type', 60),
    zone: text('zone', 60),
    building: text('building', 120),
    status: listStatus,
    favorites: flag(query, 'favorites', errors),
    openNow: flag(query, 'openNow', errors),
    near,
    sort: sortText === 'distance' ? 'distance' : 'name',
    page: whole(query, 'page', 1, 100000, 1, errors),
    pageSize: whole(query, 'pageSize', 1, MAX_PAGE_SIZE, MAX_PAGE_SIZE, errors),
  }
  return errors.length > 0 ? { errors } : { value: filters }
}

// The filter values take the same status as the list, so they match what the list can find.
export function parseFilterValuesQuery(query: Query): Validated<ListFilters['status']> {
  const errors: FieldError[] = []
  const value = status(query, errors)
  return errors.length > 0 ? { errors } : { value }
}

// The moment to evaluate opening hours at. It must carry a UTC offset, because
// a bare "2026-10-01T12:00" would silently be read in the server's time zone.
export function parseAt(query: Query): Validated<Date | null> {
  const errors: FieldError[] = []
  const raw = single(query, 'at', errors)
  if (errors.length > 0) return { errors }
  if (raw === null) return { value: null }
  const date = new Date(raw)
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(raw) || Number.isNaN(date.getTime())) {
    return {
      errors: [{ field: 'at', message: 'must be an ISO 8601 time with an offset, such as 2026-10-01T12:00:00+08:00' }],
    }
  }
  return { value: date }
}
