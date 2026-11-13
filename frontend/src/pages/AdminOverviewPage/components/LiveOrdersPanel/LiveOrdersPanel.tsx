import { Panel } from '../Panel/Panel'
import { useLiveOrders } from '#/features/orders/hooks/useOrderOverview'
import type { AdminOverviewOrderStatus } from '#/features/orders/types/adminOverview.types'
import styles from './LiveOrdersPanel.module.scss'

const statusLabels: Record<AdminOverviewOrderStatus, string> = {
  REQUESTED: 'Requested',
  ACCEPTED: 'Accepted',
  PICKED_UP: 'Picked up',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
}

export const LiveOrdersPanel = () => {
  const { data: orders = [] } = useLiveOrders()
  return (
    <Panel
      title="Live Orders"
      action={
        <button
          type="button"
          className={styles.viewAll}
          disabled
          title="Order management is not available yet"
        >
          View all
        </button>
      }
    >
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Order</th>
              <th>Requester</th>
              <th>Courier</th>
              <th>Pickup</th>
              <th>Status</th>
              <th>Credits</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className={styles.id}>#{order.id}</td>
                <td>
                  {order.requester ?? <span className={styles.none}>—</span>}
                </td>
                <td>
                  {order.courier ?? <span className={styles.none}>—</span>}
                </td>
                <td>{order.pickup}</td>
                <td>
                  <span className={styles.status} data-status={order.status}>
                    {statusLabels[order.status]}
                  </span>
                </td>
                <td>{order.credits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
