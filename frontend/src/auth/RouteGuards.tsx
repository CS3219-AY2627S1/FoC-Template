// Wrappers decide whether a page may be shown.
// Both assume the session has finished loading (App.tsx shows a spinner until then).
// These guards only control what the UI shows. The APIs enforce the real permissions.

import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { Role } from '../interfaces'
import { useAuth } from './AuthContext'

// Must be logged in. Otherwise go to /login, remembering where the user was heading.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <>{children}</>
}

// Must be logged in AND hold at least one of the listed roles.
// Logged in but missing the role: back to /home.
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  if (!user.roles.some((role) => roles.includes(role))) {
    return <Navigate to="/home" replace />
  }
  return <>{children}</>
}
