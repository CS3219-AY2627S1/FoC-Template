import { statusLabels } from '../../utils/orderFormat'
import type { ErrandStatus } from '../../types/errand.types'
import styles from './OrderStatusBadge.module.scss'

export const OrderStatusBadge = ({ status }: { status: ErrandStatus }) => (
  <span className={styles.badge} data-status={status}>
    {statusLabels[status]}
  </span>
)
