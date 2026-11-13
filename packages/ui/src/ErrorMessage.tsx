export type MessageVariant = 'error' | 'warning' | 'info' | 'success'

export function ErrorMessage({
  message,
  variant = 'error',
  title,
  onDismiss,
}: {
  message: string
  variant?: MessageVariant
  title?: string
  onDismiss?: () => void
}) {
  if (!message) return null

  return (
    <div
      className={`relay-message relay-message-${variant}`}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      <div className="relay-message-content">
        {title && <strong>{title}</strong>}
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          className="relay-message-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss message"
        >
          ×
        </button>
      )}
    </div>
  )
}
