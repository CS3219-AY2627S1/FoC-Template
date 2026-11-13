import type { FieldError, Validated } from './validation.ts'

export const MAX_PHOTO_BYTES = 1024 * 1024
export const MAX_THUMBNAIL_BYTES = 256 * 1024

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type ImageType = (typeof IMAGE_TYPES)[number]

export interface PhotoInput {
  photo: Buffer
  photoType: ImageType
  thumbnail: Buffer
  thumbnailType: ImageType
}

// The type comes from the file's first bytes, never from a name or a header
// the caller chose.
export function imageTypeOf(bytes: Buffer): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  return null
}

// What a browser canvas gives: data:image/jpeg;base64,....
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/

const sizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${bytes / (1024 * 1024)} MB` : `${bytes / 1024} KB`)

function readImage(
  value: unknown,
  field: string,
  max: number,
  errors: FieldError[],
): { bytes: Buffer; type: ImageType } | null {
  const match = typeof value === 'string' ? DATA_URL.exec(value) : null
  if (!match || match[2]!.length % 4 !== 0) {
    errors.push({ field, message: 'must be an image as a data URL, such as data:image/jpeg;base64,...' })
    return null
  }
  const base64 = match[2]!
  // Measured before decoding, so an oversized image is never decoded at all.
  const size = (base64.length / 4) * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
  if (size > max) {
    errors.push({ field, message: `must be at most ${sizeText(max)}` })
    return null
  }
  const bytes = Buffer.from(base64, 'base64')
  const type = imageTypeOf(bytes)
  if (type === null || type !== match[1]) {
    errors.push({ field, message: 'must be a JPEG, PNG or WebP image of the type it names' })
    return null
  }
  return { bytes, type }
}

export function validatePhoto(body: unknown): Validated<PhotoInput> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { errors: [{ field: 'body', message: 'must be a JSON object' }] }
  }
  const errors: FieldError[] = []
  for (const key of Object.keys(body)) {
    if (key !== 'photo' && key !== 'thumbnail') errors.push({ field: key, message: 'is not a known field' })
  }
  const record = body as Record<string, unknown>
  const photo = readImage(record.photo, 'photo', MAX_PHOTO_BYTES, errors)
  const thumbnail = readImage(record.thumbnail, 'thumbnail', MAX_THUMBNAIL_BYTES, errors)
  if (errors.length > 0 || !photo || !thumbnail) return { errors }
  return { value: { photo: photo.bytes, photoType: photo.type, thumbnail: thumbnail.bytes, thumbnailType: thumbnail.type } }
}
