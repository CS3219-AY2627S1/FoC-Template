import { NotificationCard } from '@relay/ui'
import type { SavedNotification } from '../notificationStore'
import { STATUS_LABELS } from '../types'

export function ErrandNotificationCard({
  notification,
  onSelect,
  onClose,
  confirmRemoval = false,
}: {
  notification: SavedNotification
  onSelect: () => void
  onClose: () => void
  confirmRemoval?: boolean
}) {
  const message =
    notification.type === 'ERRAND_CREATED'
      ? 'Errand created'
      : notification.type === 'ERRAND_DELETED'
        ? 'Errand deleted'
        : `${STATUS_LABELS[notification.oldStatus]} → ${STATUS_LABELS[notification.newStatus]}`
  return (
    <NotificationCard
      title={notification.errandName}
      message={message}
      timestamp={notification.timestamp}
      onSelect={onSelect}
      onClose={onClose}
      confirmRemoval={confirmRemoval}
    />
  )
}
