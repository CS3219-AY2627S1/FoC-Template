/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Reads the account id (`sub`) out of the access token, so errand pages can tell
 *        whether the viewer is the requester or the courier.
 * Author review: Reviewed and approved by @mattis.
 */
import { getToken } from './tokenStorage'

// User Service signs the account id as `sub` (user-service/src/token.ts). /whoami does not
// return the id, and errands name people only by id. Like tokenExpiry.ts this is for display
// only: Order Service checks who may do what on every request.

/** The token's `sub` claim, lower-cased, or null if it is missing or unreadable. */
export function getTokenSubject(token: string): string | null {
  const payloadPart = token.split('.')[1]
  if (!payloadPart) return null
  try {
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const payload: unknown = JSON.parse(atob(base64))
    if (typeof payload === 'object' && payload !== null && 'sub' in payload && typeof payload.sub === 'string') {
      return payload.sub.toLowerCase()
    }
    return null
  } catch {
    return null
  }
}

/** The logged-in account's id, or null when there is no readable token. */
export function getCurrentUserId(): string | null {
  const token = getToken()
  return token ? getTokenSubject(token) : null
}
