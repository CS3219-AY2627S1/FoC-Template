// image restrictions
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png'] as const

// returns if image not meet requirements
export const validateImageFile = (file: File): string | null => {
  if (!(ACCEPTED_IMAGE_TYPES as ReadonlyArray<string>).includes(file.type)) {
    return 'Please choose a JPEG or PNG image.'
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Please choose an image up to 5 MB.'
  }
  return null
}
