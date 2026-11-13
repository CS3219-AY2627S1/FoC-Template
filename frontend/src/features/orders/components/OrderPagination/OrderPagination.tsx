import { useEffect } from 'react'
import { Button } from '@base-ui/react/button'
import styles from '../../styles/order.module.scss'

export const OrderPagination = ({
  page,
  total,
  size = 20,
  onPage,
  pending = false,
  label = 'errands',
}: {
  page: number
  total: number
  size?: number
  onPage: (page: number) => void
  pending?: boolean
  label?: string
}) => {
  const last = Math.max(0, Math.ceil(total / size) - 1)
  useEffect(() => {
    if (!pending && page > last) onPage(last)
  }, [last, page, pending, onPage])
  if (total <= size && page === 0) return null
  return (
    <nav className={styles.pagination} aria-label="Order pages">
      <Button
        className={styles.secondary}
        disabled={pending || page === 0}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      <span>
        Page {Math.min(page, last) + 1} of {last + 1} · {total} {label}
      </span>
      <Button
        className={styles.secondary}
        disabled={pending || page >= last}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  )
}
