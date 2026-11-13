import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowRight, ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchMyOrders, type OrderState } from '../api/orderApi'
import { ErrandCard } from '../components/ErrandCard'
import { ErrandTabs } from '../components/ErrandTabs'
import { ErrandListSkeleton } from '../components/Skeleton'
import { StatePanel } from '../components/StatePanel'
import { useSessionRole } from '../hooks/useSessionRole'
import { formatDeadline, stateLabel } from '../utils/orderFormatting'

type Kind = 'requested' | 'delivered'
type Status = 'active' | 'past' | 'review'

const LISTS: {
  value: Kind
  activeEmpty: string
  pastEmpty: string
  pastStates: OrderState[]
}[] = [
  {
    value: 'requested',
    activeEmpty:
      'Errands you post appear here until they finish. Request help to post one.',
    pastEmpty:
      'Errands you requested appear here once they’re completed, cancelled or expired.',
    pastStates: ['COMPLETED', 'CANCELLED', 'EXPIRED'],
  },
  {
    value: 'delivered',
    activeEmpty:
      'Errands you accept appear here until the requester confirms receipt.',
    pastEmpty:
      'Errands you delivered appear here once the requester confirms receipt.',
    pastStates: ['COMPLETED'],
  },
]

/** F9: the caller's errands for the current role, in progress and finished. */
export function MyErrandsPage() {
  // The header role switch picks the list: Requester sees errands they posted, Courier errands they run.
  const role = useSessionRole()
  const kind: Kind = role === 'COURIER' ? 'delivered' : 'requested'
  const current = LISTS.find((item) => item.value === kind)!

  if (role === 'REQUESTER') {
    return (
      <>
        <div className="requester-page-heading">
          <div className="page-intro">
            <p className="eyebrow">Your activity</p>
            <h1>My errands</h1>
          </div>
          <Link className="create-errand-link" to="/errands/new">
            Create new errand <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <section
          aria-labelledby="requester-history-heading"
          className="requester-history-panel"
        >
          <header className="requester-history-heading">
            <div>
              <p className="eyebrow">Requester history</p>
              <h2 id="requester-history-heading">Your recent errands</h2>
            </div>
          </header>
          <div className="requester-history-content">
            <ErrandSection
              empty={current.activeEmpty}
              history
              key={`${kind}-active`}
              kind={kind}
              status="active"
              title="Active"
            />
            <ErrandSection
              empty="No errands are under review."
              hideWhenEmpty
              history
              key={`${kind}-review`}
              kind={kind}
              status="review"
              title="Under review"
            />
            <ErrandSection
              empty={current.pastEmpty}
              history
              key={`${kind}-past`}
              kind={kind}
              states={current.pastStates}
              status="past"
              title="Past"
            />
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <div className="courier-page-heading">
        <div className="page-intro">
          <p className="eyebrow">Courier activity</p>
          <h1>Campus errands</h1>
          <p>Errands you’re running and have delivered.</p>
        </div>
        <ErrandTabs />
      </div>
      <ErrandSection
        empty="No errands are under review."
        hideWhenEmpty
        key={`${kind}-review`}
        kind={kind}
        status="review"
        title="Under review"
      />
      <ErrandSection
        empty={current.activeEmpty}
        hideWhenEmpty
        key={`${kind}-active`}
        kind={kind}
        status="active"
        title="Active"
      />
      <ErrandSection
        courierHistory
        empty={current.pastEmpty}
        history
        key={`${kind}-past`}
        kind={kind}
        states={current.pastStates}
        status="past"
        title="Past"
      />
    </>
  )
}

function ErrandSection({
  kind,
  status,
  title,
  empty,
  history = false,
  courierHistory = false,
  hideWhenEmpty = false,
  states = [],
}: {
  kind: Kind
  status: Status
  title: string
  empty: string
  history?: boolean
  courierHistory?: boolean
  hideWhenEmpty?: boolean
  states?: OrderState[]
}) {
  const [page, setPage] = useState(0)
  const [state, setState] = useState<OrderState | undefined>()
  const list = useQuery({
    queryKey: ['orders', 'mine', kind, status, state, page],
    queryFn: () => fetchMyOrders(kind, status, page, state),
    placeholderData: keepPreviousData,
  })
  const headingId = `${kind}-${status}-heading`

  if (
    hideWhenEmpty &&
    list.isSuccess &&
    !list.isPlaceholderData &&
    list.data.totalItems === 0
  )
    return null

  return (
    <section
      aria-labelledby={headingId}
      className={`my-errands-section${courierHistory ? ' courier-history-panel' : ''}`}
    >
      {courierHistory && (
        <header className="courier-history-heading">
          <div>
            <p className="eyebrow">Courier history</p>
            <h2 id={headingId}>Past errands you ran</h2>
          </div>
          {list.data && (
            <span>
              {list.data.totalItems}{' '}
              {list.data.totalItems === 1 ? 'completed errand' : 'completed'}
            </span>
          )}
        </header>
      )}
      {(!courierHistory || states.length > 1) && (
        <div className="my-errands-section-head">
          {history && !courierHistory && (
            <h3 className="section-title" id={headingId}>
              {title}
            </h3>
          )}
          {!history && (
            <h2 className="section-title" id={headingId}>
              {title}
              {list.data && list.data.totalItems > 0 && (
                <span className="record-count">{list.data.totalItems}</span>
              )}
            </h2>
          )}
          {states.length > 1 && (
            <div
              aria-label={`Filter ${title.toLowerCase()} errands`}
              className="filter-chips"
              role="group"
            >
              {[undefined, ...states].map((value) => (
                <button
                  aria-pressed={state === value}
                  className="filter-chip"
                  key={value ?? 'all'}
                  onClick={() => {
                    setState(value)
                    setPage(0)
                  }}
                  type="button"
                >
                  {value ? stateLabel(value) : 'All'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {list.isPending && (
        <ErrandListSkeleton count={2} label="Loading your errands…" />
      )}
      {list.isError && (
        <div className="notice notice-error" role="alert">
          We couldn't load your errands. {list.error.message}
        </div>
      )}
      {list.isSuccess &&
        !list.isPlaceholderData &&
        list.data.items.length === 0 && (
          <StatePanel
            action={
              status === 'active' && (
                <Link
                  className="button-secondary"
                  to={kind === 'requested' ? '/errands/new' : '/errands/browse'}
                >
                  {kind === 'requested' ? 'Request help' : 'Find errands'}
                </Link>
              )
            }
            compact
            headingLevel={3}
            icon={ClipboardList}
            title={
              state
                ? `No ${stateLabel(state).toLowerCase()} errands`
                : `No ${title.toLowerCase()} errands`
            }
          >
            {state ? 'Choose another status to see more.' : empty}
          </StatePanel>
        )}
      {list.data && list.data.items.length > 0 && (
        <>
          <ul className={`errand-list${history ? ' errand-history-list' : ''}`}>
            {list.data.items.map((order) => (
              <ErrandCard
                canRepost={kind === 'requested'}
                key={order.id}
                layout={history ? 'history' : 'card'}
                order={order}
                showPendingReward={status === 'active'}
                timingLabel={
                  status !== 'past'
                    ? `Pick up by ${formatDeadline(order.pickupDeadline)}`
                    : formatDeadline(order.stateChangedAt)
                }
              />
            ))}
          </ul>
          {list.data.totalPages > 1 && (
            <nav aria-label={`${title} pages`} className="actions">
              <button
                className="button-secondary"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                type="button"
              >
                Previous
              </button>
              <span className="subtle">
                Page {list.data.page + 1} of {list.data.totalPages}
              </span>
              <button
                className="button-secondary"
                disabled={page + 1 >= list.data.totalPages}
                onClick={() => setPage(page + 1)}
                type="button"
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}
