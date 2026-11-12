/*
 * AI Assistance Disclosure
 * Tool and date: GitHub Copilot Autofix (model unrecorded), 2026-10-22
 * Scope (AI-11): Fixed the Escape handler during errand submission.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import { useEffect, useRef } from 'react'
import creditIcon from '../../assets/errand-credit.svg'
import routeMarkers from '../../assets/errand-route.svg'
import type { ErrandDashboardItem } from '../../features/errands/errand.types'

type AcceptErrandDialogProps = {
  errand: ErrandDashboardItem
  isSubmitting: boolean
  errorMessage: string | null
  onClose: () => void
  onConfirm: () => void
}

export function AcceptErrandDialog({
  errand,
  isSubmitting,
  errorMessage,
  onClose,
  onConfirm,
}: AcceptErrandDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const destination = [
    errand.delivery_building_name,
    errand.delivery_floor ? `Level ${errand.delivery_floor}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#17211d]/45 p-4" role="presentation">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="accept-errand-title"
        aria-describedby="accept-errand-description"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !isSubmitting) onClose()
        }}
        className="w-full max-w-md rounded-[18px] border border-[#dde3de] bg-white p-5 shadow-[0_24px_64px_rgba(13,60,45,0.22)] sm:p-6"
      >
        <p className="text-xs font-medium tracking-[0.08em] text-[#175c45]">ACCEPT ERRAND</p>
        <h2 id="accept-errand-title" className="mt-2 text-xl font-medium text-[#17211d]">
          Ready to make this delivery?
        </h2>
        <p id="accept-errand-description" className="mt-2 text-sm leading-6 text-[#68736c]">
          Confirm that you can collect and deliver these items before the deadline.
        </p>

        <div className="mt-5 rounded-xl bg-[#f5f7f4] p-4">
          <p className="font-medium text-[#17211d]">{errand.required_item}</p>
          <div className="mt-3 flex gap-3 text-sm leading-6 text-[#28332d]">
            <img src={routeMarkers} alt="" width="16" height="24" className="mt-0.5 shrink-0" />
            <div>
              <p>{errand.supplier_name}</p>
              <p>{destination}</p>
            </div>
          </div>
          <p className="mt-3 flex w-fit items-center gap-1.5 rounded-full bg-[#ddf3e7] px-2.5 py-1.5 text-sm font-medium text-[#175c45]">
            <img src={creditIcon} alt="" width="14" height="14" />
            {errand.credit_value} credits
          </p>
        </div>

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
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="h-11 cursor-pointer rounded-lg bg-[#d8f06b] px-4 text-sm font-semibold text-[#0d3c2d] transition hover:bg-[#cce85b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45] disabled:cursor-not-allowed disabled:bg-[#e6eadf] disabled:text-[#929c95]"
          >
            {isSubmitting ? 'Accepting…' : 'Accept errand'}
          </button>
        </div>

        {errorMessage ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </section>
    </div>
  )
}

