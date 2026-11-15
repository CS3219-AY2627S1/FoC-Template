/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Typed wrappers for the User Service endpoints used by the auth pages.
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: email and createdAt on /whoami, and updateDisplayName() for the profile page.
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */
import { apiRequest } from './client'

export type Role = 'MEMBER' | 'ADMINISTRATOR'

// Shape of GET /api/v1/whoami. Email and creation date were added for the profile page
// (author, 2026-11-10); optional here so older test doubles still type-check.
export interface CurrentUser {
  username: string
  displayName: string
  role: Role
  email?: string
  createdAt?: string
}

interface LoginResponse {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
}

export function register(username: string, email: string, password: string): Promise<unknown> {
  return apiRequest('/auth/register', { method: 'POST', body: { username, email, password }, auth: false })
}

/** Returns the access token. `identifier` is a username or an email address. */
export async function login(identifier: string, password: string): Promise<string> {
  const result = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { identifier, password },
    auth: false,
  })
  return result.accessToken
}

export function whoami(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/whoami')
}

/** PATCH /whoami: only the display name can change (1-50 characters, trimmed by the server) */
export function updateDisplayName(displayName: string): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/whoami', { method: 'PATCH', body: { displayName } })
}
