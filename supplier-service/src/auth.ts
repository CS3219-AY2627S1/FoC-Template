import { createHash } from 'node:crypto'
import { TtlCache } from './cache.ts'

// What the caller is trying to do.
export type Operation =
  | 'supplier.read'
  | 'supplier.create'
  | 'supplier.update'
  | 'supplier.deactivate'
  // Adding or removing one of your own favorites. It changes no supplier.
  | 'supplier.favorite'

export type Role = 'member' | 'administrator'

// The role each operation needs. The platform rule is F1.5.4: administrators
// create, update and deactivate suppliers, and any member may read them. The
// user-service decides whether the session's account holds the role.
const ROLE_FOR: Record<Operation, Role> = {
  'supplier.read': 'member',
  'supplier.create': 'administrator',
  'supplier.update': 'administrator',
  'supplier.deactivate': 'administrator',
  'supplier.favorite': 'member',
}

// The cookie the user-service sets when someone logs in.
const SESSION_COOKIE = 'relay_session'

export type AuthDecision =
  | { kind: 'authorized'; accountId: string }
  // No session was sent at all.
  | { kind: 'unauthenticated' }
  // Refused. `unavailable` is set when the reason is that the user-service could
  // not be asked, and not that it said no.
  | { kind: 'denied'; unavailable?: true }

export interface Authorizer {
  authorize(cookieHeader: string | undefined, operation: Operation): Promise<AuthDecision>
}

// The session token in a Cookie header, or null when there is none.
export function sessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const at = part.indexOf('=')
    if (at === -1 || part.slice(0, at).trim() !== SESSION_COOKIE) continue
    const value = part.slice(at + 1).trim()
    return value === '' ? null : value
  }
  return null
}

// The user-service documents about two seconds.
const TIMEOUT_MS = 2000

// Asks the user-service whether the session may perform the operation (F1.5.3):
//   POST {USER_SERVICE_URL}/internal/authorize
//   {"token": "<the relay_session cookie>", "requiredRole": "member" | "administrator"}
//   200 {"decision": "authorized", "accountId": "...", "roles": [...]}
//   200 {"decision": "denied"}
// Fail closed (N1.1.2): a timeout, a network error, a status other than 200 and
// any other answer all count as a refusal.
export class UserServiceAuthorizer implements Authorizer {
  private endpoint: URL

  constructor(baseUrl: string) {
    this.endpoint = new URL('/internal/authorize', baseUrl)
  }

  async authorize(cookieHeader: string | undefined, operation: Operation): Promise<AuthDecision> {
    const token = sessionToken(cookieHeader)
    if (!token) return { kind: 'unauthenticated' }

    let response: Response
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, requiredRole: ROLE_FOR[operation] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      return { kind: 'denied', unavailable: true }
    }
    if (!response.ok) return { kind: 'denied', unavailable: true }

    const body = (await response.json().catch(() => null)) as {
      decision?: unknown
      accountId?: unknown
    } | null
    if (body?.decision === 'denied') return { kind: 'denied' }
    if (body?.decision === 'authorized' && typeof body.accountId === 'string' && body.accountId !== '') {
      return { kind: 'authorized', accountId: body.accountId }
    }
    return { kind: 'denied', unavailable: true }
  }
}

// Remembers that a session was authorized to read, for a few seconds, so that a
// busy read does not wait on the user-service. Only the approval of a read is
// remembered. A refusal, an error, and every operation that changes a supplier
// go to the user-service each time. The cost is that an account suspended in
// the last few seconds can still read until the answer expires.
export class CachingAuthorizer implements Authorizer {
  private inner: Authorizer
  private cache: TtlCache<AuthDecision>

  constructor(inner: Authorizer, ttlMs: number, clock?: () => number) {
    this.inner = inner
    this.cache = new TtlCache(ttlMs, 10_000, clock)
  }

  authorize(cookieHeader: string | undefined, operation: Operation): Promise<AuthDecision> {
    const token = sessionToken(cookieHeader)
    if (!token || operation !== 'supplier.read') {
      return this.inner.authorize(cookieHeader, operation)
    }
    // Hashed so that the session token itself is not kept as a key.
    const key = createHash('sha256').update(token).digest('base64')
    return this.cache.get(
      key,
      () => this.inner.authorize(cookieHeader, operation),
      (decision) => decision.kind === 'authorized',
    )
  }
}
