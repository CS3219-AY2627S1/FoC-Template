import { Outlet } from 'react-router'
import { useSession } from '@/api/user/session'
import { ForbiddenPage } from '../pages/ForbiddenPage'

// The admin console, for accounts with the administrator role. It sits inside RequireSession,
// so someone is logged in here. This only decides what to show: every admin request is still
// checked by the service that answers it.
export function RequireAdmin() {
  const user = useSession().data

  if (!user || !user.roles.includes('administrator')) {
    return <ForbiddenPage username={user?.username} />
  }

  return <Outlet />
}
