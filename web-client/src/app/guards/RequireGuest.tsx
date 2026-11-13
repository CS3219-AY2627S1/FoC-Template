import { Navigate, Outlet, useLocation } from 'react-router'
import type { Location } from 'react-router'
import { useSession } from '@/api/user/session'
import { SessionPending } from './SessionPending'

// Signed-out pages only. A logged-in user is sent on: back to the page that sent them to the
// login (state.from), or to the start. This is the only place that redirects after a login.
export function RequireGuest() {
  const session = useSession()
  const location = useLocation()

  if (session.data === undefined) return <SessionPending session={session} />

  if (session.data !== null) {
    const from = (location.state as { from?: Location } | null)?.from
    return <Navigate to={from ?? '/'} replace />
  }

  return <Outlet />
}
