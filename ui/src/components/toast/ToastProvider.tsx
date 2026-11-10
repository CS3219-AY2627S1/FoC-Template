import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import ToastContainer from './ToastContainer'
import { ToastContext } from './ToastContext'
import type { ToastContextValue, ToastMessage, ToastType } from './models'
import styles from './ToastProvider.module.css'

const TOAST_DURATION_MS: Record<ToastType, number | null> = {
  error: 8000,
  neutral: null,
  success: 3500,
}

export const ToastProvider = ({ children }: PropsWithChildren) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const nextToastId = useRef(0)
  const toastTimeouts = useRef(new Map<number, number>())

  const dismissToast = useCallback((id: number) => {
    const timeout = toastTimeouts.current.get(id)
    if (timeout !== undefined) {
      window.clearTimeout(timeout)
      toastTimeouts.current.delete(id)
    }
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((message: string, type: ToastType) => {
    nextToastId.current += 1
    const id = nextToastId.current
    const durationMs = TOAST_DURATION_MS[type]
    const normalizedMessage = message.trim() || 'Something went wrong. Please try again.'

    setToasts((currentToasts) => [...currentToasts, { durationMs, id, message: normalizedMessage, type }])
    if (durationMs !== null) {
      const timeout = window.setTimeout(() => dismissToast(id), durationMs)
      toastTimeouts.current.set(id, timeout)
    }
    return id
  }, [dismissToast])

  useEffect(() => {
    const timeouts = toastTimeouts.current
    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout))
      timeouts.clear()
    }
  }, [])

  const contextValue = useMemo<ToastContextValue>(() => ({
    showErrorToast: (message) => {
      showToast(message, 'error')
    },
    showNeutralToast: (message) => {
      const id = showToast(message, 'neutral')
      return () => dismissToast(id)
    },
    showSuccessToast: (message) => {
      showToast(message, 'success')
    },
  }), [dismissToast, showToast])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className={styles.notificationStack}>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </ToastContext.Provider>
  )
}
