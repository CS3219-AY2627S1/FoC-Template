// holds the logged-in user for the whole app.
// Everything role-related in the UI (guards, navbar, mode toggle, admin buttons) reads from here.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '../interfaces'
import type { UserMode } from '../components/AppNavigation'
import { fetchCurrentUser, hasRole, login as apiLogin, logout as apiLogout } from '../api/users'

type AuthState = {
  user: User | null
  loading: boolean // true while the saved session is being restored on page load
  isAdmin: boolean
  canRequest: boolean // has the REQUESTER role
  canCourier: boolean // has the COURIER role
  availableModes: UserMode[] // frontend workspaces this user may switch between
  login: (identifier: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User | null) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore the session from the saved token. Resolves to null if there is no
  // token or it is expired/revoked, which simply means "not logged in".
  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch((error) => {
        console.error(error) // e.g. User Service unreachable
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  // Throws on failure (wrong password etc.) so the login page can show the message
  async function login(identifier: string, password: string) {
    setUser(await apiLogin({ identifier, password }))
  }

  async function logout() {
    await apiLogout() // revokes the token on the server and clears it locally
    setUser(null)
  }

  const canRequest = hasRole(user, 'REQUESTER')
  const canCourier = hasRole(user, 'COURIER')
  const isAdmin = hasRole(user, 'ADMIN')
  // Frontend workspaces only. ADMIN remains an RBAC privilege; 'admin' here is a UI view.
  const availableModes: UserMode[] = []
  if (canRequest) availableModes.push('requester')
  if (canCourier) availableModes.push('courier')
  if (isAdmin) availableModes.push('admin')

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        canRequest,
        canCourier,
        availableModes,
        login,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
