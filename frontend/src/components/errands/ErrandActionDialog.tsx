/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-07
 * Scope (AI-17): Wired and tested the existing pickup and receipt actions.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'

export type ErrandAction = 'cancel' | 'deliver' | 'complete' | 'fail'

type ErrandActionDialogProps = {
  action: ErrandAction
  errandName: string
  isSubmitting: boolean
  errorMessage: string | null
  onClose: () => void
  onConfirm: (failureReason?: string) => void
}

const actionContent: Record<
  ErrandAction,
  { title: string; description: string; confirmLabel: string; confirmClassName: string }
> = {
  cancel: {
    title: 'Cancel this errand?',
    description: 'Cancelling closes the request and returns the reserved credits to you.',
    confirmLabel: 'Cancel errand',
    confirmClassName: 'bg-[#a33a32] text-white hover:bg-[#842e28]',
  },
  deliver: {
    title: 'Mark this errand ready for pickup?',
    description: 'Confirm once the items are at the agreed delivery location and ready for the requester to collect.',
    confirmLabel: 'Mark ready for pickup',
    confirmClassName: 'bg-[#d8f06b] text-[#0d3c2d] hover:bg-[#cce85b]',
  },
  complete: {
    title: 'Confirm receipt?',
    description: 'Confirm once you have received the items. This transfers the reserved credits to the courier.',
    confirmLabel: 'Confirm receipt',
    confirmClassName: 'bg-[#d8f06b] text-[#0d3c2d] hover:bg-[#cce85b]',
  },
  fail: {
    title: 'Report a problem',
    description: 'Tell us what went wrong. Reporting a problem closes the errand and returns the reserved credits to you.',
    confirmLabel: 'Report problem',
    confirmClassName: 'bg-[#a33a32] text-white hover:bg-[#842e28]',
  },
}

export function ErrandActionDialog({
  action,
  errandName,
  isSubmitting,
  errorMessage,
  onClose,
  onConfirm,
}: ErrandActionDialogProps) {
  const [failureReason, setFailureReason] = useState('')
  const [error, setError] = useState('')
  const content = actionContent[action]
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = failureReason.trim()

    if (action === 'fail' && !reason) {
      setError('Enter a reason for reporting this errand.')
      return
    }

    onConfirm(action === 'fail' ? reason : undefined)
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#17211d]/45 p-4" role="presentation">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="errand-action-title"
        aria-describedby="errand-action-description"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !isSubmitting) onClose()
        }}
        className="w-full max-w-md rounded-[18px] border border-[#dde3de] bg-white p-5 shadow-[0_24px_64px_rgba(13,60,45,0.22)] sm:p-6"
      >
        <h2 id="errand-action-title" className="text-xl font-medium text-[#17211d]">
          {content.title}
        </h2>
        <p id="errand-action-description" className="mt-2 text-sm leading-6 text-[#68736c]">
          {content.description}
        </p>
        <p className="mt-3 rounded-lg bg-[#f5f7f4] px-3 py-2 text-sm font-medium text-[#28332d]">
          {errandName}
        </p>

        <form className="mt-5" onSubmit={handleSubmit} noValidate>
          {action === 'fail' ? (
            <div>
              <label htmlFor="failure-reason" className="text-sm font-medium text-[#28332d]">
                What went wrong? <span className="text-[#a33a32]">*</span>
              </label>
              <textarea
                id="failure-reason"
                value={failureReason}
                maxLength={280}
                disabled={isSubmitting}
                onChange={(event) => {
                  setFailureReason(event.target.value)
                  setError('')
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'failure-reason-error' : 'failure-reason-count'}
                className="mt-2 min-h-28 w-full resize-y rounded-xl border border-[#dde3de] bg-white px-3.5 py-3 text-sm text-[#17211d] outline-none transition placeholder:text-[#929c95] focus:border-[#175c45] focus:ring-4 focus:ring-[#175c45]/10 aria-invalid:border-[#d92d20]"
                placeholder="e.g. The requested items were unavailable"
              />
              <div className="mt-1.5 flex justify-between gap-3 text-xs">
                {error ? (
                  <p id="failure-reason-error" className="text-[#a33a32]" role="alert">
                    {error}
                  </p>
                ) : (
                  <span />
                )}
                <p id="failure-reason-count" className="shrink-0 text-[#7b867f]">
                  {failureReason.length}/280
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-11 cursor-pointer rounded-lg border border-[#bdc8c0] bg-white px-4 text-sm font-semibold text-[#28332d] transition hover:bg-[#f5f7f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Go back
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`h-11 cursor-pointer rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45] disabled:cursor-not-allowed disabled:opacity-60 ${content.confirmClassName}`}
            >
              {isSubmitting ? 'Updating…' : content.confirmLabel}
            </button>
          </div>

          {errorMessage ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </form>
      </section>
    </div>
  )
}

