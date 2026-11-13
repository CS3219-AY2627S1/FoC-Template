import type { ToastContainerProps, ToastType } from './models'
import styles from './ToastContainer.module.css'

const toastStyles: Record<ToastType, string> = {
  error: styles.error,
  neutral: styles.neutral,
  success: styles.success,
}

const toastSymbols: Record<ToastType, string> = {
  error: '!',
  neutral: 'i',
  success: '✓',
}

const ToastContainer = ({ toasts, onDismiss }: ToastContainerProps) => {
  if (toasts.length === 0) return null

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <div
          className={`${styles.toast} ${toastStyles[toast.type]}`}
          key={toast.id}
          role={toast.type === 'error' ? 'alert' : 'status'}
        >
          <span className={styles.symbol} aria-hidden="true">{toastSymbols[toast.type]}</span>
          <span className={styles.message}>{toast.message}</span>
          <button
            className={styles.dismiss}
            type="button"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ))}
    </div>
  )
}

export default ToastContainer
