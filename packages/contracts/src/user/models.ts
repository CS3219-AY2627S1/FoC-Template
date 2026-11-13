/** A validated base64 data URL for a supported profile image. */
export type ImageDataUrl = string & { readonly __brand: 'ImageDataUrl' }

export type UserId = string & { readonly __brand: 'UserId' }

export type UserRole = 'super-admin' | 'admin' | 'user'

/**
 * A complete Relay profile. `getUser()` and `updateUser()` always return this
 * exact shape; partial profile responses are not permitted.
 */
export type User = {
  id: UserId
  email: string
  username: string | null
  profilePictureUrl: string | null
  emailVerified: boolean
  profileCreated: true
  role: UserRole
}

/** Privacy-safe profile fields shared with trusted backend services. */
export type UserProfileSummary = {
  username: string | null
  profilePictureUrl: string | null
}
