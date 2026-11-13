import { useMutation, useQueryClient } from '@tanstack/react-query'
import { request } from '@/lib/http'
import { sessionKey } from './session'
import type { PublicUser } from './types'

// Only these two can change; email, roles and state are refused by the user-service (F1.4.3).
export type ProfileChanges = {
  fullName?: string
  username?: string
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: ProfileChanges) =>
      request<PublicUser>('user', '/users/me', { method: 'PATCH', body: changes }),
    // The answer is the updated account, so every place that shows the session updates at once.
    onSuccess: (user) => queryClient.setQueryData(sessionKey, user),
  })
}

export type PasswordChange = {
  currentPassword: string
  newPassword: string
}

// Ends every other session of the account; this one stays logged in.
export function useChangePassword() {
  return useMutation({
    mutationFn: (change: PasswordChange) =>
      request<void>('user', '/users/me/password', { method: 'PUT', body: change }),
  })
}
