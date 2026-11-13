export type OrderListSearch = {
  tab: 'active' | 'history'
  // 'all' follows the Request / Deliver role switch at home
  participation: 'all' | 'requested' | 'delivering'
  page: number
  q?: string
}
export const parsePage = (value: unknown) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0
export const parseOrderListSearch = (
  search: Record<string, unknown>,
): OrderListSearch => ({
  tab: search.tab === 'history' ? 'history' : 'active',
  participation:
    search.participation === 'requested' ||
    search.participation === 'delivering'
      ? search.participation
      : 'all',
  page: parsePage(search.page),
  q: typeof search.q === 'string' && search.q.trim() ? search.q : undefined,
})
export const parseAdminOrderSearch = (
  search: Record<string, unknown>,
): {
  requesterId: string
  page: number
  auditPage?: number
} => ({
  requesterId: typeof search.requesterId === 'string' ? search.requesterId : '',
  page: parsePage(search.page),
  auditPage: search.auditPage == null ? undefined : parsePage(search.auditPage),
})
