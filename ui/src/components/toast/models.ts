export type ToastType = 'error' | 'success' | 'neutral'

export type ToastMessage = {
  durationMs: number | null
  id: number
  message: string
  type: ToastType
}

export type ToastContainerProps = {
  toasts: ToastMessage[]
  onDismiss: (id: number) => void
}

export type ToastContextValue = {
  showErrorToast: (message: string) => void
  showNeutralToast: (message: string) => () => void
  showSuccessToast: (message: string) => void
}
