type PaginationProps = {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  if (pageCount === 1) return null

  // Phones: page count on top, two equal buttons below. From sm: one row, count in the middle.
  return (
    <nav aria-label="Pages" className="grid grid-cols-2 items-center gap-3 sm:flex sm:justify-between">
      <p className="col-span-2 text-center nums-tabular text-muted sm:order-2" aria-live="polite">
        Page {page} of {pageCount}
      </p>
      <button
        type="button"
        className="ds-btn ds-btn--glass sm:order-1"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>
      <button
        type="button"
        className="ds-btn ds-btn--glass sm:order-3"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </nav>
  )
}