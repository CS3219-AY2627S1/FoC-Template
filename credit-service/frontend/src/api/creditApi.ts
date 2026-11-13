import { expireSession, readSession } from '../auth/session'

export type CreditBalance = {
  userId: string
  availableBalance: number
  reservedBalance: number
  totalBalance: number
  updatedAt: string | null
}

export type LedgerEntryType =
  | 'INITIAL_ALLOCATION'
  | 'RESERVATION_CREATED'
  | 'RESERVATION_INCREASED'
  | 'RESERVATION_DECREASED'
  | 'RESERVATION_RELEASED'
  | 'SETTLEMENT_DEBIT'
  | 'SETTLEMENT_CREDIT'
  | 'COMPENSATION_DEBIT'
  | 'COMPENSATION_CREDIT'
  | 'ADMIN_CORRECTION'

export type CreditTransaction = {
  id: string
  operationId: string
  reservationId: string | null
  type: LedgerEntryType
  availableDelta: number
  reservedDelta: number
  availableBalanceAfter: number
  reservedBalanceAfter: number
  createdAt: string
}

export type TransactionPage = {
  content: CreditTransaction[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export class CreditApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = readSession()
  if (!session) throw new CreditApiError(401, 'Sign in is required')
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('Authorization', `${session.tokenType} ${session.accessToken}`)
  const response = await fetch(path, { ...init, headers })
  if (response.status === 401) expireSession()
  if (!response.ok) {
    let detail = 'We couldn’t load your credits'
    try {
      const problem = (await response.json()) as { detail?: unknown }
      if (typeof problem.detail === 'string') detail = problem.detail
    } catch {
      // Use the stable fallback when an upstream response is not JSON.
    }
    throw new CreditApiError(response.status, detail)
  }
  return (await response.json()) as T
}

export function getBalance() {
  return authenticatedRequest<CreditBalance>('/api/credits/me')
}

export function ensureCreditAccount() {
  return authenticatedRequest<CreditBalance>('/api/credits/me', {
    method: 'POST',
  })
}

export function getTransactions(page: number, size = 8) {
  const query = new URLSearchParams({ page: String(page), size: String(size) })
  return authenticatedRequest<TransactionPage>(
    `/api/credits/me/transactions?${query.toString()}`,
  )
}
