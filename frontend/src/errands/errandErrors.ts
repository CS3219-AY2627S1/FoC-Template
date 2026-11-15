/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Member-facing wording for the Order Service error codes.
 * Author review: Reviewed and approved by @mattis.
 */
import { ApiError, NetworkError } from '../api/client'
import { STATE_LABELS } from './presentation'
import { ERRAND_STATES, type ErrandState } from './types'

export interface ErrorCopy {
  readonly title: string
  readonly message: string
}

const UNAVAILABLE: ErrorCopy = {
  title: 'Errands are temporarily unavailable',
  message: 'Order Service, or a service it relies on, is not answering. Please try again shortly.',
}

/** For a page that could not load an errand or a list of errands. */
export function describeLoadError(error: unknown): ErrorCopy {
  if (error instanceof NetworkError) {
    return { title: "We couldn't reach the server", message: 'Check your connection, then try again.' }
  }
  if (error instanceof ApiError) {
    if (error.status === 401) return { title: 'Your session has ended', message: 'Please log in again to continue.' }
    if (error.status === 404) {
      return {
        title: 'Errand not found',
        message: "It doesn't exist, or it is no longer open and you are not its requester or courier.",
      }
    }
    if (error.status === 503) return UNAVAILABLE
    return { title: "Errands couldn't be loaded", message: error.message }
  }
  return { title: "Errands couldn't be loaded", message: 'Something went wrong. Please try again.' }
}

/** For a lifecycle action (accept, pickup, ...) that the server refused. */
export function describeActionError(error: unknown): ErrorCopy {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'ERRAND_NO_LONGER_AVAILABLE':
        return {
          title: 'This errand is no longer available',
          message: 'Another courier accepted it first, or it was cancelled or expired.',
        }
      case 'CANNOT_ACCEPT_OWN_ERRAND':
        return { title: "You can't accept your own errand", message: 'Another member has to deliver it.' }
      case 'DEADLINE_PASSED':
        return {
          title: 'The deadline for this step has passed',
          message: 'The errand will move on automatically. The page shows its latest state.',
        }
      case 'INVALID_STATE': {
        const now = stateLabel(error.currentState)
        return {
          title: 'This errand has already moved on',
          message: now
            ? `It is now ${now}, so that step no longer applies. The page shows its latest state.`
            : 'That step no longer applies. The page shows its latest state.',
        }
      }
      case 'FORBIDDEN':
        return { title: "You can't do that", message: 'Only the requester or the courier of this errand can take that step.' }
      case 'NOT_FOUND':
        return describeLoadError(error)
      case 'VALIDATION_ERROR':
        return { title: 'Check what you entered', message: Object.values(error.details).join(' ') || error.message }
    }
  }
  return describeLoadError(error)
}

/** For POST /errands. Field problems are shown next to the fields; this covers the rest. */
export function describeCreateError(error: unknown): ErrorCopy {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'VALIDATION_ERROR':
        return { title: 'Check the highlighted fields', message: 'Order Service did not accept some of the details.' }
      case 'SUPPLIER_UNAVAILABLE':
        return {
          title: 'That supplier is no longer available',
          message: 'It may have been archived. Choose another supplier and try again.',
        }
      case 'SUPPLIER_ARCHIVED':
        return { title: 'That supplier is archived', message: 'Restore it, or choose another supplier.' }
      case 'SERVICE_UNAVAILABLE':
        return UNAVAILABLE
    }
  }
  if (error instanceof NetworkError) {
    return { title: "We couldn't reach the server", message: 'Your errand was not posted. Check your connection and try again.' }
  }
  return { title: "Your errand wasn't posted", message: error instanceof Error ? error.message : 'Something went wrong. Please try again.' }
}

/** True when the server says the errand's state differs from what the page shows, so reloading helps. */
export function isStaleErrandError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    ['ERRAND_NO_LONGER_AVAILABLE', 'INVALID_STATE', 'DEADLINE_PASSED', 'CANNOT_ACCEPT_OWN_ERRAND'].includes(error.code)
  )
}

function stateLabel(state: string | undefined): string | null {
  if (!state || !(ERRAND_STATES as readonly string[]).includes(state)) return null
  return STATE_LABELS[state as ErrandState].toLowerCase()
}
