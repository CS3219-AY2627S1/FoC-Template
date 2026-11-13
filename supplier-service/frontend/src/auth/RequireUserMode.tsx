import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'

export function RequireUserMode() {
  const { session } = useAuth()
  if (session?.role === 'ADMIN') {
    return <Navigate replace to="/admin/suppliers" />
  }
  return <Outlet />
}
