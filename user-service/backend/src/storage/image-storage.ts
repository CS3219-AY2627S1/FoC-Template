// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-21
// Scope: Generated initial implementation of the User Service image-storage contract.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

export type ImageContentType = 'image/jpeg' | 'image/png'

export type ImageUpload = {
  body: Buffer
  contentType: ImageContentType
  extension: 'jpg' | 'png'
}

export type StoredImage = {
  key: string
  url: string
}

/** Storage boundary for profile pictures. Implementations may target Floci or Amazon S3. */
export interface ImageStorage {
  upload(input: ImageUpload, ownerSub: string): Promise<StoredImage>
  delete(key: string): Promise<void>
  url(key: string): Promise<string>
}
