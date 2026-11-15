/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Page-number helpers for the errand lists.
 * Author review: Reviewed and approved by @mattis.
 */
import type { ErrandPage } from './types'

/** Zero-based page from `?page=`; anything that isn't a whole number is page 0. */
export function pageFromParams(params: URLSearchParams): number {
  const raw = params.get('page')
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) : 0
}

/** Order Service pages carry totalItems but not totalPages. */
export function totalPages(page: Pick<ErrandPage, 'totalItems' | 'size'>): number {
  return Math.max(1, Math.ceil(page.totalItems / page.size))
}
