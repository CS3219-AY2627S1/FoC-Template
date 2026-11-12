/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { refreshSession } from './auth.api'

let accessToken: string | null = null
let refreshPromise: Promise<string> | null = null
const sessionExpiredListeners = new Set<() => void>()

type AccessTokenPayload = {
  sub?: unknown
  type?: unknown
}

export type AccountType = 'Administrator' | 'Student'

function decodeAccessToken(token: string | null): AccessTokenPayload | null {
  if (!token) return null
  try {
    const payloadSegment = token.split('.')[1]
    if (!payloadSegment) return null
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/')
    const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return JSON.parse(atob(paddedBase64)) as AccessTokenPayload
  } catch {
    return null
  }
}

export function getAccessTokenSubject(token: string | null) {
  const payload = decodeAccessToken(token)
  return typeof payload?.sub === 'string' && payload.sub.length > 0 ? payload.sub : null
}

export function getAccessTokenType(token: string | null): AccountType | null {
  const type = decodeAccessToken(token)?.type
  return type === 'Administrator' || type === 'Student' ? type : null
}

export function getAccessToken() {
  return accessToken
}

export function setAccessToken(token: string) {
  accessToken = token
}

export function clearAccessToken() {
  accessToken = null
}

export function subscribeToSessionExpiry(listener: () => void) {
  sessionExpiredListeners.add(listener)
  return () => sessionExpiredListeners.delete(listener)
}

export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = refreshSession()
      .then((session) => {
        setAccessToken(session.accessToken)
        return session.accessToken
      })
      .catch((error: unknown) => {
        clearAccessToken()
        sessionExpiredListeners.forEach((listener) => listener())
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}
