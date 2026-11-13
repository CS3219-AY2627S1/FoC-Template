import { useEffect, useRef, type ReactNode } from 'react'
import { CircleAlert, Info } from 'lucide-react'
import { Button } from './DirectoryControls'
import styles from './ConfirmationDialog.module.css'

interface ConfirmationDialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  pending?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmationDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  pending = false,
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    cancelButton.current?.focus()
    return () => previouslyFocused?.focus()
  }, [])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onCancel()
      if (event.key === 'Tab') {
        const controls = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="dialog"] button:not(:disabled)',
          ),
        )
        const first = controls[0]
        const last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [onCancel, pending])

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        aria-labelledby="confirmation-title"
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
      >
        <div className={`${styles.heading} ${danger ? styles.danger : ''}`}>
          <span aria-hidden="true">{danger ? <CircleAlert /> : <Info />}</span>
          <h2 id="confirmation-title">{title}</h2>
        </div>
        <div className={styles.content}>{children}</div>
        <div className={styles.actions}>
          <button
            className={styles.cancel}
            disabled={pending}
            onClick={onCancel}
            ref={cancelButton}
            type="button"
          >
            Cancel
          </button>
          <Button
            disabled={pending}
            onClick={onConfirm}
            variant={danger ? 'danger' : 'primary'}
          >
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  )
}
