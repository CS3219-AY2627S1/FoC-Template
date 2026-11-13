import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '@/lib/http'
import type { Paginated } from '@/lib/http'
import type { AccountState, AdminUser, PublicUser } from './types'

export type UserListFilters = {
  page: number
  pageSize: number
  // F5.5.1: part of a full name, username or email, or an exact account id.
  q?: string
  state?: AccountState
}

// Changing one account can change every list and detail of this service, and even the session
// when administrators change their own roles, so mutations reload everything under 'user'.
const userKeys = {
  all: ['user'] as const,
  list: (filters: UserListFilters) => ['user', 'list', filters] as const,
  detail: (id: string) => ['user', 'detail', id] as const,
}

// Administrators only; the user-service refuses everyone else with 403 (F1.4.1).
export function useUsers(filters: UserListFilters) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: ({ signal }) => request<Paginated<PublicUser>>('user', '/users', { query: filters, signal }),
    // Keeps the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  })
}

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: ({ signal }) => request<AdminUser>('user', `/users/${id}`, { signal }),
  })
}

export type StateChangeInput = {
  state: 'Active' | 'Suspended'
  reason: string
}

// F1.6.2: suspends or reinstates the account; a suspension also ends all its sessions.
export function useChangeAccountState(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (change: StateChangeInput) =>
      request<AdminUser>('user', `/users/${id}/state`, { method: 'PUT', body: change }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  })
}

// F1.5.5 and F5.1.2. The user-service refuses to remove the last administrator.
export function useGrantAdministrator(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => request<PublicUser>('user', `/users/${id}/roles/administrator`, { method: 'PUT' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export function useRevokeAdministrator(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => request<PublicUser>('user', `/users/${id}/roles/administrator`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  })
}
