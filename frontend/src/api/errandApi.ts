/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Typed calls to the Order Service member errand endpoints.
 * Author review: Reviewed and approved by @mattis.
 */
import { apiRequest } from './client'
import type {
  CreateErrandRequest,
  Errand,
  ErrandDetail,
  ErrandPage,
  MemberAction,
  MyErrandsQuery,
} from '../errands/types'

const ERRAND_PATH = '/errands'

/** OPEN errands posted by other people, soonest listing deadline first. */
export function listOpenErrands(query: { page?: number; size?: number } = {}, signal?: AbortSignal): Promise<ErrandPage> {
  return apiRequest<ErrandPage>(withQuery(`${ERRAND_PATH}/open`, query), { signal })
}

/** The caller's own errands, as requester or as courier, newest first. */
export function listMyErrands(query: MyErrandsQuery, signal?: AbortSignal): Promise<ErrandPage> {
  const { as, state, page, size } = query
  return apiRequest<ErrandPage>(withQuery(`${ERRAND_PATH}/mine`, { as, state, page, size }), { signal })
}

export function getErrand(id: string, signal?: AbortSignal): Promise<ErrandDetail> {
  return apiRequest<ErrandDetail>(errandPath(id), { signal })
}

/** Answers 202 with the errand in PENDING_RESERVATION; Credit Service decides whether it opens. */
export function createErrand(body: CreateErrandRequest): Promise<Errand> {
  return apiRequest<Errand>(ERRAND_PATH, { method: 'POST', body })
}

/** Runs one lifecycle step. Only reject takes a body, and its reason is optional. */
export function runErrandAction(id: string, action: MemberAction, reason?: string): Promise<Errand> {
  const body = action === 'reject' && reason ? { reason } : undefined
  return apiRequest<Errand>(`${errandPath(id)}/${action}`, { method: 'POST', body })
}

function errandPath(id: string): string {
  return `${ERRAND_PATH}/${encodeURIComponent(id)}`
}

function withQuery(path: string, query: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const queryString = search.toString()
  return queryString ? `${path}?${queryString}` : path
}
