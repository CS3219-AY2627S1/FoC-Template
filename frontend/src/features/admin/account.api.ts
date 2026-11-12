/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-10
 * Scope (AI-28): Generated the account list endpoint, admin users page and their tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

import { userApiBaseUrl } from '../auth/auth.api'
import { authenticatedFetch } from '../auth/auth.fetch'
import type { AccountType } from '../auth/auth.token'

export type AccountSummary = {
  id: string
  email: string
  name: string | null
  type: AccountType
}

export type AccountPage = {
  items: AccountSummary[]
  page: { number: number; size: number; totalElements: number; totalPages: number; hasNext: boolean; hasPrevious: boolean }
}

export type ListAccountsParams = {
  search?: string
  type?: AccountType
  page?: number
  size?: number
}

export class AccountApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AccountApiError'
    this.status = status
  }
}

// Plain-language messages for the errors these endpoints return; other statuses use the service's detail
const statusMessages: Record<number, string> = {
  401: 'Your session has expired. Please sign in again.',
  403: 'Only administrators can manage accounts, and not their own account type.',
  404: 'This account no longer exists.',
  409: 'At least one administrator must remain.',
}

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await authenticatedFetch(`${userApiBaseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new AccountApiError('Could not connect to the User Service.', 0)
  }

  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { detail?: unknown } | null
    const detail = typeof problem?.detail === 'string' && problem.detail ? problem.detail : null
    throw new AccountApiError(
      statusMessages[response.status] ?? detail ?? 'The request could not be completed.',
      response.status,
    )
  }
  return await response.json() as T
}

export function listAccounts(params: ListAccountsParams, signal?: AbortSignal) {
  const query = new URLSearchParams()
  if (params.search?.trim()) query.set('search', params.search.trim())
  if (params.type) query.set('type', params.type)
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.size !== undefined) query.set('size', String(params.size))
  const queryString = query.toString()
  return send<AccountPage>(`/api/v1/accounts${queryString ? `?${queryString}` : ''}`, { signal })
}

export function updateAccountType(accountId: string, type: AccountType) {
  return send<Omit<AccountSummary, 'name'>>(`/api/v1/accounts/${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  })
}
