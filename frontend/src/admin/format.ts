/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Display helpers for the admin pages: Singapore time, short browser summaries,
 *        shortened hashes and labels for statuses, outcomes, reasons and audit actions.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import type { AccountRole, AccountStatus, AuditAction, LoginOutcome, LoginReason } from './types'

// Author's decision: Singapore time, like the credit history page. Seconds are shown because
// login attempts in a burst are often within the same minute.
const timeFormat = new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Singapore' })
const dateFormat = new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeZone: 'Asia/Singapore' })

export function sgTime(iso: string): string {
  return timeFormat.format(new Date(iso))
}

export function sgDate(iso: string): string {
  return dateFormat.format(new Date(iso))
}

/** "abcdef0123…" -> first 10 hex characters, enough to tell entries apart on screen */
export function shortHash(hash: string): string {
  return hash.length > 10 ? `${hash.slice(0, 10)}…` : hash
}

/**
 * A rough "Chrome on Linux" from a User-Agent header, by simple text matching. Approximate by
 * design (the full text is shown on hover); order matters because most browsers also claim
 * to be Safari/Chrome/Mozilla.
 */
export function browserSummary(userAgent: string | null): string {
  if (!userAgent) return 'Unknown browser'
  const ua = userAgent
  const browser =
    /PostmanRuntime\//.test(ua) ? 'Postman'
    : /^curl\//i.test(ua) ? 'curl'
    : /Playwright\//.test(ua) ? 'Playwright'
    : /^node\b|undici/i.test(ua) ? 'Node.js'
    : /Edg(e|A|iOS)?\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
    : /HeadlessChrome\//.test(ua) ? 'Headless Chrome'
    : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) && /Version\//.test(ua) ? 'Safari'
    : null
  const os =
    /Windows/.test(ua) ? 'Windows'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux|X11|ubuntu/i.test(ua) ? 'Linux'
    : null
  if (browser && os) return `${browser} on ${os}`
  return browser ?? (os ? `Browser on ${os}` : 'Other client')
}

export const STATUS_LABELS: Record<AccountStatus, string> = {
  PENDING_VERIFICATION: 'Pending verification', ACTIVE: 'Active', SUSPENDED: 'Suspended', CLOSED: 'Closed',
}
export const ROLE_LABELS: Record<AccountRole, string> = { MEMBER: 'Member', ADMINISTRATOR: 'Administrator' }
export const OUTCOME_LABELS: Record<LoginOutcome, string> = { SUCCESS: 'Success', FAILED: 'Failed', BLOCKED: 'Blocked' }
export const REASON_LABELS: Record<LoginReason, string> = {
  WRONG_PASSWORD: 'Wrong password', NO_SUCH_ACCOUNT: 'No such account', SUSPENDED: 'Account suspended',
  CLOSED: 'Account closed', NOT_VERIFIED: 'Not verified',
}
export const ACTION_LABELS: Record<AuditAction, string> = {
  FIRST_ADMIN_CREATED: 'First administrator created', ROLE_CHANGED: 'Role changed',
  ACCOUNT_SUSPENDED: 'Account suspended', ACCOUNT_RESTORED: 'Account restored',
}

export const STATUS_STYLES: Record<AccountStatus, string> = {
  PENDING_VERIFICATION: 'bg-slate-100 text-slate-700', ACTIVE: 'bg-emerald-50 text-emerald-800',
  SUSPENDED: 'bg-red-50 text-red-800', CLOSED: 'bg-slate-200 text-slate-700',
}
export const OUTCOME_STYLES: Record<LoginOutcome, string> = {
  SUCCESS: 'bg-emerald-50 text-emerald-800', FAILED: 'bg-amber-50 text-amber-800', BLOCKED: 'bg-red-50 text-red-800',
}
