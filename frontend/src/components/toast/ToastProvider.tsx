/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Small non-intrusive toast notifications (author decision: toasts, no modal pop-ups).
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ToastContext, type ToastKind } from './toastContext'

interface Toast {
  id: number
  message: string
  kind: ToastKind
}

// How long each kind stays on screen before fading away (milliseconds)
const DURATION_MS: Record<ToastKind, number> = {
  info: 6000,
  success: 5000,
  warning: 10000,
  error: 8000,
}

const STYLE: Record<ToastKind, string> = {
  info: 'border-navy-700 bg-white text-navy-900',
  success: 'border-emerald-500 bg-emerald-50 text-emerald-900',
  warning: 'border-accent-500 bg-orange-50 text-orange-900',
  error: 'border-red-500 bg-red-50 text-red-900',
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = nextId++
      setToasts((current) => [...current, { id, message, kind }])
      setTimeout(() => dismiss(id), DURATION_MS[kind])
    },
    [dismiss],
  )

  const api = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border-l-4 px-4 py-3 text-sm shadow-lg ${STYLE[toast.kind]}`}
          >
            <p className="flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="text-slate-400 hover:text-slate-700"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
