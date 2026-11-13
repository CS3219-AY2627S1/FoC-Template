import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { OrderFeedback } from '../../components/OrderFeedback/OrderFeedback'
import { OrderPagination } from '../../components/OrderPagination/OrderPagination'
import { useDisputes } from '../../hooks/useDisputes'
import {
  disputeDecisionLabels,
  disputeStatusLabels,
} from '../../utils/disputes'
import { formatOrderTime, shortOrderId } from '../../utils/orderFormat'
import styles from '../../styles/order.module.scss'
import table from '../AdminOrderListPage/AdminOrderListPage.module.scss'

export const AdminDisputeLogPage = () => {
  const { page } = useSearch({ from: '/admin/audit-log' })
  const navigate = useNavigate()
  const query = useDisputes(page)
  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Audit log</h1>
      <h2 className={styles.sectionTitle}>Order disputes</h2>
      <OrderFeedback
        error={query.error}
        loading={query.isPending}
        retry={() => void query.refetch()}
      />
      {query.data && !query.error && (
        <>
          {!query.data.total ? (
            <p className={styles.panel}>No disputes have been reported.</p>
          ) : (
            <div
              className={table.tableWrap}
              role="region"
              aria-label="Dispute audit log"
              tabIndex={0}
            >
              <table className={table.table}>
                <thead>
                  <tr>
                    <th>Order / case</th>
                    <th>Reported by</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((dispute) => (
                    <tr key={dispute.id}>
                      <td>
                        <Link
                          className={styles.link}
                          to="/admin/orders/$orderId"
                          params={{ orderId: dispute.orderId }}
                          search={{ requesterId: '', page: 0, auditPage: page }}
                          title={dispute.orderId}
                        >
                          Order #{shortOrderId(dispute.orderId)}
                        </Link>
                        <small title={dispute.id}>
                          Case #{shortOrderId(dispute.id)}
                        </small>
                      </td>
                      <td title={dispute.reporterId}>
                        {shortOrderId(dispute.reporterId)}
                      </td>
                      <td>{formatOrderTime(dispute.createdAt)}</td>
                      <td>{disputeStatusLabels[dispute.status]}</td>
                      <td>
                        {dispute.decision ? (
                          <>
                            {disputeDecisionLabels[dispute.decision]}
                            <small title={dispute.adminId ?? undefined}>
                              Admin{' '}
                              {dispute.adminId && shortOrderId(dispute.adminId)}
                              {dispute.decidedAt &&
                                ` · ${formatOrderTime(dispute.decidedAt)}`}
                            </small>
                          </>
                        ) : (
                          'Awaiting admin decision'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <OrderPagination
            page={page}
            total={query.data.total}
            pending={query.isFetching}
            label="disputes"
            onPage={(next) =>
              void navigate({
                to: '/admin/audit-log',
                search: { page: next },
                replace: true,
              })
            }
          />
        </>
      )}
    </div>
  )
}
