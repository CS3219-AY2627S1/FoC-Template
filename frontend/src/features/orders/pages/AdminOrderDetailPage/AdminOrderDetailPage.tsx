import { Link, useParams, useSearch } from '@tanstack/react-router'
import { OrderDetails } from '../../components/OrderDetails/OrderDetails'
import { OrderTimeline } from '../../components/OrderTimeline/OrderTimeline'
import { DeliveryPhotos } from '../../components/DeliveryPhotos/DeliveryPhotos'
import { ErrandChat } from '../../components/ErrandChat/ErrandChat'
import { OrderStatusBadge } from '../../components/OrderStatusBadge/OrderStatusBadge'
import { OrderDispute } from '../../components/OrderDispute/OrderDispute'
import {
  OrderFeedback,
  OrderNotice,
} from '../../components/OrderFeedback/OrderFeedback'
import { useOrder } from '../../hooks/useOrders'
import styles from '../../styles/order.module.scss'

export const AdminOrderDetailPage = () => {
  const { orderId } = useParams({ from: '/admin/orders/$orderId' })
  const search = useSearch({ from: '/admin/orders/$orderId' })
  const query = useOrder(orderId)
  const order = query.data
  return (
    <div className={styles.page}>
      {search.auditPage !== undefined ? (
        <Link
          className={styles.back}
          to="/admin/audit-log"
          search={{ page: search.auditPage }}
        >
          ← Back to Audit log
        </Link>
      ) : (
        <Link className={styles.back} to="/admin/orders" search={search}>
          ← Back to requested orders
        </Link>
      )}
      <OrderFeedback
        error={query.error}
        loading={query.isPending}
        retry={() => void query.refetch()}
      />
      {order && !query.error && (
        <>
          {order.status === 'CREATING' && (
            <OrderNotice tone="warning" title="Creation is not confirmed">
              This creation request has an undetermined reservation result.
            </OrderNotice>
          )}
          {order.status === 'CREATE_FAILED' && (
            <OrderNotice tone="error" title="Creation failed">
              {order.creationFailureCode === 'INSUFFICIENT_BALANCE'
                ? 'Not enough available credits. No reservation was made for this attempt.'
                : order.creationFailureCode}
            </OrderNotice>
          )}
          <div className={styles.title}>
            <h1 className={styles.pageTitle}>Errand details</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className={styles.muted}>
            Errand #{order.id}
            {!order.dispute && ' · Read-only'}
          </p>
          <div className={styles.detailGrid}>
            <OrderDetails order={order} />
            <OrderTimeline order={order} />
            <DeliveryPhotos order={order} />
            <ErrandChat order={order} />
          </div>
          {query.userId && (
            <OrderDispute
              key={`${query.userId}:${order.id}`}
              order={order}
              userId={query.userId}
              admin
            />
          )}
        </>
      )}
    </div>
  )
}
