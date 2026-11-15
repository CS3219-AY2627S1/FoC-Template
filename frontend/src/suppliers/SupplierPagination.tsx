/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Implemented API-backed, mobile-friendly Supplier pagination for
 * issue #29.
 * Author review: Reviewed and approved by @ron.
 */
interface SupplierPaginationProps {
  readonly page: number
  readonly totalPages: number
  readonly totalItems: number
  readonly onPageChange: (page: number) => void
}

export function SupplierPagination({ page, totalPages, totalItems, onPageChange }: SupplierPaginationProps) {
  if (totalPages <= 1) return null

  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row"
      aria-label="Supplier catalogue pages"
    >
      <p className="text-sm text-slate-600">
        Page <span className="font-semibold text-navy-900">{page + 1}</span> of {totalPages} · {totalItems} Suppliers
      </p>
      <div className="flex w-full gap-2 sm:w-auto">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 0}
          className="min-h-11 flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="min-h-11 flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
        >
          Next
        </button>
      </div>
    </nav>
  )
}
