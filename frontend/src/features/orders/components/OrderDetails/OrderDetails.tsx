import { MapPin, Store } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Errand } from '../../types/errand.types'
import { formatOrderTime } from '../../utils/orderFormat'
import styles from './OrderDetails.module.scss'

const creditLabels = {
  RESERVED: 'Reserved',
  SETTLEMENT_PENDING: 'Settlement pending',
  SETTLED: 'Settled',
  RELEASE_PENDING: 'Release pending',
  RELEASED: 'Released',
}

const Field = ({
  label,
  children,
  wide,
}: {
  label: string
  children: ReactNode
  wide?: boolean
}) => (
  <div className={styles.field} data-wide={wide || undefined}>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
)

// get the order details panel use up more space
export const OrderDetails = ({ order }: { order: Errand }) => (
  <section className={styles.panel}>
    <h2>{order.description}</h2>
    <p className={styles.route}>
      <span>
        <Store size={16} aria-hidden="true" />
        {order.pickup.name}
      </span>
      <span aria-label="to">→</span>
      <span>
        <MapPin size={16} aria-hidden="true" />
        {order.deliveryLocation}
      </span>
    </p>
    <dl className={styles.grid}>
      <Field label="Pickup location">
        {order.pickup.name}
        <small>{order.pickup.address}</small>
      </Field>
      <Field label="Deliver to">{order.deliveryLocation}</Field>
      <Field label="Item(s)" wide>
        {order.description}
      </Field>
      {order.notes && (
        <Field label="Notes" wide>
          {order.notes}
        </Field>
      )}
      <Field label="Requester">
        {order.requester.name ?? 'Name unavailable'}
      </Field>
      <Field label="Courier">
        {order.courier
          ? (order.courier.name ?? 'Name unavailable')
          : 'Not assigned yet'}
      </Field>
      <Field label="Reward">
        {order.creditReward} credits
        <small>
          {order.creditState
            ? creditLabels[order.creditState]
            : order.status === 'CREATE_FAILED'
              ? 'No credits reserved'
              : 'Reservation not confirmed'}
        </small>
      </Field>
      {order.status === 'OPEN' ? (
        <Field label="Accept before">{formatOrderTime(order.expiresAt)}</Field>
      ) : (
        <Field label="Posted">{formatOrderTime(order.createdAt)}</Field>
      )}
    </dl>
  </section>
)
