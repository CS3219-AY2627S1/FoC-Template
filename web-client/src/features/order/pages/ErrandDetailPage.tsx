import { Flag } from 'lucide-react'
import { createElement, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useMyOrders, useOrder } from '@/api/order/order'
import type { Order, OrderStatus } from '@/api/order/order'
import { useSupplier } from '@/api/supplier/suppliers'
import { EmptyState } from '@/components/EmptyState'
import { Notice } from '@/components/Notice'
import { Page } from '@/components/Page'
import { QueryView } from '@/components/QueryView'
import { useErrandChatSlot } from '@/lib/errandChat'
import { formatDateTime } from '@/lib/format'
import { ErrandActions } from '../components/ErrandActions'
import { SupplierThumbnail } from '../components/SupplierThumbnail'
import { WalkingRoute } from '../components/WalkingRoute'

// Where "Back to errands" goes when the page was not opened from the Errands page, for example from
// Messages or a shared link: the tab this errand is listed in for the account.
function errandsTabFor(role: string | null): string {
  if (role === 'Requester') return '/errands?tab=requests'
  if (role === 'Courier') return '/errands?tab=deliveries'
  return '/errands'
}

// Status path

const FLOW: { status: OrderStatus; label: string }[] = [
  { status: 'Open', label: 'Posted' },
  { status: 'Accepted', label: 'Accepted by a courier' },
  { status: 'PickedUp', label: 'Items picked up' },
  { status: 'Delivered', label: 'Delivered' },
  { status: 'Completed', label: 'Confirmed and paid' },
]

type StepState = 'done' | 'current' | 'notReached' | 'ended'

type Step = { key: string; label: string; state: StepState; time?: string; note?: string }

/*
 * The order-service keeps only the current status, so earlier stages are worked out from the
 * rules of the lifecycle:
 *  - an errand can only be cancelled while Open or Accepted, and a courier is set once it is
 *    accepted, so a cancelled errand with a courier got as far as Accepted, one without did not;
 *  - an expired errand was never accepted.
 * Times are known only for posting (created_at) and for the latest change (updated_at).
 */
function stepsOf(order: Order): Step[] {
  const { status } = order
  const flowIndex = FLOW.findIndex((stage) => stage.status === status)

  if (status === 'Cancelled' || status === 'Expired') {
    const reached = status === 'Cancelled' && order.courier_id ? 2 : 1
    const endLabel = status === 'Cancelled' ? 'Cancelled' : 'Expired'
    const steps: Step[] = FLOW.map((stage, i) => ({
      key: stage.status,
      label: stage.label,
      state: i < reached ? 'done' : 'notReached',
      time: i === 0 ? order.created_at : undefined,
    }))
    steps.splice(reached, 0, {
      key: status,
      label: endLabel,
      state: 'ended',
      time: order.updated_at,
      note:
        status === 'Cancelled'
          ? 'The errand was cancelled. Reserved credits were released.'
          : 'Nobody accepted it in time. Reserved credits were released.',
    })
    return steps
  }

  return FLOW.map((stage, i): Step => {
    // Pending means the credits are still being reserved, so nothing has been reached yet.
    if (status === 'Pending') return { key: stage.status, label: stage.label, state: 'notReached' }
    const done = i < flowIndex || status === 'Completed'
    const current = i === flowIndex && status !== 'Completed'
    return {
      key: stage.status,
      label: stage.label,
      state: done ? 'done' : current ? 'current' : 'notReached',
      time: i === 0 ? order.created_at : current ? order.updated_at : status === 'Completed' && i === flowIndex ? order.updated_at : undefined,
    }
  })
}

const STATE_TEXT: Record<StepState, string> = {
  done: 'Done',
  current: 'Current',
  notReached: '',
  ended: 'Ended',
}

const MARKER: Record<StepState, { symbol: string; className: string }> = {
  done: { symbol: '✓', className: 'bg-accent text-on-accent' },
  current: { symbol: '●', className: 'border-2 border-accent bg-backdrop text-accent' },
  notReached: { symbol: '', className: 'border border-border bg-backdrop text-subtle' },
  ended: { symbol: '✕', className: 'bg-neutral-mark text-on-accent' },
}

function Progress({ order, actions }: { order: Order; actions: ReactNode }) {
  const steps = stepsOf(order)
  return (
    <section className="ds-surface grid grid-cols-1 gap-4 p-5" aria-labelledby="progress-title">
      <h2 id="progress-title">Progress</h2>
      {order.status === 'Pending' && <p className="text-sm text-muted">Reserving the reward credits…</p>}
      <ol aria-label="Errand progress" className="m-0 list-none p-0">
        {steps.map((step) => (
          <li
            key={step.key}
            className="relative pb-6 pl-10 before:absolute before:top-7 before:left-3.5 before:h-full before:w-px before:bg-border last:pb-0 last:before:hidden"
          >
            <span
              aria-hidden="true"
              className={`absolute top-0 left-0 grid size-7 place-items-center rounded-chip text-sm ${MARKER[step.state].className}`}
            >
              {MARKER[step.state].symbol}
            </span>
            <p className={step.state === 'notReached' ? 'text-muted' : 'font-semibold'}>{step.label}</p>
            <p className="text-sm text-muted">
              {STATE_TEXT[step.state]}
              {step.time && ` · ${formatDateTime(step.time)}`}
            </p>
            {step.note && <p className="mt-1 text-sm">{step.note}</p>}
          </li>
        ))}
      </ol>
      {actions}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Pickup
// ---------------------------------------------------------------------------

// Its own component because the hook needs the supplier id, which is known only once the errand has loaded.
function Pickup({ supplierId }: { supplierId: string }) {
  const supplier = useSupplier(supplierId)
  if (!supplier.data) return <p className="text-muted">Supplier {supplierId}</p>
  const s = supplier.data
  return (
    <div className="flex items-start gap-3">
      <SupplierThumbnail supplier={s} />
      <div className="grid min-w-0 grid-cols-1 gap-1">
        <p className="wrap-anywhere">{s.name}</p>
        <p className="text-sm text-muted wrap-anywhere">
          {s.type} · {s.zone} · {s.address}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function Details({ order, role }: { order: Order; role: string | null }) {
  return (
    <section className="ds-surface grid grid-cols-1 gap-4 p-5" aria-labelledby="details-title">
      <h2 id="details-title">Details</h2>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <dt className="ds-label">Pick up from</dt>
          <dd className="mt-1">
            <Pickup supplierId={order.supplier_id} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="ds-label">Deliver to</dt>
          <dd className="mt-1 wrap-anywhere">{order.delivery_location}</dd>
        </div>
        {/* Errands posted before the drop-off point existed have no walk to show. */}
        {typeof order.delivery_latitude === 'number' && (
          <div className="min-w-0 sm:col-span-2">
            <dt className="ds-label">Walk</dt>
            <dd className="mt-1">
              <WalkingRoute order={order} />
            </dd>
          </div>
        )}
        <div className="min-w-0">
          <dt className="ds-label">Needed by</dt>
          <dd className="mt-1">{formatDateTime(order.needed_by_time)}</dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="ds-label">Items</dt>
          <dd className="mt-1">
            <ul className="m-0 grid list-disc grid-cols-1 gap-1 pl-5">
              {order.item_lines.map((line, i) => (
                <li key={i} className="wrap-anywhere">
                  {line}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="ds-label">Reward</dt>
          <dd className="mt-1 font-semibold">{order.credit_reward} credits</dd>
        </div>
        {role && (
          <div className="min-w-0">
            <dt className="ds-label">Your role</dt>
            <dd className="mt-1">{role}</dd>
          </div>
        )}
        <div className="min-w-0">
          <dt className="ds-label">Posted</dt>
          <dd className="mt-1">{formatDateTime(order.created_at)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="ds-label">Last updated</dt>
          <dd className="mt-1">{formatDateTime(order.updated_at)}</dd>
        </div>
      </dl>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

// The chat itself comes from the message feature through the app (see @/lib/errandChat).
// It is shown to the requester and the courier once there is a courier; the message-service still
// decides who may read and write.
function Chat({ order, role }: { order: Order; role: string | null }) {
  const ErrandChat = useErrandChatSlot()
  if (!ErrandChat || !role) return null

  if (!order.courier_id) {
    if (order.status !== 'Pending' && order.status !== 'Open') return null
    return (
      <p className="text-sm text-muted lg:col-span-2">
        You can chat with your courier here once someone accepts this errand.
      </p>
    )
  }

  // The component is the same one on every render (it comes from the app, not from here), so
  // createElement keeps its state; JSX would read to the linter as a component made during render.
  return createElement(ErrandChat, {
    orderId: String(order.id),
    status: order.status,
    title: role === 'Requester' ? 'Chat with your courier' : 'Chat with the requester',
  })
}

export function ErrandDetailPage() {
  const params = useParams()
  const id = Number(params.id)
  const validId = Number.isInteger(id) && id > 0

  const order = useOrder(validId ? id : 0)
  const mine = useMyOrders()
  const me = mine.data?.accountId
  const data = order.data
  const role = !data || !me ? null : data.requester_id === me ? 'Requester' : data.courier_id === me ? 'Courier' : null

  // The Errands page passes the tab it was showing, so going back lands on the same list.
  const location = useLocation()
  const navigate = useNavigate()
  const from = (location.state as { from?: string } | null)?.from
  // Accepting on the Errands page comes here with what happened. Kept in state, so it outlives the cleanup below.
  const [notice] = useState(() => (location.state as { notice?: string } | null)?.notice)
  const noticeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!notice) return
    // The Accept button that had focus is gone, so keyboard users continue from the notice.
    noticeRef.current?.focus()
    // The browser keeps router state across a reload and back, so the notice is cleared once read.
    navigate(location.pathname, { replace: true, state: { from } })
  }, [notice, navigate, location.pathname, from])

  const back = (
    <Link to={from ?? errandsTabFor(role)} className="ds-btn ds-btn--glass">
      Back to errands
    </Link>
  )

  // The report form belongs to the user feature and takes the errand and the other person from the
  // URL. Only the two people on an errand with a courier can report each other; the user-service
  // checks that again with the order-service.
  const other = !data || !role ? null : role === 'Requester' ? data.courier_id : data.requester_id
  const report = other && (
    <Link
      to={`/reports/new?errand=${id}&account=${encodeURIComponent(other)}`}
      className="ds-btn ds-btn--glass"
    >
      <Flag aria-hidden="true" />
      Report a problem
    </Link>
  )

  if (!validId) {
    return (
      <Page title="Errand">
        <EmptyState title="This errand does not exist" action={back} />
      </Page>
    )
  }

  return (
    <Page title={`Errand #${id}`} subtitle={data ? `${data.credit_reward} credits` : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {back}
        {report}
      </div>
      {notice && (
        <div ref={noticeRef} tabIndex={-1}>
          <Notice tone="success" role="status" title={notice} />
        </div>
      )}
      <QueryView
        query={order}
        loadingLabel="Loading errand"
        isEmpty={(result) => !result}
        empty={<EmptyState title="Errand not found" action={back} />}
      >
        {(result) => (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
            <Progress
              order={result}
              actions={<ErrandActions order={result} me={me} allowed={result.allowed_transitions ?? []} />}
            />
            <Details order={result} role={role} />
            <Chat order={result} role={role} />
          </div>
        )}
      </QueryView>
    </Page>
  )
}
