import { Button } from '@base-ui/react/button'
import { orderErrorMessage } from '../../utils/orderErrors'
import styles from '../../styles/order.module.scss'
import type { ReactNode } from 'react'

export const OrderNotice = ({
  tone,
  title,
  children,
}: {
  tone: 'success' | 'warning' | 'error'
  title: string
  children?: ReactNode
}) => (
  <div
    className={styles.feedback}
    data-tone={tone}
    role={tone === 'error' ? 'alert' : 'status'}
  >
    <strong>{title}</strong>
    {children && <p>{children}</p>}
  </div>
)
export const OrderFeedback = ({
  error,
  loading,
  retry,
}: {
  error?: Error | null
  loading?: boolean
  retry?: () => void
}) =>
  error ? (
    <OrderNotice tone="error" title={orderErrorMessage(error)}>
      {retry && (
        <Button className={styles.secondary} onClick={retry}>
          Try again
        </Button>
      )}
    </OrderNotice>
  ) : loading ? (
    <p role="status">Loading errands…</p>
  ) : null
