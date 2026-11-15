/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Response models for the User Service admin endpoints used by the admin pages (N2H1).
 * Author review: Reviewed and approved by @t-leongchuan
 */

export type AccountStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
export type AccountRole = 'MEMBER' | 'ADMINISTRATOR'

export interface AdminAccount {
  id: string
  username: string
  displayName: string
  email: string
  role: AccountRole
  status: AccountStatus
  createdAt: string
  /** Newest successful login still in the login log (90 days), or null */
  lastLoginAt: string | null
}

export interface AccountPage {
  accounts: AdminAccount[]
  nextCursor: string | null
}

export interface AccountQuery {
  search?: string
  status?: AccountStatus
  role?: AccountRole
}

export type LoginOutcome = 'SUCCESS' | 'FAILED' | 'BLOCKED'
export type LoginReason = 'WRONG_PASSWORD' | 'NO_SUCH_ACCOUNT' | 'SUSPENDED' | 'CLOSED' | 'NOT_VERIFIED'

export interface LoginEvent {
  id: string
  occurredAt: string
  /** null for attempts on a username or email that has no account */
  account: { id: string; username: string | null } | null
  outcome: LoginOutcome
  reason: LoginReason | null
  ipAddress: string | null
  userAgent: string | null
}

export interface LoginEventPage {
  events: LoginEvent[]
  nextCursor: string | null
}

export interface LoginEventQuery {
  accountId?: string
  outcome?: LoginOutcome
  reason?: LoginReason
}

export type AuditAction = 'FIRST_ADMIN_CREATED' | 'ROLE_CHANGED' | 'ACCOUNT_SUSPENDED' | 'ACCOUNT_RESTORED'
  | 'REVIEW_OPENED' | 'REVIEW_DECIDED' | 'REVIEW_CANCELLED'

export interface AuditEntry {
  id: string
  occurredAt: string
  actor: { type: 'USER' | 'SYSTEM'; id: string | null; username: string | null }
  action: AuditAction
  target: { id: string; username: string | null }
  previousValue: string | null
  newValue: string
  reason: string | null
  /** Hash of the entry before this one: the chain's link */
  previousHash: string
  hash: string
}

export interface AuditPage {
  entries: AuditEntry[]
  nextCursor: string | null
}

export interface AuditQuery {
  targetId?: string
}

export interface ChainCheck {
  valid: boolean
  checkedEntries: number
  firstInvalidId: string | null
  latestHash: string | null
}

export const ACCOUNT_STATUSES: readonly AccountStatus[] = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'CLOSED']
export const ACCOUNT_ROLES: readonly AccountRole[] = ['MEMBER', 'ADMINISTRATOR']
export const LOGIN_OUTCOMES: readonly LoginOutcome[] = ['SUCCESS', 'FAILED', 'BLOCKED']
export const LOGIN_REASONS: readonly LoginReason[] = ['WRONG_PASSWORD', 'NO_SUCH_ACCOUNT', 'SUSPENDED', 'CLOSED', 'NOT_VERIFIED']
/** Same rule as the User Service: 1-500 characters after trimming */
export const REASON_MAX = 500

// ---- Account reviews (N2H1b) -------------------------------------------------------------

export type ReviewStatus = 'OPEN' | 'DECIDED' | 'CANCELLED'
export type ReviewOutcome = 'REINSTATE' | 'KEEP_SUSPENDED' | 'SUSPEND' | 'NO_ACTION'
export const REVIEW_STATUSES: readonly ReviewStatus[] = ['OPEN', 'DECIDED', 'CANCELLED']

/** Counts the User Service saves when a review is decided (author's decision B6) */
export interface ReviewEvidence {
  capturedAt: string
  failedLoginsLast7Days: number
  blockedLoginsLast7Days: number
  failedLoginsLast90Days: number
  blockedLoginsLast90Days: number
  auditEntriesLast90Days: number
}

export interface AccountReview {
  id: string
  account: { id: string; username: string; displayName: string; status: AccountStatus }
  status: ReviewStatus
  statusAtOpen: 'ACTIVE' | 'SUSPENDED'
  allowedOutcomes: ReviewOutcome[]
  openedBy: { id: string; username: string }
  openedAt: string
  openReason: string
  closedBy: { id: string; username: string } | null
  closedAt: string | null
  outcome: ReviewOutcome | null
  reasoning: string | null
  evidence: ReviewEvidence | null
}

export interface AccountReviewDetail extends AccountReview {
  /** For an open review: the same counts as they are right now */
  currentEvidence: ReviewEvidence | null
}

export interface ReviewPage {
  reviews: AccountReview[]
  nextCursor: string | null
}

export interface ReviewQuery {
  accountId?: string
  status?: ReviewStatus
}
