import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { AdminRequesterPicker } from '../../components/AdminRequesterPicker/AdminRequesterPicker'
import { OrderStatusBadge } from '../../components/OrderStatusBadge/OrderStatusBadge'
import { OrderFeedback } from '../../components/OrderFeedback/OrderFeedback'
import { OrderPagination } from '../../components/OrderPagination/OrderPagination'
import { useAdminOrders } from '../../hooks/useOrders'
import { formatOrderTime } from '../../utils/orderFormat'
import styles from '../../styles/order.module.scss'
import pageStyles from './AdminOrderListPage.module.scss'

export const AdminOrderListPage = () => {
  const search = useSearch({ from: '/admin/orders' })
  const navigate = useNavigate()
  const query = useAdminOrders(search.requesterId, search.page)
  const error = query.error
  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Orders</h1>
      <AdminRequesterPicker
        requesterId={search.requesterId}
        onSelect={(requesterId) =>
          void navigate({
            to: '/admin/orders',
            search: { requesterId, page: 0 },
          })
        }
      />
      {!search.requesterId ? (
        <p className={styles.muted}>
          Choose a Requester to view their requested orders and creation
          attempts.
        </p>
      ) : (
        <>
          <h2 className={pageStyles.sectionHeading}>Requested orders</h2>
          <OrderFeedback
            error={error}
            loading={query.isPending}
            retry={() => void query.refetch()}
          />
          {query.data && !error && (
            <>
              {!query.data.total ? (
                <p className={styles.panel}>This Requester has no orders.</p>
              ) : (
                <div
                  className={pageStyles.tableWrap}
                  role="region"
                  aria-label="Requested orders table"
                  tabIndex={0}
                >
                  <table className={pageStyles.table}>
                    <thead>
                      <tr>
                        <th>Errand</th>
                        <th>Status</th>
                        <th>Reward</th>
                        <th>Credit status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {query.data.items.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <Link
                              className={styles.link}
                              to="/admin/orders/$orderId"
                              params={{ orderId: order.id }}
                              search={search}
                            >
                              {order.pickup.name} → {order.deliveryLocation}
                            </Link>
                            <small>{order.id}</small>
                          </td>
                          <td>
                            <OrderStatusBadge status={order.status} />
                          </td>
                          <td>{order.creditReward} credits</td>
                          <td>{order.creditState ?? 'Not confirmed'}</td>
                          <td>{formatOrderTime(order.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <OrderPagination
                page={search.page}
                total={query.data.total}
                pending={query.isFetching}
                onPage={(page) =>
                  void navigate({
                    to: '/admin/orders',
                    search: { ...search, page },
                    replace: true,
                  })
                }
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
