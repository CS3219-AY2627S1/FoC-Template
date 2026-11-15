/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Reads the expiry time out of a JWT so the UI can warn before it runs out.
 * Author review: Reviewed and approved by @t-leongchuan
 */

// Reads `exp` for display only; validity is always decided by the server.

/** Returns when the token expires, in milliseconds since 1970 (like Date.now()), or null if unreadable. */
export function getTokenExpiryMs(token: string): number | null {
  const payloadPart = token.split('.')[1]
  if (!payloadPart) return null
  try {
    // base64url uses '-' and '_' where normal base64 uses '+' and '/'
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const payload: unknown = JSON.parse(atob(base64))
    if (typeof payload === 'object' && payload !== null && 'exp' in payload && typeof payload.exp === 'number') {
      return payload.exp * 1000 // JWT `exp` is in seconds; JavaScript time is in milliseconds
    }
    return null
  } catch {
    return null
  }
}
