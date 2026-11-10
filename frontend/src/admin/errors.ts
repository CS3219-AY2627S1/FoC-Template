/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Error text and shared button/input styles for the admin pages.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { ApiError, NetworkError } from '../api/client'

export const buttonClass = 'min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-navy-50 disabled:opacity-50'
export const inputClass = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900'

/** The server's own message where it has one (e.g. "This change would leave no active administrator") */
export function errorText(error: unknown): string {
  if (error instanceof NetworkError) return error.message
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Please sign in again.'
    if (error.status === 403 && error.code === 'FORBIDDEN') return 'Administrator access required.'
    if (error.status === 503) return 'The User Service is temporarily unavailable. Please try again shortly.'
    return error.message
  }
  return 'Something went wrong. Please try again.'
}
