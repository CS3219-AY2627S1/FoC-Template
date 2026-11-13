import { useNow } from '#/hooks/useNow'
import { Link } from '@tanstack/react-router'
import { Clock, MapPin, Store } from 'lucide-react'
import { OrderStatusBadge } from '../OrderStatusBadge/OrderStatusBadge'
import { formatOrderTime, remainingTime } from '../../utils/orderFormat'
import type { Errand } from '../../types/errand.types'
import type { OrderListSearch } from '../../utils/orderFilters'
import styles from './OrderCard.module.scss'

const participants = (order: Errand, userId: string) => {
  if (order.requester.id === userId) {
    return {
      role: 'Requested by you',
      other: order.courier
        ? `Courier: ${order.courier.name ?? 'Courier'}`
        : null,
    }
  }
  if (order.courier?.id === userId) {
    return {
      role:
        order.status === 'COMPLETED' ? 'You delivered' : "You're delivering",
      other: `For ${order.requester.name ?? 'Requester'}`,
    }
  }
  return {
    role: `Requested by ${order.requester.name ?? 'Requester'}`,
    other: null,
  }
}

export const OrderCard = ({
  order,
  userId,
  listSearch,
}: {
  order: Errand
  userId: string
  listSearch?: OrderListSearch
}) => {
  const courier = order.courier?.id === userId
  const people = participants(order, userId)
  return (
    <Link
      className={styles.card}
      to="/errands/$orderId"
      params={{ orderId: order.id }}
      search={{
        tab: listSearch?.tab ?? 'active',
        participation: listSearch?.participation ?? 'all',
        page: listSearch?.page ?? 0,
        // to keep the search, so when user click "Back to My Errands" will return to same results
        q: listSearch?.q,
        posted: false,
      }}
    >
      <div className={styles.body}>
        {order.status === 'OPEN' && (
          <span className={styles.expiry}>
            <Clock size={13} aria-hidden="true" />
            <OrderExpiry expiresAt={order.expiresAt} />
          </span>
        )}
        <strong className={styles.item}>{order.description}</strong>
        <p className={styles.route}>
          <span>
            <Store size={14} aria-hidden="true" />
            {order.pickup.name}
          </span>
          <span className={styles.to} aria-label="to">
            →
          </span>
          <span>
            <MapPin size={14} aria-hidden="true" />
            {order.deliveryLocation}
          </span>
        </p>
        <span className={styles.people}>
          {people.role} · {formatOrderTime(order.endedAt ?? order.createdAt)}
        </span>
        {people.other && <span className={styles.people}>{people.other}</span>}
      </div>
      <OrderStatusBadge status={order.status} />
      <span className={styles.credits} data-earned={courier || undefined}>
        {courier ? '+' : ''}
        {order.creditReward} credits
      </span>
      <span className={styles.arrow} aria-hidden="true">
        ›
      </span>
    </Link>
  )
}

const OrderExpiry = ({ expiresAt }: { expiresAt: string }) => {
  const now = useNow(1_000)
  return remainingTime(expiresAt, now)
}
