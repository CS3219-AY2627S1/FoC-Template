import { hashKey, useMutation, useQueryClient } from '@tanstack/react-query'
import { request } from '@/lib/http'
import { sessionKey } from './session'
import type { PublicUser } from './types'

export type LoginInput = {
  // Username or NUS email; the user-service decides which one it is.
  identifier: string
  password: string
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) => request<PublicUser>('user', '/auth/login', { method: 'POST', body: input }),
    onSuccess: (user) => {
      // The session entry is updated, not removed, because the guards are subscribed to it:
      // RequireGuest then sends the user on to where they came from. Everything else goes, so
      // nothing cached for an account whose session ended in this tab shows for this one.
      queryClient.setQueryData(sessionKey, user)
      queryClient.removeQueries({ predicate: (query) => query.queryHash !== hashKey(sessionKey) })
    },
  })
}

export type RegisterInput = {
  fullName: string
  email: string
  username: string
  password: string
}

// Creates the account in PendingVerification and sends the code. Nobody is logged in afterwards.
export function useRegister() {
  return useMutation({
    mutationFn: (input: RegisterInput) => request<PublicUser>('user', '/auth/register', { method: 'POST', body: input }),
  })
}

export type VerifyInput = {
  email: string
  // The 6-digit code from the email.
  code: string
}

// Activates the account. It does not log in: the user logs in afterwards with their password.
export function useVerify() {
  return useMutation({
    mutationFn: (input: VerifyInput) => request<PublicUser>('user', '/auth/verify', { method: 'POST', body: input }),
  })
}

// Always answers 202 with the same message, whether or not the account exists, so the
// answer reveals nothing about which emails are registered.
export function useResendCode() {
  return useMutation({
    mutationFn: (email: string) =>
      request<{ message: string }>('user', '/auth/verify/resend', { method: 'POST', body: { email } }),
  })
}
