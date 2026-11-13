import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import {
  describeOrderError,
  useAcceptOrder,
  useMyOrders,
  useOpenOrders,
  useUpdateOrderStatus,
} from '@/api/order/order'
import type { MyOrder, Order, OrderStatus } from '@/api/order/order'
import { useSupplier } from '@/api/supplier/suppliers'
import { EmptyState } from '@/components/EmptyState'
import { Notice } from '@/components/Notice'
import { Page } from '@/components/Page'
import { QueryView } from '@/components/QueryView'
import { formatDateTime } from '@/lib/format'
import { ACCEPT_LABEL, STATUS_ACTIONS } from '../components/statusActions'

type Tab = 'browse' | 'requests' | 'deliveries'
type Flash = { kind: 'ok' | 'error'; text: string }

const TERMINAL: OrderStatus[] = ['Completed', 'Cancelled', 'Expired']

const STATUS_LABEL: Record<OrderStatus, string> = {
  Pending: 'Pending',
  Open: 'Open',
  Accepted: 'Accepted',
  PickedUp: 'Picked up',
  Delivered: 'Delivered',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Expired: 'Expired',
}

// Full class names, so Tailwind finds them. Danger is kept for real problems, not for a new errand.
const BADGE_CLASS: Record<OrderStatus, string> = {
  Pending: 'ds-badge ds-badge--neutral',
  Open: 'ds-badge ds-badge--info',
  Accepted: 'ds-badge ds-badge--info',
  PickedUp: 'ds-badge ds-badge--info',
  Delivered: 'ds-badge ds-badge--info',
  Completed: 'ds-badge ds-badge--success',
  Cancelled: 'ds-badge ds-badge--neutral',
  Expired: 'ds-badge ds-badge--neutral',
}

const TABS = [
  ['browse', 'Browse open'],
  ['requests', 'My requests'],
  ['deliveries', 'My deliveries'],
] as const

// The tab lives in the URL, so the errand page can send the student back to the list they came from.
function tabOf(value: string | null): Tab {
  return value === 'requests' || value === 'deliveries' ? value : 'browse'
}

function relativeTo(iso: string, now: number): string {
  const diffMin = Math.round((new Date(iso).getTime() - now) / 60_000)
  const abs = Math.abs(diffMin)
  const span =
    abs < 60 ? `${abs} min` : abs < 60 * 48 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`
  return diffMin >= 0 ? `in ${span}` : `${span} overdue`
}

export function ErrandsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = tabOf(searchParams.get('tab'))
  const setTab = (next: Tab) => setSearchParams(next === 'browse' ? {} : { tab: next }, { replace: true })
  const location = useLocation()
  const navigate = useNavigate()
  // Post an errand sends the student here with a notice to show once.
  const arrival = (location.state as { notice?: string } | null)?.notice
  const [flash, setFlash] = useState<Flash | null>(arrival ? { kind: 'ok', text: arrival } : null)
  const from = location.pathname + location.search
  const [busy, setBusy] = useState<number[]>([])
  const [now, setNow] = useState(() => Date.now())

  const openQuery = useOpenOrders()
  const mineQuery = useMyOrders()
  const acceptOrder = useAcceptOrder()
  const updateStatus = useUpdateOrderStatus()

  const myOrders = mineQuery.data?.orders
  const me = mineQuery.data?.accountId ?? null

  // Keep "in 5 min" / "overdue" labels fresh between refetches.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  // Cleared right away, so a reload or going back does not show "Errand posted" again.
  useEffect(() => {
    if (arrival) navigate(location.pathname + location.search, { replace: true, state: null })
  }, [arrival, navigate, location.pathname, location.search])

  useEffect(() => {
    if (flash?.kind !== 'ok') return
    const t = window.setTimeout(() => setFlash(null), 5000)
    return () => window.clearTimeout(t)
  }, [flash])

  const requests = useMemo(
    () => sortActiveFirst((myOrders ?? []).filter((o) => o.requester_id === me)),
    [myOrders, me],
  )
  const deliveries = useMemo(
    () => sortActiveFirst((myOrders ?? []).filter((o) => o.courier_id === me)),
    [myOrders, me],
  )
  // Your own open errands are under My requests; nobody can accept their own anyway.
  const browse = useMemo(
    () =>
      (openQuery.data ?? [])
        .filter((o) => o.requester_id !== me)
        .sort((a, b) => new Date(a.needed_by_time).getTime() - new Date(b.needed_by_time).getTime()),
    [openQuery.data, me],
  )

  // ensure the errand is busy as actions are being processed, buttons are greyed out from this
  async function run(orderId: number, action: () => Promise<unknown>, success: string, failure: string) {
    setBusy((ids) => [...ids, orderId])
    try {
      await action()
      setFlash({ kind: 'ok', text: success })
    } catch (err) {
      setFlash({ kind: 'error', text: describeOrderError(err, failure) })
    } finally {
      setBusy((ids) => ids.filter((id) => id !== orderId))
    }
  }

  // The new courier goes straight to the errand's own page, which has the pickup, the walk and the
  // chat. Its back button leads to Deliveries, where the errand is listed from now on.
  async function accept(order: Order) {
    setBusy((ids) => [...ids, order.id])
    try {
      await acceptOrder.mutateAsync(order.id)
      navigate(`/errands/${order.id}`, {
        state: { from: '/errands?tab=deliveries', notice: 'Accepted. Head to the pickup to collect the items.' },
      })
    } catch (err) {
      setFlash({ kind: 'error', text: describeOrderError(err, 'Could not accept this errand.') })
    } finally {
      setBusy((ids) => ids.filter((id) => id !== order.id))
    }
  }

  const setStatus = (order: Order, status: OrderStatus, success: string) =>
    run(order.id, () => updateStatus.mutateAsync({ id: order.id, status }), success, 'Could not update this errand.')

  const counts = { browse: browse.length, requests: requests.length, deliveries: deliveries.length }

  const cards = (orders: (Order | MyOrder)[]) => (
    <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2">
      {orders.map((order) => (
        <li key={order.id} className="min-w-0">
          <ErrandCard
            order={order}
            me={me}
            allowed={'allowed_transitions' in order ? order.allowed_transitions : []}
            now={now}
            from={from}
            busy={busy.includes(order.id)}
            onAccept={() => void accept(order)}
            onStatus={(status, success) => void setStatus(order, status, success)}
          />
        </li>
      ))}
    </ul>
  )

  return (
    <Page title="Errands" subtitle="Pick up errands for others and track the ones you have requested.">
      {flash && (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <Notice
              tone={flash.kind === 'ok' ? 'success' : 'danger'}
              role={flash.kind === 'ok' ? 'status' : 'alert'}
              title={flash.text}
            />
          </div>
          <button
            type="button"
            className="ds-btn ds-btn--text ds-btn--icon"
            aria-label="Dismiss message"
            onClick={() => setFlash(null)}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      <div role="tablist" aria-label="Errand views" className="grid grid-cols-3 border-b border-border md:flex md:gap-1">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`errands-tab-${key}`}
            aria-selected={tab === key}
            aria-controls="errands-panel"
            onClick={() => setTab(key)}
            className={`-mb-px flex min-w-0 flex-col items-center gap-1 border-b-2 px-1 py-2 text-center md:flex-row md:gap-2 md:px-4 ${
              tab === key ? 'border-current font-semibold' : 'border-transparent text-muted hover:text-default'
            }`}
          >
            {label}
            <span className="ds-badge ds-badge--neutral">{counts[key]}</span>
          </button>
        ))}
      </div>

      <div id="errands-panel" role="tabpanel" aria-labelledby={`errands-tab-${tab}`} className="grid grid-cols-1 gap-4">
        {tab === 'browse' ? (
          <QueryView
            query={openQuery}
            loadingLabel="Loading open errands"
            isEmpty={() => browse.length === 0}
            empty={
              <EmptyState
                title="No open errands right now"
                description="New errands appear here as soon as someone posts one."
                action={
                  <Link to="/errands/new" className="ds-btn ds-btn--glass">
                    Post an errand
                  </Link>
                }
              />
            }
          >
            {() => cards(browse)}
          </QueryView>
        ) : (
          <QueryView
            query={mineQuery}
            loadingLabel="Loading your errands"
            isEmpty={() => (tab === 'requests' ? requests : deliveries).length === 0}
            empty={
              tab === 'requests' ? (
                <EmptyState
                  title="You have not requested anything yet"
                  action={
                    <Link to="/errands/new" className="ds-btn ds-btn--glass">
                      Post an errand
                    </Link>
                  }
                />
              ) : (
                <EmptyState
                  title="You are not delivering anything"
                  action={
                    <button type="button" className="ds-btn ds-btn--glass" onClick={() => setTab('browse')}>
                      Browse open errands
                    </button>
                  }
                />
              )
            }
          >
            {() => cards(tab === 'requests' ? requests : deliveries)}
          </QueryView>
        )}
      </div>
    </Page>
  )
}

function sortActiveFirst(orders: MyOrder[]): MyOrder[] {
  const rank = (o: MyOrder) => (TERMINAL.includes(o.status) ? 1 : 0)
  return [...orders].sort(
    (a, b) => rank(a) - rank(b) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface CardProps {
  order: Order
  // The list this card is shown in, handed to the errand page for its back link.
  from: string
  me: string | null
  allowed: OrderStatus[]
  now: number
  busy: boolean
  onAccept: () => void
  onStatus: (status: OrderStatus, success: string) => void
}

type Variant = 'primary' | 'plain'

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'ds-btn ds-btn--primary',
  plain: 'ds-btn',
}

// One lookup per supplier, cached and shared by every card with the same pickup. A list of all
// suppliers would stop at the service's page size and leave the rest without a name.
function SupplierName({ id }: { id: string }) {
  const supplier = useSupplier(id)
  return <>{supplier.data?.name ?? (supplier.isError ? 'Unknown supplier' : 'Loading…')}</>
}

function ErrandCard({ order, me, allowed, now, from, busy, onAccept, onStatus }: CardProps) {
  const isRequester = me !== null && order.requester_id === me
  const isCourier = me !== null && order.courier_id === me
  const pastDue = order.status === 'Open' && new Date(order.needed_by_time).getTime() < now
  const itemCount = order.item_lines.length

  function confirmThen(message: string, fn: () => void) {
    if (window.confirm(message)) fn()
  }

  const actions: ReactNode[] = []
  // aria-disabled, not disabled, so keyboard focus stays on the button while the change runs.
  const button = (key: string, label: string, onClick: () => void, variant: Variant = 'plain') =>
    actions.push(
      <button
        key={key}
        type="button"
        className={VARIANT_CLASS[variant]}
        aria-disabled={busy}
        onClick={() => !busy && onClick()}
      >
        {label}
      </button>,
    )

  if (order.status === 'Open' && !isRequester) {
    button('accept', ACCEPT_LABEL, onAccept, 'primary')
  }
  for (const status of allowed) {
    const action = STATUS_ACTIONS[status]
    if (!action) continue
    const { confirm } = action
    const change = () => onStatus(status, action.success)
    button(status, action.label(order), confirm ? () => confirmThen(confirm(order), change) : change, 'primary')
  }

  const muted = order.status === 'Cancelled' || order.status === 'Expired'

  const note = statusNote(order, isRequester, isCourier)

  return (
    <article
      aria-busy={busy}
      className={`ds-surface flex h-full flex-col gap-4 p-5 ${busy ? 'opacity-70' : muted ? 'opacity-80' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ds-label">Pick up from</p>
          <h2 className="mt-1 wrap-anywhere">
            <SupplierName id={order.supplier_id} />
          </h2>
        </div>
        <span className={BADGE_CLASS[order.status]}>{STATUS_LABEL[order.status]}</span>
      </div>

      <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-2">
        <dt className="ds-label">Deliver to</dt>
        <dd className="m-0 min-w-0 wrap-anywhere">{order.delivery_location}</dd>

        <dt className="ds-label">Needed by</dt>
        <dd className="m-0 min-w-0">
          {formatDateTime(order.needed_by_time)}
          {!TERMINAL.includes(order.status) && (
            <span className={pastDue ? 'text-danger' : 'text-muted'}> · {relativeTo(order.needed_by_time, now)}</span>
          )}
        </dd>

        <dt className="ds-label">Items</dt>
        <dd className="m-0">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </dd>

        <dt className="ds-label">Reward</dt>
        <dd className="m-0 font-semibold">{order.credit_reward} credits</dd>
      </dl>

      {note && <p className="text-sm text-muted">{note}</p>}

      <div className="mt-auto flex flex-wrap justify-center gap-2">
        <Link to={`/errands/${order.id}`} state={{ from }} className="ds-btn ds-btn--glass">
          View details
        </Link>
        {/* The chat lives on the errand page; the message-service decides whether it still takes messages. */}
        {order.courier_id && (isRequester || isCourier) && !TERMINAL.includes(order.status) && (
          <Link to={`/errands/${order.id}#chat`} state={{ from }} className="ds-btn ds-btn--glass">
            <MessageCircle aria-hidden="true" />
            Chat
          </Link>
        )}
        {actions}
      </div>
    </article>
  )
}

function statusNote(order: Order, isRequester: boolean, isCourier: boolean): string | null {
  switch (order.status) {
    case 'Pending':
      return 'Reserving credits…'
    case 'Open':
      return isRequester ? 'Waiting for a courier to accept.' : null
    case 'Accepted':
      return isRequester ? 'A courier is on the way to the pickup point.' : isCourier ? 'Go pick up the items.' : null
    case 'PickedUp':
      return isRequester ? 'Your items have been picked up.' : isCourier ? 'Deliver the items to the drop-off location.' : null
    case 'Delivered':
      return isRequester ? 'Delivered. Confirm to pay your courier.' : isCourier ? 'Waiting for the requester to confirm.' : null
    case 'Completed':
      return isCourier ? 'Done. Your reward has been requested.' : 'Done. Credits sent to your courier.'
    case 'Cancelled':
      return 'Cancelled. Reserved credits are released.'
    case 'Expired':
      return 'Expired. Reserved credits are released.'
  }
}
