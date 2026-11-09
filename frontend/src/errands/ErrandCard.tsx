/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Errand summary card used by the open-errands and my-errands lists, with an item count
 *        and an optional action (the board's Accept button) beside the link to the detail.
 * Author review: Reviewed and approved by @mattis.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ErrandStateBadge } from './ErrandStateBadge'
import {
  activeDeadline,
  formatCredits,
  formatDateTime,
  formatItemCount,
  formatItemsSummary,
  formatRelative,
} from './presentation'
import type { Errand } from './types'

const DEADLINE_LABELS = {
  reservationDeadline: 'Reservation due',
  listingDeadline: 'Accept by',
  pickupDeadline: 'Pick up by',
  deliveryDeadline: 'Deliver by',
  confirmDeadline: 'Confirm by',
} as const

interface ErrandCardProps {
  readonly errand: Errand
  /** Where the detail page's back link should return to */
  readonly from: string
  /** Show the state badge (not needed on the open list, where everything is OPEN) */
  readonly showState?: boolean
  /** A control shown under the card's link, e.g. an Accept button. A button may not sit inside a link. */
  readonly action?: ReactNode
}

export function ErrandCard({ errand, from, showState = true, action }: ErrandCardProps) {
  const deadlineField = activeDeadline(errand.state)
  const deadline = deadlineField ? errand[deadlineField] : null

  return (
    <li className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-navy-700 hover:shadow-md">
      <Link
        to={`/errands/${errand.id}`}
        state={{ from }}
        className="group flex min-w-0 flex-1 flex-col rounded-2xl p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
              {errand.supplierBuildingCode}
            </p>
            <h3 className="mt-1 break-words text-lg font-bold text-navy-900 group-hover:text-navy-700">
              {errand.supplierName}
            </h3>
          </div>
          <span className="shrink-0 rounded-lg bg-accent-500/10 px-2.5 py-1 text-sm font-bold text-accent-600">
            {formatCredits(errand.creditAmount)}
          </span>
        </div>

        <p className="mt-3 text-sm text-slate-700">
          <span className="font-semibold text-navy-900">{formatItemCount(errand.items)}</span>
          <span className="text-slate-400" aria-hidden="true">
            {' · '}
          </span>
          <span className="line-clamp-2 inline break-words">{formatItemsSummary(errand.items)}</span>
        </p>

        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex min-w-0 gap-2">
            <dt className="shrink-0 font-semibold text-navy-900">Drop-off</dt>
            <dd className="min-w-0 truncate text-slate-600">{errand.dropoffLocation}</dd>
          </div>
          {deadline && deadlineField && (
            <div className="flex min-w-0 flex-wrap gap-x-2">
              <dt className="shrink-0 font-semibold text-navy-900">{DEADLINE_LABELS[deadlineField]}</dt>
              <dd className="text-slate-600">
                {formatDateTime(deadline)} <span className="text-slate-500">({formatRelative(deadline)})</span>
              </dd>
            </div>
          )}
        </dl>

        {showState && (
          <div className="mt-auto flex items-center justify-between gap-2 pt-4">
            <ErrandStateBadge state={errand.state} />
            <span className="text-xs text-slate-500">Posted {formatRelative(errand.createdAt)}</span>
          </div>
        )}
      </Link>
      {action && <div className="border-t border-slate-100 px-5 py-3">{action}</div>}
    </li>
  )
}
