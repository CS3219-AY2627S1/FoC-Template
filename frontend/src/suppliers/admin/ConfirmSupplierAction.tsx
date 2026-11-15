/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added accessible archive and restore confirmation UI for issue #30.
 * Author review: Reviewed and approved by @ron.
 */
import { useEffect, useRef } from 'react'
import type { Supplier } from '../types'

interface ConfirmSupplierActionProps {
  readonly supplier: Supplier
  readonly action: 'archive' | 'restore'
  readonly busy: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

export function ConfirmSupplierAction({
  supplier,
  action,
  busy,
  onCancel,
  onConfirm,
}: ConfirmSupplierActionProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    return () => priorFocus?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, onCancel])

  const isArchive = action === 'archive'
  const headingId = `confirm-${action}-title`
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 id={headingId} className="text-xl font-bold text-navy-900">
          {isArchive ? 'Archive Supplier?' : 'Restore Supplier?'}
        </h2>
        <p className="mt-3 text-sm text-slate-600">
          {isArchive
            ? `${supplier.name} will disappear from the member catalogue, but its record and ID will be retained.`
            : `${supplier.name} will return to the member catalogue with the same ID.`}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-navy-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-50 ${
              isArchive ? 'bg-red-700 hover:bg-red-800' : 'bg-emerald-700 hover:bg-emerald-800'
            }`}
          >
            {busy ? 'Saving…' : isArchive ? 'Archive Supplier' : 'Restore Supplier'}
          </button>
        </div>
      </section>
    </div>
  )
}
