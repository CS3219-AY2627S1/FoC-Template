/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component Activity.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bike, ShoppingBag } from 'lucide-react'
import SupplierImage from '../components/SupplierImage'
import StatusChip from '../components/StatusChip'
import CreditPill from '../components/CreditPill'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { useDemo } from '../context/DemoContext'
import { getSupplier, qualifiedName } from '../data/suppliers'
import { getUser, firstName } from '../data/users'
import { LIFECYCLE, LIFECYCLE_LABELS, clockTime, completeByShort } from '../data/requests'

const CLOSED = ['completed', 'cancelled', 'expired']
const ACTIVE = ['open', 'accepted', 'picked_up', 'delivered']
// A courier and a requester can only talk while the errand is still in flight.
const MESSAGEABLE = ['accepted', 'picked_up', 'delivered']
const ROLE_REQUESTER = 'You requested'
const ROLE_COURIER = 'You are delivering'

// Order F3.4.2 active requests, F5 cancellation, F6 editing, F1.4.1 / F4.1.3 credit outcomes.
export default function Activity() {
  const { requests, currentUser, role, setRequestStatus, isLoggedIn, requireLogin } = useDemo()

  // Gated when logged out (§9): the page stays visible behind the scrim.
  useEffect(() => {
    if (!isLoggedIn) requireLogin('You need an account to see your activity.')
  }, [isLoggedIn, requireLogin])
  const [tab, setTab] = useState(role === 'courier' ? 'deliveries' : 'errands')

  const mine = requests.filter((r) => r.requesterId === currentUser.id)
  const deliveries = requests.filter((r) => r.courierId === currentUser.id)
  const list = tab === 'errands' ? mine : deliveries
  const active = list.filter((r) => ACTIVE.includes(r.status))
  const history = list.filter((r) => CLOSED.includes(r.status))

  // One live item per tab; everything finished drops into History with no actions left on it.
  const section = (heading, items, asCourier, setStatus) =>
    items.length > 0 && (
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-40">{heading}</h2>
        <div className="mt-3 space-y-4">
          {items.map((request) => (
            <ActivityCard
              key={request.id}
              request={request}
              asCourier={asCourier}
              setRequestStatus={setStatus}
            />
          ))}
        </div>
      </section>
    )

  return (
    <div className="page-width page-gutter py-8 md:py-10">
      <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">My activity</h1>

      <div className="mt-6 flex w-full rounded-btn border border-line p-1 md:inline-flex md:w-auto">
        {[
          ['errands', 'My errands', mine.length],
          ['deliveries', 'My deliveries', deliveries.length],
        ].map(([value, text, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={
              'h-11 md:h-10 flex-1 rounded-[7px] px-4 text-sm font-medium transition-colors duration-150 md:flex-none ' +
              (tab === value ? 'bg-ink text-white' : 'text-ink-70 hover:text-ink')
            }
          >
            {text} <span className="tnum opacity-60">({count})</span>
          </button>
        ))}
      </div>

      {section('Active now', active, tab === 'deliveries', setRequestStatus)}
      {section('History', history, tab === 'deliveries', setRequestStatus)}

      {list.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title={tab === 'errands' ? 'No errands yet' : 'No deliveries yet'}
            body={
              tab === 'errands'
                ? 'Errands you post will show up here with their progress.'
                : 'Errands you accept will show up here.'
            }
          />
        </div>
      )}
    </div>
  )
}

function ActivityCard({ request, asCourier, setRequestStatus }) {
  const navigate = useNavigate()
  const supplier = getSupplier(request.supplierId)
  const other = getUser(asCourier ? request.requesterId : request.courierId)
  const dimmed = request.status === 'cancelled' || request.status === 'expired'
  const showTimeline = !CLOSED.includes(request.status)
  const canMessage = Boolean(request.courierId) && MESSAGEABLE.includes(request.status)

  const messageButton = canMessage && (
    <Button variant="secondary" size="sm" onClick={() => navigate('/chat/' + request.id)}>
      Message {firstName(other)}
    </Button>
  )

  const actions = () => {
    if (!asCourier) {
      if (request.status === 'open') {
        return (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">
              Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setRequestStatus(request.id, 'cancelled')}
            >
              Cancel errand
            </Button>
          </div>
        )
      }
      if (request.status === 'accepted' || request.status === 'picked_up') {
        return messageButton
      }
      if (request.status === 'delivered') {
        return (
          <div className="flex flex-col items-start gap-1.5">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setRequestStatus(request.id, 'completed')}>
                Confirm and release credits
              </Button>
              {messageButton}
            </div>
            <span className="text-sm text-ink-40">
              <span className="tnum">{request.credits}</span> credits will move to{' '}
              {firstName(other)} when you confirm.
            </span>
          </div>
        )
      }
      return null
    }

    if (request.status === 'accepted') {
      return (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setRequestStatus(request.id, 'picked_up')}>
            Mark picked up
          </Button>
          {messageButton}
        </div>
      )
    }
    if (request.status === 'picked_up') {
      return (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setRequestStatus(request.id, 'delivered')}>
            Mark delivered
          </Button>
          {messageButton}
        </div>
      )
    }
    if (request.status === 'delivered') {
      return (
        <div className="flex flex-wrap items-center gap-3">
          {messageButton}
          <span className="text-sm text-ink-40">Waiting for requester to confirm</span>
        </div>
      )
    }
    return null
  }

  return (
    <article
      className={
        /* Role is colour-coded on the left edge: blue = you asked for it,
           orange = you are running it. */
        'card border-l-[3px] p-4 ' +
        (asCourier ? 'border-l-orange ' : 'border-l-blue ') +
        (dimmed ? 'opacity-60' : '')
      }
    >
      <div className="flex gap-3 sm:gap-4">
        <div className="w-16 shrink-0 sm:w-[72px]">
          <SupplierImage supplier={supplier} ratio="aspect-square" rounded="rounded-[10px]" compact />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">{qualifiedName(supplier)}</h2>
            <StatusChip status={request.status} />
            <span className="inline-flex h-6 items-center gap-1 rounded-pill bg-surface-alt px-2.5 text-xs font-medium text-ink-70">
              {asCourier ? (
                <Bike size={12} aria-hidden="true" />
              ) : (
                <ShoppingBag size={12} aria-hidden="true" />
              )}
              {asCourier ? ROLE_COURIER : ROLE_REQUESTER}
            </span>
          </div>
          <p className="mt-1.5 max-w-prose text-base text-ink">{request.description}</p>
          <p className="mt-1 text-sm text-ink-40">
            <span aria-hidden="true">&rarr;</span> {request.deliveryLocation}
            {other && (asCourier ? ' · for ' + firstName(other) : ' · courier ' + firstName(other))}
          </p>
          {/* The delivery deadline stays visible for as long as the errand is live. */}
          {!CLOSED.includes(request.status) && (
            <p className="mt-1 text-sm text-ink-70">
              Deliver by <span className="tnum">{completeByShort(request.completeBy)}</span>
            </p>
          )}

          {dimmed && (
            <p className="mt-1.5 text-sm text-ink-40">
              <span className="tnum">{request.credits}</span> credits returned to your balance.
            </p>
          )}
        </div>

        <div className="shrink-0">
          <CreditPill value={request.credits} size="sm" />
        </div>
      </div>

      {showTimeline && <Timeline request={request} />}

      {actions() && <div className="mt-4 border-t border-line pt-4">{actions()}</div>}
    </article>
  )
}

function Timeline({ request }) {
  const currentIndex = LIFECYCLE.indexOf(request.status)

  return (
    <div className="mt-4 border-t border-line pt-4">
      {/* Desktop: horizontal. Mobile: the same steps rotate to a vertical rail. */}
      {/* All steps share a width so each connector spans exactly one dot-to-dot gap.
          With an uneven last cell the final connector overshoots the card. */}
      <ol className="hidden sm:flex">
        {LIFECYCLE.map((step, i) => {
          const done = i < currentIndex
          const current = i === currentIndex
          const stamp = request.timeline?.[step]
          return (
            <li key={step} className="relative flex flex-1 flex-col items-center">
              {i < LIFECYCLE.length - 1 && (
                <span
                  className={
                    'absolute left-1/2 top-[5px] h-0.5 w-full ' + (done ? 'bg-ink' : 'bg-line')
                  }
                  aria-hidden="true"
                />
              )}
              <span
                className={
                  'relative z-10 h-3 w-3 rounded-pill ' +
                  (done
                    ? 'bg-ink'
                    : current
                      ? 'bg-surface ring-2 ring-orange'
                      : 'border border-line bg-surface')
                }
                aria-hidden="true"
              />
              <span
                className={
                  'mt-2 text-center text-xs ' + (done || current ? 'text-ink-70' : 'text-ink-40')
                }
              >
                {LIFECYCLE_LABELS[step]}
              </span>
              <span className="tnum mt-0.5 h-4 text-center text-xs text-ink-40">
                {stamp ? clockTime(stamp) : ''}
              </span>
            </li>
          )
        })}
      </ol>

      <ol className="sm:hidden">
        {LIFECYCLE.map((step, i) => {
          const done = i < currentIndex
          const current = i === currentIndex
          const stamp = request.timeline?.[step]
          return (
            <li key={step} className="relative flex gap-3 pb-3 last:pb-0">
              {i < LIFECYCLE.length - 1 && (
                <span
                  className={
                    'absolute left-[5px] top-3 h-full w-0.5 ' + (done ? 'bg-ink' : 'bg-line')
                  }
                  aria-hidden="true"
                />
              )}
              <span
                className={
                  'relative z-10 mt-1 h-3 w-3 shrink-0 rounded-pill ' +
                  (done
                    ? 'bg-ink'
                    : current
                      ? 'bg-surface ring-2 ring-orange'
                      : 'border border-line bg-surface')
                }
                aria-hidden="true"
              />
              <span className="flex flex-1 items-baseline justify-between gap-3">
                <span className={'text-sm ' + (done || current ? 'text-ink-70' : 'text-ink-40')}>
                  {LIFECYCLE_LABELS[step]}
                </span>
                <span className="tnum text-xs text-ink-40">{stamp ? clockTime(stamp) : ''}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
