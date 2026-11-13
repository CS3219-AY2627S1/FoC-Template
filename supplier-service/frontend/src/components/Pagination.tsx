import { Button } from './DirectoryControls'
import styles from './DirectoryComponents.module.css'

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <nav aria-label="Supplier pages" className={styles.pagination}>
      <Button
        disabled={page <= 0}
        onClick={() => onPageChange(page - 1)}
        variant="secondary"
      >
        Previous
      </Button>
      <span aria-live="polite">
        Page <strong>{page + 1}</strong> of <strong>{totalPages}</strong>
      </span>
      <Button
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
        variant="secondary"
      >
        Next
      </Button>
    </nav>
  )
}
