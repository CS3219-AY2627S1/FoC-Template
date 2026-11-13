import { Link } from '@tanstack/react-router'
import { OrderCard } from '../../components/OrderCard/OrderCard'
import { OrderFeedback } from '../../components/OrderFeedback/OrderFeedback'
import { useMyErrands } from '../../hooks/useOrders'
import type { Errand } from '../../types/errand.types'
import common from '../../styles/order.module.scss'
import styles from './RequesterHomePage.module.scss'

const activeDelivery = (orders: Array<Errand>, userId?: string) =>
  orders.find(
    (order) =>
      !!userId &&
      order.courier?.id === userId &&
      (order.status === 'ACCEPTED' || order.status === 'PICKED_UP'),
  )

export const RequesterHomePage = () => {
  const orders = useMyErrands({ as: 'all', view: 'all', page: 0, size: 3 })
  const recent = orders.data?.items ?? []
  const delivery = activeDelivery(recent, orders.userId)

  return (
    <div className={`${common.page} ${styles.page}`}>
      {delivery && (
        <aside className={styles.banner} aria-label="Current pickup">
          <div>
            <strong>Collect from {delivery.pickup.name}</strong>
            <span>
              Delivering · {delivery.pickup.address} →{' '}
              {delivery.deliveryLocation}
            </span>
          </div>
          <Link
            to="/errands/$orderId"
            params={{ orderId: delivery.id }}
            search={{
              tab: 'active',
              participation: 'all',
              page: 0,
              posted: false,
            }}
          >
            Continue pickup →
          </Link>
        </aside>
      )}
      <h1>Home</h1>
      <div className={styles.choices}>
        <Link to="/request" className={styles.choice}>
          <span className={styles.choiceTitle}>Request</span>
          <span className={styles.choiceCopy}>
            Get something brought to you.
          </span>
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
        </Link>
        <Link to="/deliver" className={styles.choice}>
          <span className={styles.choiceTitle}>Deliver</span>
          <span className={styles.choiceCopy}>
            Help someone and earn credits.
          </span>
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
        </Link>
      </div>

      <section className={styles.section} aria-labelledby="recent-heading">
        <h2 id="recent-heading">Recent errands</h2>
        <OrderFeedback
          error={orders.error}
          loading={orders.isPending}
          retry={() => void orders.refetch()}
        />
        {!orders.isPending && !orders.error && (
          <ul className={common.list}>
            {recent.map((order) => (
              <li key={order.id}>
                <OrderCard order={order} userId={orders.userId!} />
              </li>
            ))}
          </ul>
        )}
        {!orders.isPending && !orders.error && recent.length === 0 && (
          <p className={common.muted}>
            No errands yet. Request a pickup or deliver one to earn credits.
          </p>
        )}
      </section>
    </div>
  )
}
