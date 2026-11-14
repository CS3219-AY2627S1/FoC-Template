/*
 * AI Assistance Disclosure:
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented precise delivery details per the team spec.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component RequestCard.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: <pending — team member to sign>
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Dropped the venue-dependent location suffix now that qualifiedName always includes the supplier's location. No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review: Congchen
 *
 * Tool: Copilot SDK (model: unspecified by runtime), date: 2026-10-16
 * Scope: Kept the existing card compatible with order-service records by using explicit fallbacks
 *        for cross-service supplier and requester data, and mapped additionalDetails to notes.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 *
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Order Service frontend integration - Accept calls POST /orders/:id/accept and shows the
 *        rejection (403 own errand, 409 taken / expired / conflict); supplier, requester name and
 *        delivery location resolve from their ids through the Supplier and User Services; the
 *        signed-in user comes from the session instead of the demo user.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Rebased onto PR #115. George chose to keep this implementation, so the
 *        version of this file described in Wen Xi's entries above was replaced.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Reads isLoggedIn/the signed-in user from the new AuthContext instead of DemoContext,
 *        and requireLogin replaced with requireAuth, per instructions.md Stage 16b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { useState } from 'react'
import SupplierImage from './SupplierImage'
import StatusChip from './StatusChip'
import CreditPill from './CreditPill'
import Button from './Button'
import { qualifiedName } from '../data/suppliers'
import { expiryLabel, fullTime, completeByLabel } from '../data/requests'
import { useAuth } from '../context/AuthContext'
import { acceptOrder, orderErrorMessage } from '../api/orders'
import { useSupplier, useUserName } from '../api/lookups'

// Courier board row (Order F2.1 listing, F2.1.1 detail, F3.1 acceptance, F3.2 validation).
// Clicking the row expands it in place; there is no separate detail route.
// `locationName` resolves the delivery location id; `onAccepted(order)` receives the accepted order.
export default function RequestCard({ request, locationName, onAccepted }) {
  const { isLoggedIn, user, requireAuth } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState(null)

  const userId = user?.id
  const supplier = useSupplier(request.supplierId)
  const requesterUsername = useUserName(request.requesterId)
  const isOwn = request.requesterId === userId
  const takenByMe = request.status !== 'open' && request.courierId === userId
  const takenByOther = request.status !== 'open' && !takenByMe
  const supplierName = qualifiedName(supplier) || `Supplier #${request.supplierId}`
  const requesterName = requesterUsername || `User ${request.requesterId.slice(-6)}`
  const notes = request.notes ?? request.additionalDetails

  const accept = async () => {
    setAccepting(true)
    setAcceptError(null)
    try {
      const { order } = await acceptOrder(request.id)
      onAccepted?.(order)
    } catch (err) {
      setAcceptError(orderErrorMessage(err, 'accept'))
    } finally {
      setAccepting(false)
    }
  }

  const onAccept = (e) => {
    e.stopPropagation()
    requireAuth('You need an account to accept an errand.', accept)
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
      <div className="flex flex-col items-stretch gap-1 sm:items-end">
        <Button size="sm" className="w-full sm:w-auto" disabled={accepting} onClick={onAccept}>
          {accepting ? 'Accepting…' : 'Accept'}
        </Button>
        {acceptError && (
          <span role="alert" className="text-xs text-alert sm:text-right">
            {acceptError}
          </span>
        )}
      </div>
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
              {supplierName}
            </h3>
            {/* On mobile the pill sits beside the name; on desktop it moves right. */}
            <span className="shrink-0 sm:hidden">
              <CreditPill value={request.credits} size="sm" />
            </span>
          </div>

          <p className="mt-1.5 max-w-prose text-base text-ink">&ldquo;{request.description}&rdquo;</p>

          <p className="mt-1.5 text-sm text-ink-70">
            <span aria-hidden="true">&rarr;</span> {locationName}
            <span className="text-ink-40"> · {completeByLabel(request.completeBy)}</span>
            {request.deliveryDetails !== undefined && <span className="block">{request.deliveryDetails}</span>}
          </p>
          {/* The second clock: how long this stays on the board if nobody takes it. */}
          {request.status === 'open' && request.completeBy && (
            <p className="mt-0.5 text-sm text-ink-40">
              Deadline {expiryLabel(request.completeBy)}
            </p>
          )}

          <p className="mt-1 text-sm text-ink-40">Posted by {requesterName}</p>
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
              <dd className="text-ink-70">{notes || 'None given'}</dd>
            </div>
            <div>
              <dt className="text-ink-40">Deliver by</dt>
              <dd className="tnum text-ink-70">
                {request.completeBy ? fullTime(request.completeBy) : 'As soon as possible'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-40">Posted</dt>
              <dd className="tnum text-ink-70">
                {request.createdAt ? fullTime(request.createdAt) : 'Not specified'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-40">Requester</dt>
              <dd className="text-ink-70">{requesterName}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Mobile: the accept action is full width at the foot of the row. */}
      <div className="border-t border-line p-3 sm:hidden">{acceptSlot()}</div>
    </article>
  )
}
