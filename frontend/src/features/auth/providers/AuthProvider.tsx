import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { axiosClient } from '#/lib/axiosClient'
import { logoutUser } from '../api/logoutUser.api'
import { getAccessToken, setAccessToken } from '../lib/accessTokenStore'
import { AuthRequestError } from '../lib/authRequest'
import { setupAuthInterceptors } from '../lib/authInterceptors'
import {
  invalidateRefresh,
  refreshAccessToken,
} from '../lib/refreshAccessToken'

export type AuthOperations = {
  ensureAuthenticated: () => Promise<boolean>
  completeLogin: (accessToken: string) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<
  (AuthOperations & { invalidation: number }) | null
>(null)

export const useAuth = () => {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth requires AuthProvider')
  return auth
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient()
  // An explicit end to authentication must not immediately trigger cookie recovery.
  const authenticationEnded = useRef(false)
  const exiting = useRef<Promise<void> | null>(null)
  const [invalidation, setInvalidation] = useState(0)

  const operations = useMemo(() => {
    const clearUserQueries = () => {
      for (const key of ['current-user', 'errands', 'credits']) {
        void queryClient.cancelQueries({ queryKey: [key] })
        queryClient.removeQueries({ queryKey: [key] })
      }
    }
    const canRefresh = () => !authenticationEnded.current

    const authenticationFailed = () => {
      if (authenticationEnded.current) return
      authenticationEnded.current = true
      invalidateRefresh()
      setAccessToken(null)
      clearUserQueries()
      setInvalidation((value) => value + 1)
    }

    const ensureAuthenticated = async () => {
      if (!canRefresh()) return false
      if (getAccessToken()) return true

      try {
        const token = await refreshAccessToken()
        return canRefresh() && Boolean(token)
      } catch (error) {
        if (error instanceof AuthRequestError && error.status === 401) {
          authenticationFailed()
          return false
        }
        throw error
      }
    }

    const completeLogin = (accessToken: string) => {
      invalidateRefresh()
      setAccessToken(accessToken)
      clearUserQueries()
      authenticationEnded.current = false
    }

    const logout = (): Promise<void> => {
      if (exiting.current) return exiting.current

      const pendingRefresh = invalidateRefresh()
      authenticationEnded.current = true
      setAccessToken(null)
      clearUserQueries()

      // Serialize cookie rotation and logout. The API adapters bound each request.
      exiting.current = (async () => {
        await pendingRefresh?.catch(() => undefined)
        try {
          await logoutUser()
        } catch {
          // Local logout completes even when server logout cannot be confirmed.
        } finally {
          exiting.current = null
        }
      })()

      return exiting.current
    }

    return {
      ensureAuthenticated,
      completeLogin,
      logout,
      authenticationFailed,
      canRefresh,
    }
  }, [queryClient])

  useEffect(() => setupAuthInterceptors(axiosClient, operations), [operations])

  const value = useMemo(
    () => ({
      ensureAuthenticated: operations.ensureAuthenticated,
      completeLogin: operations.completeLogin,
      logout: operations.logout,
      invalidation,
    }),
    [operations, invalidation],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
