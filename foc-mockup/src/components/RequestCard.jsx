/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component RequestCard.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Dropped the venue-dependent location suffix now that qualifiedName always includes the supplier's location. No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review: Congchen
 */

import { useState } from 'react'
import { Star } from 'lucide-react'
import SupplierImage from './SupplierImage'
import StatusChip from './StatusChip'
import CreditPill from './CreditPill'
import Button from './Button'
import { getSupplier, qualifiedName } from '../data/suppliers'
import { getUser, firstName } from '../data/users'
import { expiryLabel, fullTime, completeByLabel } from '../data/requests'
import { useDemo } from '../context/DemoContext'

// Courier board row (Order F2.1 listing, F2.1.1 detail, F3.1 acceptance, F3.2 validation).
// Clicking the row expands it in place; there is no separate detail route.
export default function RequestCard({ request }) {
  const { isLoggedIn, currentUser, requireLogin, acceptRequest } = useDemo()
  const [expanded, setExpanded] = useState(false)

  const supplier = getSupplier(request.supplierId)
  const requester = getUser(request.requesterId)
  const isOwn = request.requesterId === currentUser.id
  const takenByOther = request.status !== 'open' && request.courierId !== currentUser.id
  const takenByMe = request.courierId === currentUser.id && request.status !== 'open'

  const onAccept = (e) => {
    e.stopPropagation()
    requireLogin('You need an account to accept an errand.', () => acceptRequest(request.id))
  }

  const acceptSlot = () => {
    if (takenByMe) {
      return (
        <Button size="sm" disabled className="w-full sm:w-auto">
          Accepted by you
        </Button>
      )
    }
    if (takenByOther) {
      return (
        <Button size="sm" disabled className="w-full sm:w-auto">
          Taken
        </Button>
      )
    }
    if (isOwn && isLoggedIn) {
      return (
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <Button size="sm" disabled className="w-full sm:w-auto">
            Your errand
          </Button>
          <span className="text-xs text-ink-40">You can&rsquo;t accept your own errand.</span>
        </div>
      )
    }
    return (
      <Button size="sm" className="w-full sm:w-auto" onClick={onAccept}>
        Accept
      </Button>
    )
  }

  return (
    <article
      className={
        'card overflow-hidden transition-opacity duration-150 ' +
        (takenByOther ? 'opacity-60' : '')
      }
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded((v) => !v)
          }
        }}
        className="flex w-full cursor-pointer gap-3 p-3 text-left sm:gap-4 sm:p-4"
      >
        {/* The status chip rides on the top of the thumbnail, so every chip in the list
            sits at the same x and y and the board can be read down the left edge. */}
        <div className="relative w-20 shrink-0 sm:w-[88px]">
          <SupplierImage supplier={supplier} ratio="aspect-square" rounded="rounded-[10px]" compact />
          <StatusChip
            status={request.status}
            size="sm"
            className="absolute left-1 top-1 shadow-nav"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 text-sm font-semibold text-ink">
              {qualifiedName(supplier)}
            </h3>
            {/* On mobile the pill sits beside the name; on desktop it moves right. */}
            <span className="shrink-0 sm:hidden">
              <CreditPill value={request.credits} size="sm" />
            </span>
          </div>

          <p className="mt-1.5 max-w-prose text-base text-ink">&ldquo;{request.description}&rdquo;</p>

          <p className="mt-1.5 text-sm text-ink-70">
            <span aria-hidden="true">&rarr;</span> {request.deliveryLocation}
            <span className="text-ink-40"> · {completeByLabel(request.completeBy)}</span>
          </p>
          {/* The second clock: how long this stays on the board if nobody takes it. */}
          {request.status === 'open' && (
            <p className="mt-0.5 text-sm text-ink-40">
              Offer {expiryLabel(request.expiresAt)}
            </p>
          )}

          <p className="mt-1 flex items-center gap-1 text-sm text-ink-40">
            Posted by {firstName(requester)} ·
            <Star size={12} className="fill-ink-40" aria-hidden="true" />
            <span className="tnum">{requester?.rating}</span>
          </p>
        </div>

        {/* Fixed width: otherwise an "Accept" vs "Taken" button resizes this column and
            nudges the status chips out of line down the list. */}
        <div className="hidden w-36 shrink-0 flex-col items-end justify-between gap-3 sm:flex">
          <CreditPill value={request.credits} size="sm" />
          <div onClick={(e) => e.stopPropagation()}>{acceptSlot()}</div>
        </div>
      </div>

      {expanded && (
        <div className="foc-fade border-t border-line bg-surface-alt px-3 py-3 sm:px-4">
          <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-ink-40">Additional details</dt>
              <dd className="text-ink-70">{request.notes || 'None given'}</dd>
            </div>
            <div>
              <dt className="text-ink-40">Deliver by</dt>
              <dd className="tnum text-ink-70">
                {request.completeBy ? fullTime(request.completeBy) : 'As soon as possible'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-40">Offer expires</dt>
              <dd className="tnum text-ink-70">{fullTime(request.expiresAt)}</dd>
            </div>
            <div>
              <dt className="text-ink-40">Requester</dt>
              <dd className="text-ink-70">
                {requester?.name} · <span className="tnum">{requester?.errandsCompleted}</span>{' '}
                errands completed
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* Mobile: the accept action is full width at the foot of the row. */}
      <div className="border-t border-line p-3 sm:hidden">{acceptSlot()}</div>
    </article>
  )
}
