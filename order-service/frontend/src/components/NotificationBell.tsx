// Shared across every frontend's header. Keep the copies identical: notification-service owns it
// (see notification-service/README.md "Header bell").
import { Bell } from 'lucide-react'
import { readToken, useUnreadCount } from './useUnreadCount'

/** The header bell: a link to the Notifications page with the unread count as text. */
export function NotificationBell({
  current = false,
  className = 'notification-bell',
  badgeClassName = 'notification-badge',
}: {
  current?: boolean
  /** Frontends using CSS modules pass their own class names. */
  className?: string
  badgeClassName?: string
}) {
  const count = useUnreadCount()
  if (!readToken()) return null
  const label =
    count === null ? 'Notifications' : count === 0 ? 'Notifications, none unread' : `Notifications, ${count} unread`
  return (
    <a
      aria-current={current ? 'page' : undefined}
      aria-label={label}
      className={className}
      href="/notifications"
      title={label}
    >
      <Bell aria-hidden="true" />
      {count !== null && count > 0 && (
        <span aria-hidden="true" className={badgeClassName}>
          {count > 9 ? '9+' : count}
        </span>
      )}
    </a>
  )
}
