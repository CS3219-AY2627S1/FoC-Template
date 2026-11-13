import { useNow } from '#/hooks/useNow'
import { Link } from '@tanstack/react-router'
import { useOrderStats } from '#/features/orders/hooks/useOrderOverview'
import { LiveOrdersPanel } from './components/LiveOrdersPanel/LiveOrdersPanel'
import { StatCard } from './components/StatCard/StatCard'
import { SupplierSummaryPanel } from './components/SupplierSummaryPanel/SupplierSummaryPanel'
import { useSuppliers } from '#/features/suppliers/hooks/useSuppliers'
import { useSupplierRealtimeUpdates } from '#/features/suppliers/hooks/useSupplierRealtimeUpdates'
import { summarizeSuppliers } from '#/features/suppliers/utils/supplierFormat'
import styles from './AdminOverviewPage.module.scss'

// temp data here, TODO afterwards
const sampleStudentStats = { registered: 7201, joinedThisWeek: 52 }

export const AdminOverviewPage = () => {
  useSupplierRealtimeUpdates()

  // include deactivated suppliers to summary
  const suppliers = useSuppliers({ inactive: true })
  const { data: orderStats } = useOrderStats()
  const now = useNow(60_000)
  const summary = suppliers.data
    ? summarizeSuppliers(suppliers.data, now)
    : null

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Overview</h1>

      <div className={styles.stats}>
        <StatCard
          label="Active suppliers"
          value={summary?.active ?? '—'}
          tone={summary ? 'default' : 'pending'}
          hint={
            summary && (
              <div className={styles.links}>
                <Link
                  to="/admin/suppliers"
                  search={{ openNow: true }}
                  className={styles.positiveLink}
                >
                  {summary.openNow} open now →
                </Link>
                {summary.deactivated > 0 && (
                  <Link
                    to="/admin/suppliers"
                    search={{ inactive: true }}
                    className={styles.mutedLink}
                  >
                    {summary.deactivated} deactivated
                  </Link>
                )}
              </div>
            )
          }
        />
        <StatCard
          label="Open errands"
          value={orderStats?.openErrands ?? '—'}
          hint={
            orderStats &&
            `+ ${orderStats.openErrandsSinceYesterday} since yesterday`
          }
          tone="positive"
        />
        <StatCard
          label="Registered students"
          value={sampleStudentStats.registered.toLocaleString('en-SG')}
          hint={`+ ${sampleStudentStats.joinedThisWeek} this week`}
          tone="positive"
        />
        <StatCard
          label="Open disputes"
          value={orderStats?.openDisputes ?? '—'}
          tone="danger"
        />
      </div>

      <LiveOrdersPanel />

      <SupplierSummaryPanel />
    </section>
  )
}
