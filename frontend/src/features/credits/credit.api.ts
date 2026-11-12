/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-62): Added the credit transaction history API endpoint in the frontend to allow for fetching and displaying the user's credit transaction history
 * Author review: Code changes were checked and validated
 */


import { authenticatedFetch } from '../auth/auth.fetch'
import type {
  CreditHistoryPage,
  CreditTransaction,
  SpringPageResponse,
  WalletBalanceResponse,
} from './credit.types'

const creditApiBaseUrl = (import.meta.env.VITE_CREDIT_API_URL ?? '').trim().replace(/\/+$/, '')

type ProblemDetails = {
  detail?: string
  title?: string
}

export class CreditApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'CreditApiError'
    this.status = status
  }
}

export async function getAvailableBalance(signal?: AbortSignal): Promise<number> {
  let response: Response

  try {
    response = await authenticatedFetch(`${creditApiBaseUrl}/api/wallets/availableBalance`, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new CreditApiError('Could not connect to the Credit Service.', 0)
  }

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as ProblemDetails | null
    throw new CreditApiError(
      problem?.detail ?? problem?.title ?? 'Unable to load your credit balance.',
      response.status,
    )
  }

  const wallet = (await response.json()) as WalletBalanceResponse
  return wallet.availableBalance
}

export async function getTransactionHistory(
  params: { page?: number; size?: number } = {},
  signal?: AbortSignal,
): Promise<CreditHistoryPage> {
  const query = new URLSearchParams()
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.size !== undefined) query.set('size', String(params.size))
  const queryString = query.toString()

  let response: Response

  try {
    response = await authenticatedFetch(
      `${creditApiBaseUrl}/api/wallets/transactionHistory${queryString ? `?${queryString}` : ''}`,
      {
        headers: { Accept: 'application/json' },
        signal,
      },
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new CreditApiError('Could not connect to the Credit Service.', 0)
  }

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as ProblemDetails | null
    throw new CreditApiError(
      problem?.detail ?? problem?.title ?? 'Unable to load your credit history.',
      response.status,
    )
  }

  const body = (await response.json()) as SpringPageResponse<CreditTransaction>
  const meta = body.page ?? body
  const items = body.content ?? []

  return {
    items,
    number: meta.number ?? 0,
    size: meta.size ?? items.length,
    totalElements: meta.totalElements ?? items.length,
    totalPages: meta.totalPages ?? 1,
  }
}
