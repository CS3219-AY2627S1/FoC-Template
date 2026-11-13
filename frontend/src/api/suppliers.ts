// AI Assistance Disclosure:
// Tool: GitHub Copilot (Copilot SDK), date: 2026-11-08
// Scope: Added frontend API calls for adding and removing supplier favourites and mapped the favourite state.
// Author review: Read through all code and verified through testing

import type { Supplier } from '../interfaces'
import { ApiError, request, NotFoundError } from './client'

const BASE_URL = '/suppliers'

const DIRECT_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.avif',
  '.svg',
  '.bmp',
])

const DIRECT_IMAGE_HOSTS = new Set([
  'i.imgur.com',
  'i.ibb.co',
  'images.unsplash.com',
  'raw.githubusercontent.com',
])

export type ApiSupplier = Omit<
  Supplier,
  'operatingHours' | 'latitude' | 'longitude' | 'isFavourite'
> & {
  latitude: string
  longitude: string
  is_favourite?: boolean
}

// create and update endpoints format
export type SupplierInput = {
  name: string
  type: string
  building: string
  floor: string
  location_description: string
  starting_time: string
  closing_time: string
  latitude: number
  longitude: number
  image_url: string | null
}

/** Empty/whitespace → null. Non-empty must be an absolute http(s) URL. */
export function normalizeSupplierImageUrl(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Optional field: blank is fine.
 * Non-empty values must be a direct image URL (not an album/page like imgur.com/a/...),
 * or a cropped data URL produced by the Create/Edit image framer.
 */
export function isValidSupplierImageUrl(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') return true

  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(trimmed)) {
    return true
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false

    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()

    // Reject common album/gallery/page URLs that are not image files.
    if (
      path.includes('/a/') ||
      path.includes('/gallery/') ||
      path.includes('/album/')
    ) {
      return false
    }

    const lastDot = path.lastIndexOf('.')
    const extension = lastDot >= 0 ? path.slice(lastDot) : ''
    if (DIRECT_IMAGE_EXTENSIONS.has(extension)) return true
    if (DIRECT_IMAGE_HOSTS.has(host)) return true

    return false
  } catch {
    return false
  }
}

export function getSupplierImageUrlError(value: string): string {
  if (isValidSupplierImageUrl(value)) return ''
  return 'Use a direct image link ending in .jpg/.png/.webp (for example https://i.imgur.com/abc.jpg), not an album or webpage URL.'
}

/**
 * Normalize API / browser time strings to HH:MM for <input type="time">.
 * Accepts "9:00", "09:00", "09:00:00", etc. Empty/invalid → "".
 */
export function toSupplierTimeInput(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)/)
  if (!match) return ''
  const hour = Number(match[1])
  if (hour > 23) return ''
  return `${String(hour).padStart(2, '0')}:${match[2]}`
}

/** HH:MM:SS for supplier-service / Postgres TIME. */
export function toSupplierTimePayload(value: string): string {
  const hhmm = toSupplierTimeInput(value)
  return hhmm ? `${hhmm}:00` : ''
}

/** HH:MM in 24-hour form, matching native time inputs and Create placeholders. */
export function isValidSupplierTime(value: string): boolean {
  return toSupplierTimeInput(value) !== ''
}

export function getSupplierRequestErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof ApiError) {
    if (error.status === 413) {
      return 'Image is too large to save. Paste the original image link again (crop is optional), then Save.'
    }
    const cleaned = error.message.replace(/^Error\s*:\s*/i, '').trim()
    if (cleaned) return cleaned
  }
  if (error instanceof Error) {
    const cleaned = error.message.trim()
    // Safari uses this vague message for JSON parse / selector failures.
    if (/did not match the expected pattern/i.test(cleaned)) {
      return fallback
    }
    if (cleaned) return cleaned
  }
  return fallback
}

export function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`
}

export function formatHours(start: string, end: string) {
  if (start.startsWith('00:00') && end.startsWith('23:59')) return 'Open 24 hours'
  return `${formatTime(start)} - ${formatTime(end)}`
}

// TODO: replace with s3 url when hosted on cloud
function toRawImageUrl(url: string | null): string | null {
  if (!url) return null
  return url
    .replace('https://github.com/', 'https://raw.githubusercontent.com/')
    .replace('/blob/', '/')
}

function toSupplier(s: ApiSupplier): Supplier {
  const { is_favourite: isFavourite, ...supplier } = s
  return {
    ...supplier,
    image_url: toRawImageUrl(s.image_url),
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
    operatingHours: formatHours(s.starting_time, s.closing_time),
    isFavourite: Boolean(isFavourite),
  }
}

const SUPPLIER_IMAGE_OVERRIDE_KEY = 'foc:supplier-image-overrides'

/** Drop legacy client-only crop cache — DB/API is the source of truth. */
function clearLegacySupplierImageOverrides(): void {
  try {
    sessionStorage.removeItem(SUPPLIER_IMAGE_OVERRIDE_KEY)
  } catch {
    /* ignore private mode */
  }
}

/**
 * Exact persistence check only.
 * - null sent → nothing to verify
 * - http(s) may be rewritten github→raw by toRawImageUrl
 * - cropped data URLs must match byte-for-byte (no "any data:image" soft pass)
 */
function imagePersisted(sent: string | null, received: string | null): boolean {
  if (sent === null) return true
  if (!received) return false
  if (received === sent) return true
  const expected = toRawImageUrl(sent)
  return expected !== null && received === expected
}

export const IMAGE_PERSIST_ERROR =
  'Image was not saved to the server. The server still has the previous image (or none). Try a smaller crop, or paste a direct image link and Save without relying on crop.'

function assertImagePersisted(
  sent: string | null,
  received: string | null,
): void {
  if (imagePersisted(sent, received)) return
  throw new ApiError(500, IMAGE_PERSIST_ERROR)
}

export function isImagePersistError(error: unknown): boolean {
  return error instanceof ApiError && error.message === IMAGE_PERSIST_ERROR
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  clearLegacySupplierImageOverrides()
  // Bust CloudFront/browser caches so list images match a just-saved crop.
  const response = await request(`${BASE_URL}?_=${Date.now()}`)
  const data: ApiSupplier[] = await response.json()
  return data.filter((s) => s.is_active).map(toSupplier)
}


export async function fetchSupplierById(
  id: string,
  options: { includeInactive?: boolean } = {},
): Promise<Supplier | null> {
  try {
    clearLegacySupplierImageOverrides()
    const response = await request(`${BASE_URL}/${id}?_=${Date.now()}`)
    const data: ApiSupplier | null = await response.json()
    if (!data || (!options.includeInactive && !data.is_active)) return null
    return toSupplier(data)
  } catch (error) {
    if (error instanceof NotFoundError) return null
    throw error
  }
}

export async function createSupplier(input: SupplierInput): Promise<Supplier | null> {
  const response = await request(BASE_URL, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  let created: ApiSupplier | null
  try {
    created = (await response.json()) as ApiSupplier | null
  } catch {
    throw new ApiError(
      500,
      'Supplier was created but the server response was invalid. Refresh the list to confirm.',
    )
  }
  if (!created?.id) {
    // Older deployments may omit a body — persistence cannot be verified here.
    return null
  }
  // POST body (if present) must already match the exact image we sent.
  assertImagePersisted(input.image_url, toSupplier(created).image_url)
  const fresh = await fetchSupplierById(created.id)
  if (!fresh) {
    throw new ApiError(
      500,
      'Supplier was created but could not be reloaded from the server.',
    )
  }
  assertImagePersisted(input.image_url, fresh.image_url)
  return fresh
}

export async function updateSupplier(
  id: string,
  input: SupplierInput,
): Promise<Supplier> {
  const response = await request(`${BASE_URL}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })

  // If PATCH body parses, it must already match the exact image we sent.
  // Never treat "some other data:image/..." as success.
  try {
    const data = (await response.json()) as ApiSupplier | null
    if (data?.is_active) {
      assertImagePersisted(input.image_url, toSupplier(data).image_url)
    }
  } catch (error) {
    if (error instanceof ApiError && error.message === IMAGE_PERSIST_ERROR) {
      throw error
    }
    /* empty / truncated / Safari parse — still require GET match below */
  }

  // Backend source of truth: GET must return the exact same image_url.
  let fresh = await fetchSupplierById(id)
  if (!fresh || !imagePersisted(input.image_url, fresh.image_url)) {
    await delay(400)
    fresh = await fetchSupplierById(id)
  }
  if (!fresh) {
    throw new ApiError(
      500,
      'Changes may have saved but the supplier could not be reloaded. Refresh and check the image.',
    )
  }
  assertImagePersisted(input.image_url, fresh.image_url)
  return fresh
}

export async function deleteSupplier(id: string) {
  await request(`${BASE_URL}/deactivate/${id}`, { method: 'PATCH' })
}

export async function addFavouriteSupplier(id: string) {
  await request(`${BASE_URL}/${id}/favourite`, { method: 'PUT' })
}

export async function deleteFavouriteSupplier(id: string) {
  await request(`${BASE_URL}/${id}/favourite`, { method: 'DELETE' })
}
