import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ArrowLeft,
  CircleAlert,
  MessageCircle,
  RotateCcw,
  SearchX,
} from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  fetchOrder,
  type Order,
  type OrderAction,
  OrderApiError,
  performAction,
} from '../api/orderApi'
import { readSession } from '../auth/session'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ProgressCard } from '../components/ProgressCard'
import { RouteSummary } from '../components/RouteSummary'
import { StateBadge } from '../components/StateBadge'
import { ErrandReportPanel } from '../components/ErrandReportPanel'
import { ErrandDetailSkeleton } from '../components/Skeleton'
import { StatePanel } from '../components/StatePanel'
import { homeFor, useSessionRole } from '../hooks/useSessionRole'
import {
  credits,
  errandReference,
  formatDeadline,
  REPOSTABLE_STATES,
  repostPath,
  reservationFailure,
  stateLabel,
} from '../utils/orderFormatting'

/** Friendly text for the error codes in the Order README. */
const ERROR_MESSAGES: Record<string, string> = {
  ORDER_ALREADY_ACCEPTED: 'Another courier accepted this errand first.',
  ORDER_EXPIRED: 'This errand expired before it could be accepted.',
  SELF_ACCEPTANCE_FORBIDDEN: "You can't accept your own errand.",
  REWARD_ADJUSTMENT_PENDING:
    'The reward is still being saved. Try again in a moment.',
  CANCELLATION_NOT_ALLOWED: "This errand can't be cancelled after pickup.",
  NOT_ASSIGNED_COURIER: "This errand isn't yours to update.",
  NOT_ORDER_REQUESTER: "This errand isn't yours to update.",
  INVALID_STATE_TRANSITION:
    'This errand has changed. The latest status is shown.',
}

function errorText(error: unknown): string {
  if (error instanceof OrderApiError) {
    // A 403 without a code comes from the session-role check, not the order itself.
    if (error.status === 403 && !error.code)
      return 'Switch your role at the top of the page to do this.'
    return (error.code && ERROR_MESSAGES[error.code]) || error.message
  }
  return 'Something went wrong. Please try again.'
}

type View = 'browser' | 'courier' | 'requester'
type Confirmation = {
  action: OrderAction
  title: string
  body: string
  label: string
}

/**
 * One route for every viewer of an errand (Figma "Errand details", "Courier active order",
 * "Requester active order"). The viewer's relationship to the order picks the layout; the
 * backend still authorises every action.
 */
export function ErrandPage() {
  const { orderId = '' } = useParams()
  // Re-renders when the header switches role; the session is re-read for the new role.
  const role = useSessionRole()
  const session = readSession()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState<Confirmation | null>(null)
  const errand = useQuery({
    queryKey: ['orders', orderId],
    queryFn: () => fetchOrder(orderId),
  })
  const action = useMutation({
    mutationFn: (next: OrderAction) => performAction(orderId, next),
    onSuccess: (updated) => {
      queryClient.setQueryData(['orders', orderId], updated)
      void queryClient.invalidateQueries({ queryKey: ['orders', 'pool'] })
    },
    // A rejection usually means the errand changed (taken, expired): show its latest state.
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: ['orders', orderId] }),
    onSettled: () => setConfirming(null),
  })

  if (errand.isPending) return <ErrandDetailSkeleton label="Loading errand…" />
  if (errand.isError) {
    const notFound =
      errand.error instanceof OrderApiError && errand.error.status === 404
    return (
      <>
        <StatePanel
          action={
            notFound ? (
              <Link className="button-secondary" to="/errands">
                <ArrowLeft aria-hidden="true" /> Back to errands
              </Link>
            ) : (
              <button
                aria-busy={errand.isFetching}
                disabled={errand.isFetching}
                onClick={() => void errand.refetch()}
                type="button"
              >
                {errand.isFetching ? 'Trying again…' : 'Try again'}
              </button>
            )
          }
          icon={notFound ? SearchX : CircleAlert}
          title={notFound ? 'Errand not found' : "We couldn't load this errand"}
        >
          {notFound
            ? 'It may have been taken or it is no longer open.'
            : `${errand.error.message} Check your connection and try again.`}
        </StatePanel>
        {notFound && (
          <ErrandReportPanel
            key={`${session?.userId}.${session?.role}.${orderId}`}
            orderId={orderId}
          />
        )}
      </>
    )
  }

  const order = errand.data
  const userId = session?.userId
  const view: View =
    userId === order.requesterId
      ? 'requester'
      : userId && userId === order.courierId
        ? 'courier'
        : 'browser'
  // Only the requester's own errand fits Requester mode; Courier mode is for running errands.
  const participantMode =
    session?.role === 'REQUESTER' || session?.role === 'COURIER'
  if (participantMode && (role === 'REQUESTER') !== (view === 'requester'))
    return <Navigate replace to={homeFor(role)} />
  const run = (next: OrderAction) => action.mutate(next)
  const ask = (confirmation: Confirmation) => {
    action.reset()
    setConfirming(confirmation)
  }

  return (
    <>
      <div className="back-row">
        <Link
          className="text-link"
          to={view === 'browser' ? '/errands/browse' : '/errands/mine'}
        >
          <ArrowLeft aria-hidden="true" /> Back
        </Link>
      </div>
      <div className="two-column">
        <section aria-labelledby="errand-title">
          {order.reviewCaseId ? (
            <>
              <h1 id="errand-title">
                {order.reviewResolved
                  ? 'Resolved after review'
                  : 'Under review'}
              </h1>
              <p>
                {order.title}
                {!order.reviewResolved && (
                  <> · Paused at: {stateLabel(order.state)}</>
                )}
              </p>
            </>
          ) : (
            <>
              {view === 'browser' && <BrowserHeading order={order} />}
              {view === 'courier' && <CourierHeading order={order} />}
              {view === 'requester' && <RequesterHeading order={order} />}
            </>
          )}
          <StateBadge
            state={order.state}
            terminalReason={order.terminalReason}
          />
          <RouteSummary order={order} />
          <dl className="facts">
            <dt>Pick up by</dt>
            <dd>{formatDeadline(order.pickupDeadline)}</dd>
          </dl>
          <hr className="divider" />
          <h2 className="section-title">What to collect</h2>
          <p className="description">{order.description}</p>
          {action.isError && (
            <div className="notice notice-error" role="alert">
              {errorText(action.error)}
            </div>
          )}
          {order.reviewCaseId && (
            <div role="status" className="notice notice-review">
              <strong>
                {order.reviewResolved
                  ? 'Resolved after review'
                  : 'Under review'}
              </strong>
              <p>
                {order.reviewResolved
                  ? 'This errand is finished following dispute review.'
                  : 'This errand is under review following a reported issue. Errand actions are paused. You can add your statement below.'}
              </p>
            </div>
          )}
          <div className="actions" hidden={!!order.reviewCaseId}>
            {view !== 'browser' &&
              [
                'ACCEPTED',
                'PICKED_UP',
                'DELIVERED',
                'COMPLETED',
                'CANCELLED',
              ].includes(order.state) && (
                <Link
                  className="button-secondary"
                  to={`/errands/${order.id}/chat`}
                >
                  <MessageCircle aria-hidden="true" /> Chat
                </Link>
              )}
            {view === 'browser' && order.state === 'OPEN' && (
              <button
                disabled={
                  action.isPending || order.pendingCreditReward !== null
                }
                onClick={() =>
                  ask({
                    action: 'accept',
                    title: 'Accept this errand?',
                    body: `You'll be the courier for "${order.title}". Pick it up by ${formatDeadline(order.pickupDeadline)}.`,
                    label: 'Accept errand',
                  })
                }
                type="button"
              >
                Accept errand
              </button>
            )}
            {view === 'courier' && order.state === 'ACCEPTED' && (
              <>
                <button
                  disabled={action.isPending}
                  onClick={() => run('pickup')}
                  type="button"
                >
                  Mark as picked up
                </button>
                <button
                  className="button-danger"
                  disabled={action.isPending}
                  onClick={() =>
                    ask({
                      action: 'withdraw',
                      title: 'Withdraw from this errand?',
                      body: 'Another courier can pick it up instead.',
                      label: 'Withdraw',
                    })
                  }
                  type="button"
                >
                  Withdraw
                </button>
              </>
            )}
            {view === 'courier' && order.state === 'PICKED_UP' && (
              <button
                disabled={action.isPending}
                onClick={() => run('deliver')}
                type="button"
              >
                Mark as delivered
              </button>
            )}
            {view === 'requester' && order.state === 'DELIVERED' && (
              <button
                disabled={action.isPending}
                onClick={() =>
                  ask({
                    action: 'complete',
                    title: 'Confirm you received it?',
                    body: `Your courier gets ${credits(order.creditReward)}.`,
                    label: `Yes, pay ${credits(order.creditReward)}`,
                  })
                }
                type="button"
              >
                I got it · Pay {credits(order.creditReward)}
              </button>
            )}
            {view === 'requester' &&
              session?.role === 'REQUESTER' &&
              REPOSTABLE_STATES.includes(order.state) && (
                <Link className="button-secondary" to={repostPath(order.id)}>
                  <RotateCcw aria-hidden="true" /> Post again
                </Link>
              )}
            {view === 'requester' &&
              session?.role === 'REQUESTER' &&
              order.state === 'OPEN' &&
              order.pendingCreditReward === null && (
                <Link
                  className="button-secondary"
                  to={`/errands/${order.id}/edit`}
                >
                  Edit errand
                </Link>
              )}
            {view === 'requester' &&
              (order.state === 'OPEN' || order.state === 'ACCEPTED') && (
                <button
                  className="button-danger"
                  disabled={action.isPending}
                  onClick={() =>
                    ask({
                      action: 'cancel',
                      title: 'Cancel this errand?',
                      // Before the pickup deadline the courier is compensated; after it they're late.
                      body:
                        order.state === 'ACCEPTED' &&
                        Date.now() < Date.parse(order.pickupDeadline)
                          ? 'Your courier gets 20% of the reward for their time.'
                          : order.state === 'ACCEPTED'
                            ? "Your courier is late, so you'll get all your credits back."
                            : "You'll get all your credits back.",
                      label: 'Cancel errand',
                    })
                  }
                  type="button"
                >
                  Cancel errand
                </button>
              )}
          </div>
        </section>
        <SidePanel order={order} view={view} />
      </div>
      {view !== 'browser' && (
        <ErrandReportPanel
          key={`${session?.userId}.${session?.role}.${orderId}`}
          orderId={orderId}
        />
      )}
      <ConfirmDialog
        body={confirming?.body ?? ''}
        busy={action.isPending}
        confirmLabel={confirming?.label ?? ''}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && run(confirming.action)}
        open={confirming !== null}
        title={confirming?.title ?? ''}
      />
    </>
  )
}

function BrowserHeading({ order }: { order: Order }) {
  return (
    <header className="errand-heading">
      <h1 id="errand-title">{order.title}</h1>
      <p className="subtle">Errand {errandReference(order.id)}</p>
    </header>
  )
}

function CourierHeading({ order }: { order: Order }) {
  const next: Partial<Record<Order['state'], string>> = {
    ACCEPTED: 'Next: pick up the item.',
    PICKED_UP: 'Next: bring it to the drop-off point.',
    DELIVERED: "Delivered. You'll get your reward once they confirm.",
  }
  return (
    <header className="errand-heading">
      <h1 id="errand-title">
        {order.state === 'COMPLETED'
          ? 'Errand completed'
          : "You're the courier"}
      </h1>
      <p className="subtle">
        {order.title} · {errandReference(order.id)}
      </p>
      {next[order.state] && (
        <div className="notice notice-next">{next[order.state]}</div>
      )}
    </header>
  )
}

function RequesterHeading({ order }: { order: Order }) {
  const headings: Record<Order['state'], [string, string]> = {
    PENDING_CREDIT: ['Posting your errand', 'This only takes a moment.'],
    OPEN: ['Waiting for a courier', 'Couriers can see your errand now.'],
    ACCEPTED: ['A courier is on the way', 'Your courier accepted the errand.'],
    PICKED_UP: [
      'Your item has been picked up',
      'Your courier is bringing it to the drop-off point.',
    ],
    DELIVERED: [
      'Have you received your item?',
      'Your courier marked this errand as delivered.',
    ],
    COMPLETED: ['Errand completed', 'Thanks! Your courier has been paid.'],
    CANCELLED: ['Errand cancelled', 'This errand was cancelled.'],
    EXPIRED: ['Errand expired', 'Nobody picked it up in time.'],
    RESERVATION_FAILED: ['', ''],
  }
  const failure =
    order.state === 'RESERVATION_FAILED'
      ? reservationFailure(order.terminalReason)
      : null
  // Credit never answered, so the errand never reached the pool: "nobody picked it up" would be wrong.
  const creditTimedOut =
    order.state === 'EXPIRED' &&
    order.terminalReason === 'CREDIT_RESERVATION_TIMEOUT'
  const courierLate =
    order.state === 'CANCELLED' &&
    order.terminalReason === 'REQUESTER_CANCELLED_COURIER_LATE'
  const [title, subtitle] = failure
    ? [failure.title, failure.detail]
    : courierLate
      ? [
          'Errand cancelled',
          'Your courier was late, so you got all your credits back.',
        ]
      : creditTimedOut
        ? [
            'Errand not posted',
            "We couldn't post it this time. Your credits are safe.",
          ]
        : headings[order.state]
  return (
    <header className="errand-heading">
      <h1 id="errand-title">{title}</h1>
      <p className="subtle">
        {subtitle} · {order.title}
      </p>
      {failure?.setUpCredits && (
        <div className="notice notice-next">
          <a className="text-link" href="/credits">
            Set up your credits
          </a>{' '}
          then post the errand again.
        </div>
      )}
      {order.state === 'DELIVERED' && (
        <div className="notice notice-warn">
          <strong>Only confirm once you have your item</strong>
          Your courier then gets {credits(order.creditReward)}.
        </div>
      )}
      {order.pendingCreditReward !== null && (
        <div className="notice notice-next">
          Saving your new reward of {credits(order.pendingCreditReward)}…
        </div>
      )}
    </header>
  )
}

function SidePanel({ order, view }: { order: Order; view: View }) {
  if (view === 'browser') {
    return (
      <aside aria-labelledby="earn-heading" className="card">
        <h2 id="earn-heading">Earn {credits(order.creditReward)}</h2>
        <p>You get paid once the requester has their item.</p>
        <dl className="facts">
          <dt>Reward</dt>
          <dd>{credits(order.creditReward)}</dd>
          <dt>Status</dt>
          <dd>
            <StateBadge
              state={order.state}
              terminalReason={order.terminalReason}
            />
          </dd>
        </dl>
        <p>If the item costs money, settle that with the requester directly.</p>
      </aside>
    )
  }
  return (
    <ProgressCard
      order={order}
      rewardLabel={view === 'courier' ? 'Your reward' : 'Reserved reward'}
    >
      {view === 'courier' && (
        <p>You get paid once the requester has their item.</p>
      )}
    </ProgressCard>
  )
}
