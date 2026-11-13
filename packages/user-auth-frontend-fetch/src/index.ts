/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Generated implementation for authenticated fetch and token refresh
 * Author review: Verified correctness and tested in browser that user won't get a 401 error display on authorized endpoints even after access token expires.
 */

type RefreshState = { pending?: Promise<boolean>; generation: number }

const sharedState = globalThis as typeof globalThis & { __relayAuthRefresh?: RefreshState }
const state = (sharedState.__relayAuthRefresh ??= { generation: 0 })

export function refreshAccessToken(): Promise<boolean> {
  state.pending ??= globalThis
    .fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
    .then((response) => {
      if (response.ok) state.generation += 1
      return response.ok
    })
    .catch(() => false)
    .finally(() => {
      state.pending = undefined
    })
  return state.pending
}

function canRefresh(request: Request): boolean {
  const url = new URL(request.url, globalThis.location?.href ?? 'http://localhost')
  if (globalThis.location && url.origin !== globalThis.location.origin) return false
  if (!url.pathname.startsWith('/api/')) return false
  return !/^\/api\/auth\/(?:login|register|refresh|logout|verification(?:\/|$))/.test(url.pathname)
}

/** Retry protected requests after a tab wakes up with an expired access cookie. */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === 'string'
      ? new URL(input, globalThis.location?.href ?? 'http://localhost')
      : input
  const request = new Request(url, { ...init, credentials: 'include' })
  if (!canRefresh(request)) return globalThis.fetch(request)

  const generation = state.generation
  const retry = request.clone()
  const response = await globalThis.fetch(request)
  if (response.status !== 401) return response

  // Another request may already have refreshed the cookie while this one was in flight.
  if (state.generation === generation && !(await refreshAccessToken())) return response
  return globalThis.fetch(retry)
}
