/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: URL filters and Singapore inclusive calendar-day conversion for #65.
 * Author review: Reviewed and approved by @phuc. */
import type { CreditTransactionQuery } from './types'

export const PAGE_SIZES = [20, 50, 100] as const

export function historyFilters(params: URLSearchParams) {
  const rawPage = params.get('page') ?? '0'
  const requestedPage = Number(rawPage)
  const size = PAGE_SIZES.find((value) => String(value) === params.get('size')) ?? 20
  const page = /^\d+$/.test(rawPage) && Number.isSafeInteger(requestedPage * size) ? requestedPage : 0
  return { from: params.get('from') ?? '', to: params.get('to') ?? '', page, size }
}

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function dateRangeError(from: string, to: string): string | null {
  if ((from && !validDay(from)) || (to && !validDay(to))) return 'Enter valid dates in the date fields.'
  if (to === '9999-12-31') return 'Choose an end date before 31 December 9999.'
  if (from && to && from > to) return 'The end date must be on or after the start date.'
  return null
}

/** The UI end date is inclusive; the API end timestamp is exclusive. */
export function transactionQuery(filters: ReturnType<typeof historyFilters>): CreditTransactionQuery {
  const error = dateRangeError(filters.from, filters.to)
  if (error) throw new Error(error)
  let to: string | undefined
  if (filters.to) {
    const nextDay = new Date(`${filters.to}T00:00:00Z`)
    nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    to = `${nextDay.toISOString().slice(0, 10)}T00:00:00+08:00`
  }
  return { from: filters.from ? `${filters.from}T00:00:00+08:00` : undefined, to, page: filters.page, size: filters.size }
}
