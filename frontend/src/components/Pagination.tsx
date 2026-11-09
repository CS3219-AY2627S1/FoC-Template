/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Previous/next pagination for zero-based paged lists, modelled on SupplierPagination.
 * Author review: Reviewed and approved by @mattis.
 */
interface PaginationProps {
  readonly page: number
  readonly totalPages: number
  readonly totalItems: number
  /** Plural noun for the count, e.g. "errands" */
  readonly noun: string
  readonly label: string
  readonly onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, totalItems, noun, label, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  const buttonClass =
    'min-h-11 flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none'
  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row"
      aria-label={label}
    >
      <p className="text-sm text-slate-600">
        Page <span className="font-semibold text-navy-900">{page + 1}</span> of {totalPages} · {totalItems} {noun}
      </p>
      <div className="flex w-full gap-2 sm:w-auto">
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 0} className={buttonClass}>
          Previous
        </button>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1} className={buttonClass}>
          Next
        </button>
      </div>
    </nav>
  )
}
