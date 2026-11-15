/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Typed own-user balance and transaction endpoint helpers for #65. Author review: Reviewed and approved by @phuc. */
import { apiRequest } from './client'
import type { CreditBalance, CreditTransactionPage, CreditTransactionQuery } from '../credits/types'

export function getCreditBalance(signal?: AbortSignal): Promise<CreditBalance> {
  return apiRequest<CreditBalance>('/me/credit', { signal })
}

export function listCreditTransactions(query: CreditTransactionQuery = {}, signal?: AbortSignal): Promise<CreditTransactionPage> {
  const params = new URLSearchParams()
  for (const key of ['from', 'to', 'page', 'size'] as const) {
    if (query[key] !== undefined) params.set(key, String(query[key]))
  }
  const search = params.toString()
  return apiRequest<CreditTransactionPage>(`/me/credit/transactions${search ? `?${search}` : ''}`, { signal })
}
