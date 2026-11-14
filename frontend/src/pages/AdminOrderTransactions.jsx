/*
 * AI Assistance Disclosure:
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented precise delivery details per the team spec.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Created the admin order-history page, per instructions.md Stage 24 (F5.3.2): the full
 *        order record plus its credit transactions for one errand. An order that is missing or
 *        does not involve the viewed user takes over the whole page ("Order not found"); the
 *        transactions list is its own section and fails/retries on its own. Colour/sign for the
 *        credits in the transaction list follows credits.js's describe() (held/returned for
 *        reservation and release, signed for transfer), same as Wallet.jsx.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { ArrowDown, ArrowUp, Ban, RotateCcw } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../api/useApi'
import { getOrder } from '../api/orders'
import { listOrderTransactions } from '../api/credits'
import { useLocationNames, useSupplier, useUserName } from '../api/lookups'

const ICONS = { in: ArrowDown, out: ArrowUp, hold: Ban, return: RotateCcw }

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Delta({ direction, delta, amount }) {
  if (direction === 'hold' || direction === 'return') {
    return <span className="tnum text-sm text-ink-40">{direction === 'hold' ? 'held' : 'returned'}</span>
  }
  return (
    <span className={'tnum text-sm font-semibold ' + (delta > 0 ? 'text-blue' : 'text-alert')}>
      {delta > 0 ? '+' : '−'}
      {Math.abs(delta) || amount}
    </span>
  )
}

function SectionError({ error, onRetry, what }) {
  return (
    <EmptyState
      title={error.status === 403 ? 'You do not have access to this' : 'Could not load ' + what}
      body={error.message}
      action={
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  )
}

function NamedUser({ id }) {
  const name = useUserName(id)
  return <>{name || 'User ' + id.slice(-6)}</>
}

export default function AdminOrderTransactions() {
  const { userId, requestId } = useParams()
  const navigate = useNavigate()
  const { sessionReady, isLoggedIn, requireAuth } = useAuth()

  const {
    data: order,
    error: orderError,
    loading: orderLoading,
    reload: reloadOrder,
  } = useApi(() => getOrder(requestId), [requestId])

  // null (not yet known) | true | false. Transactions are fetched independently (credit-service
  // doesn't need the order object), so an order-service outage only takes down the order
  // section, per the stage's "Section failures" rule - not the transactions section below it.
  const involvesUser = order ? order.requesterId === userId || order.courierId === userId : null

  const {
    data: transactions,
    error: txError,
    loading: txLoading,
    reload: reloadTx,
  } = useApi(() => listOrderTransactions(requestId, userId), [requestId, userId])

  const supplier = useSupplier(order?.supplierId)
  const locationName = useLocationNames()
  const supplierName = order ? supplier?.name || 'Supplier ' + order.supplierId : null

  const notFound = orderError?.status === 404 || involvesUser === false

  if (!sessionReady) {
    return (
      <div className="page-width page-gutter py-8 md:py-10">
        <p className="text-sm text-ink-40">Loading order…</p>
      </div>
    )
  }
  if (!isLoggedIn) {
    return (
      <div className="page-width page-gutter py-8 md:py-10">
        <EmptyState
          title="Log in to see this order"
          body="This page needs an account."
          action={
            <Button size="sm" onClick={() => requireAuth('Log in to see this order.')}>
              Log in
            </Button>
          }
        />
      </div>
    )
  }
  if (notFound) {
    return (
      <div className="page-width page-gutter py-8 md:py-10">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate('/admin/user-transactions/' + userId)}
        >
          ← Back to user
        </Button>
        <div className="mt-6">
          <EmptyState
            title="Order not found"
            body="This order does not exist, or does not belong to this user."
          />
        </div>
      </div>
    )
  }

  return (
    <div className="page-width page-gutter py-8 md:py-10">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => navigate('/admin/user-transactions/' + userId)}
      >
        ← Back to user
      </Button>

      <h1 className="mt-4 font-display text-2xl font-bold text-ink md:text-3xl">
        {order ? 'Errand ' + order.id.slice(0, 8) : 'Errand'}
      </h1>

      {orderLoading && !order && <p className="mt-6 text-sm text-ink-40">Loading order…</p>}

      {orderError && (
        <div className="mt-6">
          <SectionError error={orderError} onRetry={reloadOrder} what="the order" />
        </div>
      )}

      {order && (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-ink-40">Requester</dt>
            <dd className="text-ink-70">
              <NamedUser id={order.requesterId} />
            </dd>
          </div>
          <div>
            <dt className="text-ink-40">Courier</dt>
            <dd className="text-ink-70">
              {order.courierId ? <NamedUser id={order.courierId} /> : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-ink-40">Supplier</dt>
            <dd className="text-ink-70">{supplierName}</dd>
          </div>
          <div>
            <dt className="text-ink-40">Delivery location</dt>
            <dd className="text-ink-70">{locationName(order.deliveryLocationId)}{order.deliveryDetails !== undefined && <span className="block">{order.deliveryDetails}</span>}</dd>
          </div>
          <div>
            <dt className="text-ink-40">Credits</dt>
            <dd className="tnum text-ink-70">{order.credits}</dd>
          </div>
          <div>
            <dt className="text-ink-40">Status</dt>
            <dd className="text-ink-70">{order.status.replace('_', ' ')}</dd>
          </div>
          <div>
            <dt className="text-ink-40">Complete by</dt>
            <dd className="text-ink-70">{formatDateTime(order.completeBy)}</dd>
          </div>
          <div className="sm:col-span-3">
            <dt className="text-ink-40">Description</dt>
            <dd className="text-ink-70">{order.description || '—'}</dd>
          </div>
          <div className="sm:col-span-3">
            <dt className="text-ink-40">Additional details</dt>
            <dd className="text-ink-70">{order.additionalDetails || '—'}</dd>
          </div>
          <div>
            <dt className="text-ink-40">Created</dt>
            <dd className="text-ink-70">{formatDateTime(order.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-40">Updated</dt>
            <dd className="text-ink-70">{formatDateTime(order.updatedAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-40">Accepted</dt>
            <dd className="text-ink-70">{formatDateTime(order.acceptedAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-40">Delivered</dt>
            <dd className="text-ink-70">{formatDateTime(order.deliveredAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-40">Credit released</dt>
            <dd className="text-ink-70">{formatDateTime(order.creditReleasedAt)}</dd>
          </div>
        </dl>
      )}

      <section className="mt-10 border-t border-line pt-8">
        <h2 className="text-xl font-semibold text-ink">Transactions</h2>

        {txLoading && !transactions && <p className="mt-6 text-sm text-ink-40">Loading transactions…</p>}

        {txError && (
          <div className="mt-6">
            <SectionError error={txError} onRetry={reloadTx} what="transactions" />
          </div>
        )}

        {!txError && transactions && (
          <>
            {transactions.length === 0 ? (
              <p className="mt-6 text-sm text-ink-40">No transactions.</p>
            ) : (
              <ul className="mt-4">
                {transactions.map((t) => {
                  const Icon = ICONS[t.direction] ?? ArrowDown
                  return (
                    <li key={t.id} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-surface-alt">
                        <Icon size={14} className="text-ink-70" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium capitalize text-ink">
                          {t.type}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-ink-40">
                          {t.originatingUserId && <NamedUser id={t.originatingUserId} />}
                          {t.originatingUserId && t.destinationUserId && ' → '}
                          {t.destinationUserId && <NamedUser id={t.destinationUserId} />}
                        </span>
                      </span>
                      <span className="tnum hidden shrink-0 text-sm text-ink-40 sm:block">
                        {t.timestamp}
                      </span>
                      <Delta direction={t.direction} delta={t.delta} amount={t.amount} />
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  )
}
