import { Link } from '@tanstack/react-router'
import { Panel } from '../Panel/Panel'
import {
  categoryLabels,
  formatLocation,
  getErrorMessage,
} from '#/features/suppliers/utils/supplierFormat'
import { formatWeeklyHours } from '#/features/suppliers/utils/openingHours'
import { useSuppliers } from '#/features/suppliers/hooks/useSuppliers'
import styles from './SupplierSummaryPanel.module.scss'

type SupplierSummaryPanelProps = {
  /** Num of suppliers to show at dashboard page */
  limit?: number
}

// only show 5 suppliers on dashboard page
export const SupplierSummaryPanel = ({
  limit = 5,
}: SupplierSummaryPanelProps) => {
  const { data: suppliers, isPending, error } = useSuppliers({ inactive: true })
  const visible = (suppliers ?? [])
    .filter((supplier) => supplier.active)
    .slice(0, limit)

  return (
    <Panel
      title="Suppliers"
      action={
        <Link
          to="/admin/suppliers"
          className={`${styles.button} ${styles.small}`}
        >
          View all
        </Link>
      }
    >
      {isPending && <p className={styles.muted}>Loading suppliers…</p>}
      {Boolean(error) && (
        <p className={styles.alert} role="alert">
          {getErrorMessage(error)}
        </p>
      )}
      {!isPending && !error && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Location</th>
                <th>Hours</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((supplier) => (
                <tr key={supplier.id}>
                  <td className={styles.name}>{supplier.name}</td>
                  <td>{categoryLabels[supplier.category]}</td>
                  <td>{formatLocation(supplier)}</td>
                  <td className={styles.nowrap}>
                    {formatWeeklyHours(supplier.openingHours).map((line) => (
                      <span key={line} className={styles.hoursLine}>
                        {line}
                      </span>
                    ))}
                  </td>
                  <td className={styles.actions}>
                    <Link
                      to="/admin/suppliers/$supplierId/edit"
                      params={{ supplierId: supplier.id }}
                      className={`${styles.button} ${styles.small}`}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    No active suppliers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
