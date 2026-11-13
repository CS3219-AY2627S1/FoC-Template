import type { AdminUser, Role, User, UserListResponse, UserRolesResponse } from '../interfaces'
import {
  request,
  getToken,
  getRefreshToken,
  setTokens,
  clearToken,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ApiError,
} from './client'

export {
  getToken,
  getRefreshToken,
  setTokens,
  clearToken,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ApiError,
}

// Auth
export async function login(input: { identifier: string; password: string }): Promise<User> {
  const response = await request(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    false
  )
  const data: { accessToken: string; refreshToken?: string; user: User } = await response.json()
  setTokens(data.accessToken, data.refreshToken)
  return data.user
}

interface RegisterInput {
  username: string,
  email: string,
  password: string,
  firstName: string,
  lastName: string
}

export async function register(input: RegisterInput): Promise<User> {
  const response = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    },
    false
  )
  return response.json()
}

export async function logout() {
  try {
    if (getToken()) {
      await request('/auth/logout', { method: 'POST' }, true)
    }
  } catch (error) {
    console.error(error)
  } finally {
    clearToken()
  }
}

// Restores the session on page load. Returns null when nobody is logged in.
export async function fetchCurrentUser(): Promise<User | null> {
  if (!getToken()) return null
  try {
    const response = await request('/users/me', {}, true)
    return await response.json()
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof NotFoundError) {
      clearToken()
      return null
    }
    throw error
  }
}

export interface PublicUserProfile {
  id: string
  username: string
  firstName: string
  lastName: string
  roles: Role[]
}

/** Looks up other users through User Service. Does not read the user database. */
export async function fetchUsersByIds(userIds: string[]): Promise<PublicUserProfile[]> {
  const uniqueIds = [...new Set(userIds.filter((id) => id.trim().length > 0))]
  if (uniqueIds.length === 0) return []

  try {
    const response = await request('/users/batch', {
      method: 'POST',
      body: JSON.stringify({ userIds: uniqueIds }),
    })
    return (await response.json()) as PublicUserProfile[]
  } catch (error) {
    console.error(error)
    return []
  }
}

interface UpdateProfileInput {
  username?: string,
  email?: string,
  firstName?: string,
  lastName?: string
}

// Update profile
export async function updateCurrentUser(input: UpdateProfileInput): Promise<User> {
  const response = await request(
    '/users/me',
    { method: 'PATCH', body: JSON.stringify(input) },
    true,
  )
  return response.json()
}

interface ChangePasswordInput {
  currentPassword: string,
  newPassword: string
}

// The backend revokes all refresh tokens on success, so callers should log out afterwards.
export async function changePassword(input: ChangePasswordInput): Promise<{ message: string }> {
  const response = await request(
    '/users/me/change-password',
    { method: 'POST', body: JSON.stringify(input) },
    true,
  )
  return response.json()
}

// Admin: list and search users
interface ListUsersParams {
  page?: number,
  limit?: number,
  search?: string
}

export async function listUsers(params: ListUsersParams = {}): Promise<UserListResponse> {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.search?.trim()) query.set('search', params.search.trim())

  const queryString = query.toString()
  const response = await request(`/users${queryString ? `?${queryString}` : ''}`, {}, true)
  return response.json()
}

// Admin: role management
export async function getUserRoles(userId: string): Promise<UserRolesResponse> {
  const response = await request(`/users/${encodeURIComponent(userId)}/roles`, {}, true)
  return response.json()
}

export async function grantRole(userId: string, role: Role): Promise<UserRolesResponse> {
  const response = await request(
    `/users/${encodeURIComponent(userId)}/roles`,
    { method: 'POST', body: JSON.stringify({ role }) },
    true,
  )
  return response.json()
}

export async function revokeRole(userId: string, role: Role): Promise<UserRolesResponse> {
  const response = await request(
    `/users/${encodeURIComponent(userId)}/roles/${role}`,
    { method: 'DELETE' },
    true,
  )
  return response.json()
}

// Admin: deactivate / reactivate
export async function updateUserStatus(userId: string, isActive: boolean): Promise<AdminUser> {
  const response = await request(
    `/users/${encodeURIComponent(userId)}/status`,
    { method: 'PATCH', body: JSON.stringify({ isActive }) },
    true,
  )
  return response.json()
}


// Role Helpers

export function hasRole(user: User | null, role: Role): boolean {
  return !!user?.roles.includes(role)
}

export function isAdmin(user: User | null): boolean {
  return hasRole(user, 'ADMIN')
}
