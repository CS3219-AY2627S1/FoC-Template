import client from './http'

export interface UserProfile {
  id: number
  nickname: string
  email: string
  contact: string | null
}

// a user as listed for admins (GET /user), with their roles and when they joined
export interface UserSummary extends UserProfile {
  roles: string[]
  // a suspended user cannot log in or refresh their session
  isSuspended: boolean
  // timestamp text from the user service; read it with parseTimestamp (util/user)
  createdAt: string
}

// one page of users, oldest account first; fetch the next with cursor = pagination.nextCursor
export interface UserPage {
  data: UserSummary[]
  pagination: {
    limit: number
    hasMore: boolean
    nextCursor: number | null
  }
}

// a page of users (20 by default); admins only. The user service can also filter by name and role
export async function listUsers (cursor?: number) {
  const params = cursor === undefined ? {} : { cursor: String(cursor) }
  const response = await client.get<UserPage>('/public/user/user', { params })
  return response.data
}

// one user with their roles and join date; admins can look up anyone
export async function getUserSummary (id: number | string) {
  const response = await client.get<UserSummary>(`/public/user/user/${id}`)
  return response.data
}

export async function getUser (id: string) {
  const response = await client.get<UserProfile>(`/public/user/user/${id}`)
  return response.data
}

export async function updateUser (
  id: string,
  body: { nickname: string, contact: string | null },
) {
  await client.put(`/public/user/user/${id}`, body)
}

// admins only; an admin cannot suspend themselves
export async function setSuspended (id: number, isSuspended: boolean) {
  await (isSuspended
    ? client.post(`/public/user/user/${id}/suspend`)
    : client.delete(`/public/user/user/${id}/suspend`))
}

// admins only: true adds a role, false removes it, and roles left out stay as they are.
// An admin cannot change their own admin role. The user gets the change at their next login or refresh
export async function updateRoles (id: number, roles: Partial<Record<'admin' | 'requestor' | 'courier', boolean>>) {
  await client.patch(`/public/user/user/${id}/role`, roles)
}
