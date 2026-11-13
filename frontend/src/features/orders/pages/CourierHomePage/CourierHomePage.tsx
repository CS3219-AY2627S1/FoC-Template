import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { OrderActions } from '../../components/OrderActions/OrderActions'
import { OrderFeedback } from '../../components/OrderFeedback/OrderFeedback'
import { OrderPagination } from '../../components/OrderPagination/OrderPagination'
import { useAvailableOrders } from '../../hooks/useOrders'
import { orderErrorMessage } from '../../utils/orderErrors'
import type { Errand } from '../../types/errand.types'
import styles from '../../styles/order.module.scss'
import page from './CourierHomePage.module.scss'

export const CourierHomePage = () => {
  const search = useSearch({ from: '/authenticated/user/deliver' })
  const navigate = useNavigate()
  const [input, setInput] = useState(search.q ?? '')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<Error | null>(null)
  useEffect(() => setInput(search.q ?? ''), [search.q])
  useEffect(() => {
    if (input === (search.q ?? '')) return
    const timer = setTimeout(
      () =>
        void navigate({
          to: '/deliver',
          search: { q: input, page: 0 },
          replace: true,
        }),
      300,
    )
    return () => clearTimeout(timer)
  }, [input, search.q, navigate])
  const orders = useAvailableOrders(search.q ?? '', search.page ?? 0)
  const items = orders.data?.items ?? []
  const selected = items.find((order) => order.id === selectedId) ?? items.at(0)
  const choose = (orderId: string) => {
    setSelectedId(orderId)
    setActionError(null)
  }

  return (
    <section className={styles.page} aria-labelledby="courier-heading">
      <CourierToolbar input={input} onInput={setInput} />
      <OrderFeedback
        error={orders.error}
        loading={orders.isPending}
        retry={() => void orders.refetch()}
      />
      {orders.data && orders.userId && !orders.error && (
        <>
          <div className={page.layout}>
            <ErrandList
              items={items}
              query={search.q}
              total={orders.data.total}
              selectedId={selected?.id}
              onSelect={choose}
            />
            {selected && (
              <TripDetail
                order={selected}
                pageNumber={search.page ?? 0}
                userId={orders.userId}
                actionError={actionError}
                onError={setActionError}
              />
            )}
          </div>
          <OrderPagination
            page={search.page ?? 0}
            total={orders.data.total}
            pending={orders.isFetching}
            onPage={(pageNumber) =>
              void navigate({
                to: '/deliver',
                search: { ...search, page: pageNumber },
              })
            }
          />
        </>
      )}
    </section>
  )
}

const CourierToolbar = ({
  input,
  onInput,
}: {
  input: string
  onInput: (value: string) => void
}) => (
  <div className={styles.toolbar}>
    <div>
      <h1 id="courier-heading" className={styles.pageTitle}>
        Find an errand
      </h1>
      <p className={styles.muted}>Choose a pickup that fits your trip.</p>
    </div>
    <label className={styles.search}>
      Search errands
      <input
        className={styles.input}
        type="search"
        placeholder="Location or description"
        value={input}
        onChange={(event) => onInput(event.target.value)}
      />
    </label>
  </div>
)

const ErrandList = ({
  items,
  query,
  total,
  selectedId,
  onSelect,
}: {
  items: Array<Errand>
  query?: string
  total: number
  selectedId?: string
  onSelect: (orderId: string) => void
}) => (
  <div>
    <ul className={page.list}>
      {items.map((order) => (
        <li key={order.id}>
          <button
            type="button"
            className={selectedId === order.id ? page.selected : page.row}
            aria-current={selectedId === order.id ? 'true' : undefined}
            onClick={() => onSelect(order.id)}
          >
            <ErrandSummary order={order} />
          </button>
        </li>
      ))}
    </ul>
    {!total && (
      <p className={styles.panel} role="status">
        {query
          ? 'No errands match your search. Try another location or description.'
          : 'No open errands right now. Check back soon.'}
      </p>
    )}
  </div>
)

const TripDetail = ({
  order,
  pageNumber,
  userId,
  actionError,
  onError,
}: {
  order: Errand
  pageNumber: number
  userId: string
  actionError: Error | null
  onError: (error: Error | null) => void
}) => (
  <aside className={page.detail} aria-labelledby="trip-heading">
    <h2 id="trip-heading">Could this fit your trip?</h2>
    <p className={page.route}>
      <strong>
        {order.pickup.name} · {order.pickup.address}
      </strong>
      <span>{order.deliveryLocation}</span>
    </p>
    <p>{order.description}</p>
    {order.notes ? <p className={styles.muted}>{order.notes}</p> : null}
    <p className={page.credits}>{order.creditReward} credits</p>
    <Link
      to="/errands/$orderId"
      params={{ orderId: order.id }}
      search={{
        tab: 'active',
        participation: 'all',
        page: pageNumber,
        posted: false,
      }}
    >
      View route
    </Link>
    {actionError && <p role="alert">{orderErrorMessage(actionError)}</p>}
    <OrderActions
      key={`${userId}:${order.id}`}
      order={order}
      userId={userId}
      onError={onError}
    />
  </aside>
)

const ErrandSummary = ({ order }: { order: Errand }) => (
  <>
    <strong>
      {order.pickup.name} · {order.pickup.address}
    </strong>
    <span>{order.deliveryLocation}</span>
    <span>{order.description}</span>
    <span>
      {order.creditReward} credits
      {order.status === 'OPEN' ? ' · Pickup ready' : ''}
    </span>
  </>
)
