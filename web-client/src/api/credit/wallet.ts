import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { request } from '@/lib/http'
import type { Paginated } from '@/lib/http'

// F4.1.4: available, reserved and total (total = available + reserved).
export type Balance = {
  available: number
  reserved: number
  total: number
}

export type CreditTransactionType = 'allocation' | 'reservation' | 'transfer' | 'release'

// F4.5.2: one record per credit movement.
export type CreditTransaction = {
  _id: string
  userId: string
  errandRef?: string
  type: CreditTransactionType
  amount: number
  // ISO date string, e.g. "2026-10-16T07:57:13.573Z"
  createdAt: string
}

export function useBalance(userId: string) {
  return useQuery({
    queryKey: ['credit', 'balance', userId],
    queryFn: ({ signal }) => request<Balance>('credit', `/account/${userId}/balance`, { signal }),
  })
}

// F4.5.3: every credit movement of the account.
export function useTransactions(userId: string) {
  return useQuery({
    queryKey: ['credit', 'transactions', userId],
    queryFn: ({ signal }) => request<CreditTransaction[]>('credit', `/transactions/user/${userId}`, { signal }),
  })
}

export type LedgerFilters = {
  page: number
  pageSize: number
  // An exact account id, to scope the ledger to one student.
  userId?: string
}

// F4.5.3 (admin): the whole credit ledger for the dashboard, newest first and paged. Administrators
// only; the credit-service refuses everyone else with 403.
export function useLedger(filters: LedgerFilters) {
  return useQuery({
    queryKey: ['credit', 'ledger', filters],
    queryFn: ({ signal }) => request<Paginated<CreditTransaction>>('credit', '/transactions', { query: filters, signal }),
    // Keeps the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  })
}
