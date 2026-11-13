import { Toast } from '@base-ui/react/toast'
import type { ReactNode } from 'react'
import styles from './ToastProvider.module.scss'

type ToastType = 'success' | 'info' | 'warning' | 'error'

const iconPaths: Record<ToastType, string> = {
  success: 'M6 12.5l4 4 8-9',
  info: 'M12 11v6M12 7.5v.01',
  warning: 'M12 7v6M12 16.5v.01',
  error: 'M8 8l8 8M16 8l-8 8',
}

const toToastType = (type: string | undefined): ToastType =>
  type && type in iconPaths ? (type as ToastType) : 'info'

const ToastIcon = ({ type }: { type: ToastType }) => (
  <span className={styles.icon} aria-hidden="true">
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path
        d={iconPaths[type]}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
)

const ToastList = () => {
  const { toasts } = Toast.useToastManager()
  return toasts.map((toast) => {
    const type = toToastType(toast.type)
    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        className={styles.toast}
        data-variant={type}
      >
        <Toast.Content className={styles.content}>
          <ToastIcon type={type} />
          <div className={styles.text}>
            <Toast.Title className={styles.title} />
            <Toast.Description className={styles.description} />
          </div>
          <Toast.Close className={styles.close} aria-label="Dismiss">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M7 7l10 10M17 7L7 17"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </Toast.Close>
        </Toast.Content>
      </Toast.Root>
    )
  })
}

/**
 * Toast type: 'success', 'info', 'warning', 'error'
 */
export const ToastProvider = ({ children }: { children: ReactNode }) => (
  <Toast.Provider>
    {children}
    <Toast.Portal>
      <Toast.Viewport className={styles.viewport}>
        <ToastList />
      </Toast.Viewport>
    </Toast.Portal>
  </Toast.Provider>
)
