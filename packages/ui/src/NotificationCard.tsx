import { useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CloseButton, GlassCard, RelayButton } from './components'

/** Shared presentation for both transient notifications and saved list entries. */
export function NotificationCard({
  title,
  message,
  timestamp,
  onSelect,
  onClose,
  confirmRemoval = false,
}: {
  title: string
  message: ReactNode
  timestamp: string
  onSelect: () => void
  onClose: () => void
  confirmRemoval?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const warningId = useId()
  const closeRef = useRef<HTMLDivElement>(null)
  return (
    <GlassCard
      as="section"
      className="relay-notification-card"
      aria-label={`${title} notification`}
    >
      <div className="relay-notification-close" ref={closeRef}>
        <CloseButton
          label={confirmRemoval ? `Remove notification for ${title}` : 'Dismiss notification'}
          onClick={() => (confirmRemoval ? setConfirming(true) : onClose())}
        />
      </div>
      <RelayButton
        type="button"
        variant="plain"
        className="relay-notification-content"
        aria-label={`Open ${title} details`}
        onClick={onSelect}
      >
        <strong>{title}</strong>
        <span>{message}</span>
        <time dateTime={timestamp}>
          {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
            new Date(timestamp),
          )}
        </time>
      </RelayButton>
      {confirming && (
        <div className="relay-notification-warning" role="alertdialog" aria-labelledby={warningId}>
          <p id={warningId}>Delete this notification? This cannot be undone.</p>
          <div className="relay-notification-actions">
            <RelayButton
              autoFocus
              variant="secondary"
              onClick={() => {
                setConfirming(false)
                closeRef.current?.querySelector('button')?.focus()
              }}
            >
              Cancel
            </RelayButton>
            <RelayButton variant="danger" onClick={onClose}>
              Delete notification
            </RelayButton>
          </div>
        </div>
      )}
    </GlassCard>
  )
}
