import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './authContextValue'
import {
  accessDeniedEvent,
  clearSession,
  readSession,
  sessionExpiredEvent,
  replaceSessionRole,
  sessionKey,
  type AuthSession,
  type WorkspaceRole,
} from './session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessDenied, setAccessDenied] = useState(false)
  const [session, setSession] = useState<AuthSession | null>(() =>
    readSession(),
  )
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [workspaceError, setWorkspaceError] = useState('')

  useEffect(() => {
    const refresh = () => {
      const nextSession = readSession()
      setSession(nextSession)
    }
    const denyAccess = () => setAccessDenied(true)
    const refreshFromStorage = (event: StorageEvent) => {
      if (event.key === sessionKey) refresh()
    }
    window.addEventListener(sessionExpiredEvent, refresh)
    window.addEventListener(accessDeniedEvent, denyAccess)
    window.addEventListener('storage', refreshFromStorage)
    return () => {
      window.removeEventListener(sessionExpiredEvent, refresh)
      window.removeEventListener(accessDeniedEvent, denyAccess)
      window.removeEventListener('storage', refreshFromStorage)
    }
  }, [])

  const value = useMemo(
    () => ({
      accessDenied,
      session,
      workspaceBusy,
      workspaceError,
      selectWorkspaceRole: async (role: WorkspaceRole) => {
        setWorkspaceBusy(true)
        setWorkspaceError('')
        try {
          const replacement = await replaceSessionRole(role)
          setSession(replacement)
          return true
        } catch (error) {
          setWorkspaceError(error instanceof Error ? error.message : "We couldn't switch your role. Please try again.")
          return false
        } finally {
          setWorkspaceBusy(false)
        }
      },
      signOut: () => {
        clearSession()
        setAccessDenied(false)
        setSession(null)
      },
    }),
    [accessDenied, session, workspaceBusy, workspaceError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
