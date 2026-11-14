/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Created the toast provider and useToast() hook, per instructions.md Stage 16b (16a's
 *        survey found no existing toast/banner component to reuse). Positioned top-right so it
 *        never collides with ChatBubble (bottom-right) or DemoControls (bottom-left).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const TONES = {
  info: { icon: Info, border: 'border-line', icon_color: 'text-ink-70' },
  success: { icon: CheckCircle2, border: 'border-blue', icon_color: 'text-blue' },
  error: { icon: AlertCircle, border: 'border-alert', icon_color: 'text-alert' },
}

const DURATION_MS = 4000

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message, type = 'info') => {
      const id = ++nextId.current
      setToasts((prev) => [...prev, { id, message, type }])
      setTimeout(() => dismiss(id), DURATION_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-20 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const tone = TONES[t.type] ?? TONES.info
          const Icon = tone.icon
          return (
            <div
              key={t.id}
              role="status"
              className={
                'foc-fade flex items-start gap-2.5 rounded-card border bg-surface p-3 shadow-modal ' +
                tone.border
              }
            >
              <Icon size={18} className={'mt-0.5 shrink-0 ' + tone.icon_color} aria-hidden="true" />
              <p className="flex-1 text-sm text-ink">{t.message}</p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-ink-40 hover:text-ink"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
