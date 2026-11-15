/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: The author's pop-up for suspend/restore/role changes: a reason field and Confirm,
 *        modelled on the Supplier archive confirmation; the server's error is shown inside it.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { REASON_MAX } from './types'
import { errorText } from './errors'

interface ReasonDialogProps {
  readonly title: string
  readonly description: string
  readonly confirmLabel: string
  readonly tone: 'danger' | 'safe' | 'neutral'
  /** Suspend/restore need a reason; a role change may have one */
  readonly reasonRequired: boolean
  readonly onCancel: () => void
  /** Resolve to close the dialog; reject to show the error and keep it open */
  readonly onConfirm: (reason: string) => Promise<void>
}

const TONES = {
  danger: 'bg-red-700 hover:bg-red-800',
  safe: 'bg-emerald-700 hover:bg-emerald-800',
  neutral: 'bg-navy-800 hover:bg-navy-700',
}

export function ReasonDialog({ title, description, confirmLabel, tone, reasonRequired, onCancel, onConfirm }: ReasonDialogProps) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const ids = useId()

  useEffect(() => {
    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    textRef.current?.focus()
    return () => priorFocus?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, onCancel])

  const trimmed = reason.trim()
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (reasonRequired && trimmed.length === 0) { setError('Please enter a reason.'); return }
    if (trimmed.length > REASON_MAX) { setError(`The reason must be at most ${REASON_MAX} characters.`); return }
    setBusy(true)
    setError(null)
    try {
      await onConfirm(trimmed)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
      <form
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-description`}
        noValidate
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 id={`${ids}-title`} className="text-xl font-bold text-navy-900">{title}</h2>
        <p id={`${ids}-description`} className="mt-3 text-sm text-slate-600">{description}</p>
        <label className="mt-4 block text-sm font-medium text-navy-900">
          {reasonRequired ? 'Reason' : 'Reason (optional)'}
          <textarea
            ref={textRef}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            disabled={busy}
            aria-invalid={error !== null}
            aria-describedby={`${ids}-count ${ids}-error`}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-navy-900"
          />
        </label>
        <p id={`${ids}-count`} className={`mt-1 text-right text-xs ${trimmed.length > REASON_MAX ? 'text-red-700' : 'text-slate-500'}`}>
          {trimmed.length}/{REASON_MAX}
        </p>
        <p id={`${ids}-error`} role={error ? 'alert' : undefined} className="mt-1 text-sm text-red-700">{error}</p>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-navy-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button type="submit" disabled={busy} className={`rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-50 ${TONES[tone]}`}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
