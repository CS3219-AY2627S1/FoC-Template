import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError, request } from '@/lib/http'
import type { PublicUser } from './types'

export const sessionKey = ['user', 'session'] as const

// The session cookie is HttpOnly, so asking the user-service is the only way to know
// who is logged in. A 401 is not an error here: it means "guest" and becomes null.
async function fetchSession(signal: AbortSignal): Promise<PublicUser | null> {
  try {
    return await request<PublicUser>('user', '/users/me', { signal })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) => fetchSession(signal),
    // Only login and logout change the session, and they update this cache entry directly.
    staleTime: Infinity,
  })
}

export function useLogout() {
  return useMutation({
    mutationFn: () => request<void>('user', '/auth/logout', { method: 'POST' }),
    // A full page load wipes every cached answer of the account that just left, which matters on
    // shared computers. replace() also drops the protected page from the back button history.
    onSuccess: () => window.location.replace('/login'),
  })
}

// For pages below RequireSession, where a logged-in account is guaranteed.
export function useCurrentUser(): PublicUser {
  const user = useSession().data
  if (!user) throw new Error('useCurrentUser needs a logged-in account: use it below RequireSession.')
  return user
}
