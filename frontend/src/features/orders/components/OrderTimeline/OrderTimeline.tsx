import { formatOrderTime } from '../../utils/orderFormat'
import type { Errand } from '../../types/errand.types'
import styles from './OrderTimeline.module.scss'

export const OrderTimeline = ({ order }: { order: Errand }) => {
  const endedEarly = order.status === 'CANCELLED' || order.status === 'EXPIRED'
  const creating =
    order.status === 'CREATING' || order.status === 'CREATE_FAILED'
  const steps = creating
    ? [
        { label: 'Creation requested', at: order.createdAt },
        {
          label:
            order.status === 'CREATE_FAILED'
              ? 'Creation failed'
              : 'Creation confirmation',
          at: order.endedAt,
        },
      ]
    : endedEarly
      ? [
          { label: 'Request created', at: order.createdAt },
          ...(order.acceptedAt
            ? [{ label: 'Courier accepted', at: order.acceptedAt }]
            : []),
          ...(order.pickedUpAt
            ? [{ label: 'Picked up', at: order.pickedUpAt }]
            : []),
          {
            label:
              order.status === 'CANCELLED'
                ? order.dispute?.decision === 'RELEASE_CREDITS'
                  ? 'Cancelled by admin resolution'
                  : 'Cancelled'
                : 'Expired',
            at: order.endedAt,
          },
        ]
      : [
          { label: 'Request created', at: order.createdAt },
          { label: 'Courier accepted', at: order.acceptedAt },
          { label: 'Picked up', at: order.pickedUpAt },
          { label: 'Delivered', at: order.deliveredAt },
          {
            label:
              order.dispute?.decision === 'PAY_COURIER'
                ? 'Completed by admin resolution'
                : 'Received',
            at: order.status === 'COMPLETED' ? order.endedAt : undefined,
          },
        ]
  return (
    <section className={styles.panel} aria-label="Order progress">
      <h2>Delivery progress</h2>
      <ol className={styles.timeline}>
        {steps.map((step, index) => (
          <li
            key={step.label}
            data-done={!!step.at}
            data-terminal={endedEarly && index === steps.length - 1}
          >
            <span className={styles.node} aria-hidden="true">
              {step.at ? (endedEarly && index > 0 ? '–' : '✓') : ''}
            </span>
            <div>
              {step.label}
              {step.at && <small>{formatOrderTime(step.at)}</small>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
