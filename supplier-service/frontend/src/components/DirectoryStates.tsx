import { Button } from './DirectoryControls'
import styles from './DirectoryComponents.module.css'

export function SupplierCardSkeletons() {
  return (
    <div aria-label="Loading campus locations" className={styles.skeletonGrid}>
      {Array.from({ length: 6 }, (_, index) => (
        <div aria-hidden="true" className={styles.skeletonCard} key={index}>
          <span className={styles.skeletonTitle} />
          <span />
          <span />
          <span className={styles.skeletonLink} />
        </div>
      ))}
    </div>
  )
}

interface StatePanelProps {
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
  tone?: 'neutral' | 'error' | 'info'
}

export function StatePanel({
  title,
  message,
  actionLabel,
  onAction,
  tone = 'neutral',
}: StatePanelProps) {
  const className =
    tone === 'error'
      ? styles.errorPanel
      : tone === 'info'
        ? styles.infoPanel
        : styles.statePanel

  return (
    <section
      className={className}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <h2>{title}</h2>
      <p>{message}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="secondary">
          {actionLabel}
        </Button>
      )}
    </section>
  )
}
