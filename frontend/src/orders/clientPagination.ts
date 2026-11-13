// Client-side pagination helper for order list views.
// Temporary until Order Service supports page/limit query params.
// During integration, replace callers of `paginateItems` with API responses
// that already include `{ items, page, totalPages }` (or equivalent).

export const REQUESTS_PER_PAGE = 6

export type PaginatedSlice<T> = {
  items: T[]
  page: number
  totalPages: number
  total: number
}

export function clampPage(page: number, totalPages: number): number {
  if (totalPages <= 0) return 1
  return Math.min(Math.max(page, 1), totalPages)
}

export function paginateItems<T>(
  items: T[],
  page: number,
  perPage: number = REQUESTS_PER_PAGE,
): PaginatedSlice<T> {
  const total = items.length
  const totalPages = Math.ceil(total / perPage)
  const safePage = clampPage(page, totalPages)
  const start = (safePage - 1) * perPage

  return {
    items: items.slice(start, start + perPage),
    page: safePage,
    totalPages,
    total,
  }
}
