/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Accessible confirmation dialog for errand actions, with the optional reject reason;
 *        focus and Escape handling follow ConfirmSupplierAction.
 * Author review: Reviewed and approved by @mattis.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { ActionCopy } from './presentation'
import { ERRAND_LIMITS } from './types'

interface ConfirmErrandActionProps {
  readonly copy: ActionCopy
  /** Ask for an optional reason (reject) */
  readonly withReason: boolean
  readonly busy: boolean
  readonly onCancel: () => void
  readonly onConfirm: (reason: string | undefined) => void
}

export function ConfirmErrandAction({ copy, withReason, busy, onCancel, onConfirm }: ConfirmErrandActionProps) {
  const headingId = useId()
  const bodyId = useId()
  const reasonId = useId()
  const [reason, setReason] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (withReason) reasonRef.current?.focus()
    else cancelRef.current?.focus()
    return () => priorFocus?.focus()
  }, [withReason])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, onCancel])

  const confirmClass =
    copy.tone === 'danger' ? 'bg-red-700 hover:bg-red-800' : 'bg-navy-800 hover:bg-navy-700'
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={bodyId}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 id={headingId} className="text-xl font-bold text-navy-900">
          {copy.confirmTitle}
        </h2>
        <p id={bodyId} className="mt-3 text-sm leading-6 text-slate-600">
          {copy.confirmBody}
        </p>
        {withReason && (
          <div className="mt-4 space-y-1">
            <label htmlFor={reasonId} className="block text-sm font-medium text-navy-900">
              What went wrong? <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              ref={reasonRef}
              id={reasonId}
              value={reason}
              maxLength={ERRAND_LIMITS.maxReason}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-100"
            />
            <p className="text-right text-xs text-slate-500">
              {reason.length}/{ERRAND_LIMITS.maxReason}
            </p>
          </div>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 font-semibold text-navy-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Go back
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(reason.trim() || undefined)}
            className={`min-h-11 rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-50 ${confirmClass}`}
          >
            {busy ? 'Working…' : copy.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
