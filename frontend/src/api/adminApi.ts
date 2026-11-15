/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Typed calls to the User Service admin endpoints (accounts, suspend/restore, role,
 *        login events, audit log and chain check) for the admin pages (N2H1); account reviews
 *        and the account's errands from the Order Service as review evidence (N2H1b).
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { apiRequest } from './client'
import type {
  AccountPage, AccountQuery, AccountReview, AccountReviewDetail, AccountRole, AdminAccount, AuditPage, AuditQuery, ChainCheck,
  LoginEventPage, LoginEventQuery, ReviewOutcome, ReviewPage, ReviewQuery,
} from '../admin/types'
import type { ErrandPage } from '../errands/types'

function query(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function listAccounts(q: AccountQuery, before: string | null, limit: number, signal?: AbortSignal): Promise<AccountPage> {
  return apiRequest<AccountPage>(`/admin/accounts${query({ ...q, before: before ?? undefined, limit })}`, { signal })
}

export function getAccount(id: string, signal?: AbortSignal): Promise<AdminAccount> {
  return apiRequest<AdminAccount>(`/admin/accounts/${encodeURIComponent(id)}`, { signal })
}

export function suspendAccount(id: string, reason: string): Promise<unknown> {
  return apiRequest(`/users/${encodeURIComponent(id)}/suspend`, { method: 'POST', body: { reason } })
}

export function restoreAccount(id: string, reason: string): Promise<unknown> {
  return apiRequest(`/users/${encodeURIComponent(id)}/restore`, { method: 'POST', body: { reason } })
}

/** The reason is optional for role changes; an empty one is sent as "no reason" */
export function changeRole(id: string, role: AccountRole, reason: string): Promise<unknown> {
  return apiRequest(`/users/${encodeURIComponent(id)}/role`, { method: 'PUT', body: reason ? { role, reason } : { role } })
}

export function listLoginEvents(q: LoginEventQuery, before: string | null, limit: number, signal?: AbortSignal): Promise<LoginEventPage> {
  return apiRequest<LoginEventPage>(`/admin/login-events${query({ ...q, before: before ?? undefined, limit })}`, { signal })
}

export function listAudit(q: AuditQuery, before: string | null, limit: number, signal?: AbortSignal): Promise<AuditPage> {
  return apiRequest<AuditPage>(`/admin/audit${query({ ...q, before: before ?? undefined, limit })}`, { signal })
}

export function verifyAuditChain(): Promise<ChainCheck> {
  return apiRequest<ChainCheck>('/admin/audit/verify')
}

export function openReview(accountId: string, reason: string): Promise<AccountReview> {
  return apiRequest<AccountReview>('/admin/reviews', { method: 'POST', body: { accountId, reason } })
}

export function listReviews(q: ReviewQuery, before: string | null, limit: number, signal?: AbortSignal): Promise<ReviewPage> {
  return apiRequest<ReviewPage>(`/admin/reviews${query({ ...q, before: before ?? undefined, limit })}`, { signal })
}

export function getReview(id: string, signal?: AbortSignal): Promise<AccountReviewDetail> {
  return apiRequest<AccountReviewDetail>(`/admin/reviews/${encodeURIComponent(id)}`, { signal })
}

export function decideReview(id: string, outcome: ReviewOutcome, reasoning: string): Promise<AccountReview> {
  return apiRequest<AccountReview>(`/admin/reviews/${encodeURIComponent(id)}/decision`, { method: 'POST', body: { outcome, reasoning } })
}

export function cancelReview(id: string, reason: string): Promise<AccountReview> {
  return apiRequest<AccountReview>(`/admin/reviews/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: { reason } })
}

/** Review evidence straight from the Order Service (author's decision B7): one side of the account's errands */
export function listAccountErrands(accountId: string, as: 'requester' | 'courier', size: number, signal?: AbortSignal): Promise<ErrandPage> {
  const key = as === 'requester' ? 'requesterId' : 'courierId'
  return apiRequest<ErrandPage>(`/admin/errands${query({ [key]: accountId, page: 0, size })}`, { signal })
}
