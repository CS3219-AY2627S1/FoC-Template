import type { ImageDataUrl } from './models'
export type UpdateUserRequest = { username?: string; profilePicture?: ImageDataUrl | null }
export type DeleteUserRequest = { confirmation: string }
