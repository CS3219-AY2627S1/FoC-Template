/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { AuthApiError, login, logout } from './auth.api'
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth.context'
import {
  clearAccessToken,
  getAccessTokenSubject,
  getAccessTokenType,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
  subscribeToSessionExpiry,
} from './auth.token'

export function AuthProvider({ children }: PropsWithChildren) {
  const mockAuthEnabled =
    import.meta.env.DEV && import.meta.env.VITE_MOCK_AUTH === 'true'
  const [status, setStatus] = useState<AuthStatus>(
    mockAuthEnabled ? 'authenticated' : 'loading',
  )
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserType, setCurrentUserType] = useState<import('./auth.token').AccountType | null>(
    mockAuthEnabled ? 'Administrator' : null,
  )

  useEffect(() => {
    if (mockAuthEnabled) return

    let active = true
    const unsubscribe = subscribeToSessionExpiry(() => {
      if (active) {
        setCurrentUserId(null)
        setCurrentUserType(null)
        setStatus('unauthenticated')
      }
    })

    refreshAccessToken()
      .then((token) => {
        if (active) {
          setCurrentUserId(getAccessTokenSubject(token))
          setCurrentUserType(getAccessTokenType(token))
          setStatus('authenticated')
        }
      })
      .catch(() => {
        if (active) {
          setCurrentUserId(null)
          setCurrentUserType(null)
          setStatus('unauthenticated')
        }
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [mockAuthEnabled])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      currentUserId,
      currentUserType,
      async signIn(credentials) {
        const session = await login(credentials)
        setAccessToken(session.accessToken)
        setCurrentUserId(getAccessTokenSubject(session.accessToken))
        setCurrentUserType(getAccessTokenType(session.accessToken))
        setStatus('authenticated')
      },
      async signOut() {
        let token = getAccessToken()

        try {
          if (token) {
            try {
              await logout(token)
            } catch (error) {
              if (!(error instanceof AuthApiError) || error.status !== 401) throw error

              token = await refreshAccessToken()
              await logout(token)
            }
          }
        } catch {
          // Local authentication is still cleared when the API is unavailable.
        } finally {
          clearAccessToken()
          setCurrentUserId(null)
          setCurrentUserType(null)
          setStatus('unauthenticated')
        }
      },
    }),
    [currentUserId, currentUserType, status],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
