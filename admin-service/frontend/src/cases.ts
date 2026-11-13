import { readSession } from './auth/session'

export type Summary = {
  caseId: string
  orderId: string
  state: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED'
  reviewerId: string | null
  revision: number
  createdAt: string
  reviewStatus?: 'LEGACY' | 'PREPARING' | 'READY' | 'REJECTED'
}
export type Statement = {
  reporterId: string
  description: string
  submittedAt: string
}
export type Report = {
  case: Summary
  ownStatement: Statement | null
  preparation?: {
    operationId: string
    status: 'PENDING' | 'READY' | 'REJECTED'
    failureCode?: string | null
  } | null
}
export type ReportContext = {
  orderId: string
  status:
    | 'OWN_REPORT'
    | 'ELIGIBLE'
    | 'INELIGIBLE'
    | 'CASE_PARTICIPANT'
    | 'PREPARING_REVIEW'
    | 'REPORT_REQUEST_AVAILABLE'
    | 'PREPARATION_AVAILABLE' // Compatibility with older Admin deployments.
  caseId: string | null
  state: Summary['state'] | null
}
export function isReportContext(
  value: unknown,
  orderId: string,
): value is ReportContext {
  if (!value || typeof value !== 'object') return false
  const context = value as Record<string, unknown>
  if (context.orderId !== orderId || typeof context.status !== 'string')
    return false
  if (
    ['OWN_REPORT', 'CASE_PARTICIPANT', 'PREPARING_REVIEW'].includes(
      context.status,
    )
  )
    return (
      typeof context.caseId === 'string' &&
      isUuid(context.caseId) &&
      typeof context.state === 'string' &&
      ['OPEN', 'UNDER_REVIEW', 'RESOLVED'].includes(context.state)
    )
  return (
    [
      'REPORT_REQUEST_AVAILABLE',
      'PREPARATION_AVAILABLE',
      'ELIGIBLE',
      'INELIGIBLE',
    ].includes(context.status) &&
    context.caseId === null &&
    context.state === null
  )
}
export type CreditAction = {
  operationId: string
  caseId: string
  targetUserId: string
  type: 'CREDIT_ADJUSTMENT'
  amount: number
  reason: string
  status: 'PENDING' | 'UNKNOWN' | 'SUCCEEDED' | 'REJECTED'
  reasonCode: string | null
  createdAt: string
  completedAt: string | null
}
export type BanAction = Omit<CreditAction, 'type' | 'amount'> & {
  type: 'BAN'
  amount: null
}
export type AdminAction = CreditAction | BanAction
export type Detail = {
  closure?: {
    operationId: string
    creditDisposition?: string
    resolution: string
    revision: number
    explanations: { operationId: string; explanation: string }[]
  } | null
  resolution?: string | null
  case: Summary
  statements: Statement[]
  actions?: AdminAction[]
}
export type Page = {
  content: Summary[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}
export class CaseError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// Translate API diagnostics at the display boundary; retain the original error
// for existing status, retry and reviewer-independence handling.
export function caseErrorMessage(error: CaseError): string {
  const messages: Record<string, string> = {
    'An errand UUID and an issue of 1–2000 characters are required.':
      'Pick the errand and tell us what happened (up to 2,000 characters).',
    'Reporting eligibility evidence is incomplete. Please try again later.':
      'We couldn’t check your report right now. Please try again.',
    'Reporting eligibility could not be verified. This is not confirmation that no report exists. Please retry.':
      'We couldn’t check your report right now. If you already sent one, check its status first.',
    'You have already submitted a statement for this errand.':
      'You already reported this errand. Open it to see its status.',
    'Resolution preparation is pending; this case no longer accepts reports.':
      'This case is being closed, so it can’t take new reports.',
    'This case has changed. Refresh it before claiming.':
      'This case just changed. Refresh, then assign it to yourself.',
    'This case has already been claimed or resolved.':
      'Someone already took or closed this case. Refresh to see it.',
    'Reviewer independence could not be verified. Refresh the evidence and try again. The case remains open.':
      'We couldn’t confirm you weren’t part of this errand. Refresh the evidence and try again.',
    'Conversation initiation is unconfirmed. Retry with the same request key.':
      'We’re not sure the conversation started. Retry to check.',
    'Conversation confirmation could not be saved. Retry with the same request key.':
      'We’re not sure the conversation started. Retry to check.',
    'Chat returned a conflicting conversation reference. Retry with the same request key.':
      'We’re not sure the conversation started. Retry to check.',
    'The case could not be saved. Retry using the same request key.':
      'We’re not sure your changes were saved. Retry to check.',
    'This request key was already used for a different request.':
      'This retry doesn’t match what you sent before. Refresh and check the case.',
    'This request key belongs to a different request.':
      'This retry doesn’t match what you sent before. Refresh and check the case.',
    'This request key belongs to a different operation.':
      'This retry doesn’t match what you sent before. Refresh and check the actions.',
    'Provide a resolution of 1–2000 characters, a revision and a request key.':
      'Add a closing reason (up to 2,000 characters).',
    'Provide one nonblank explanation per rejected action, without duplicates.':
      'Add one explanation for each rejected action.',
    'Explain every rejected action and only rejected actions before resolving.':
      'Explain each rejected action before closing the case.',
    'This case has pending or unknown actions. Wait for owner confirmation before resolving.':
      'Wait until every action is confirmed, then close the case.',
    'Resume the original prepared resolution with its original request key and body.':
      'Resume your earlier closing request instead of starting a new one.',
    'Resolution preparation is pending. Retry the same operation.':
      'This case is still closing. Resume to check.',
    'Resolution preparation is pending. Retry the original resolution to confirm the conversation barrier.':
      'This case is still closing its conversations. Resume to check.',
    'Fresh complete Chat evidence is required. Evidence is unavailable, stale, has blocking gaps, or does not cover the current case. The case remains open.':
      'Some evidence is missing or out of date. Refresh it, then resume closing.',
    'Check the request fields, UUID identifiers and Idempotency-Key header.':
      'Something went wrong. Check your entries and try again.',
    'Current account authorization denied or unavailable':
      error.status === 403
        ? 'You don’t have access to this.'
        : error.status === 401
          ? 'You’ve been signed out. Please sign in again.'
          : 'We couldn’t check your access. Please try again.',
    'A valid token is required': 'Please sign in again.',
    'Current active administrator access is required.':
      'You need an admin account for this.',
    'Current administrator access is required.':
      'You need an admin account for this.',
    'Select Admin mode.': 'Choose “Switch to Admin” in your account menu.',
    'Case storage is temporarily unavailable. Retry with the same request key if a submission is pending.':
      'We couldn’t load or save this case. Please try again.',
  }
  return Object.hasOwn(messages, error.message)
    ? messages[error.message]!
    : error.message
}
export async function request<T>(
  path: string,
  signal: AbortSignal,
  mutation?: { key: string; body: unknown },
): Promise<T> {
  const session = readSession()
  if (!session) throw new CaseError(401, 'Sign in to continue.')
  const response = await fetch('/api/admin/' + path, {
    method: mutation ? 'POST' : 'GET',
    signal,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(mutation
        ? {
            'Content-Type': 'application/json',
            'Idempotency-Key': mutation.key,
          }
        : {}),
    },
    ...(mutation ? { body: JSON.stringify(mutation.body) } : {}),
  })
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as {
      detail?: string
    }
    throw new CaseError(
      response.status,
      problem.detail || 'Something went wrong. Please try again.',
    )
  }
  return (await response.json()) as T
}
export const uuidPattern =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
export const isUuid = (value: string) =>
  new RegExp('^' + uuidPattern + '$').test(value)
