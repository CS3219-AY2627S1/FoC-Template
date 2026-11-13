"use client"

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

/** Pages to show: first, last, and a window around the current page. */
function pageWindow(current: number, total: number): (number | "gap")[] {
  const pages = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total))
  const sorted = [...pages].sort((a, b) => a - b)
  const result: (number | "gap")[] = []
  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1] > 1) result.push("gap")
    result.push(page)
  })
  return result
}

export function SupplierPagination({
  page,
  totalPages,
  hrefFor,
  onNavigate,
}: {
  page: number
  totalPages: number
  hrefFor: (page: number) => string
  onNavigate: (page: number) => void
}) {
  if (totalPages <= 1) return null

  const go = (target: number) => (event: React.MouseEvent) => {
    event.preventDefault()
    if (target >= 1 && target <= totalPages && target !== page) onNavigate(target)
  }

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={hrefFor(Math.max(1, page - 1))}
            onClick={go(page - 1)}
            aria-disabled={page === 1}
            className={page === 1 ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>
        {pageWindow(page, totalPages).map((item, i) =>
          item === "gap" ? (
            <PaginationItem key={`gap-${i}`} className="hidden sm:block">
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item} className={item === page ? undefined : "hidden sm:block"}>
              <PaginationLink href={hrefFor(item)} onClick={go(item)} isActive={item === page}>
                {item}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            href={hrefFor(Math.min(totalPages, page + 1))}
            onClick={go(page + 1)}
            aria-disabled={page === totalPages}
            className={page === totalPages ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
