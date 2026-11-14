/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Created the shared fetch wrapper for the frontend. The access token is held in memory only and
 *        the httpOnly refresh cookie restores it through POST /auth/refresh (team decision in chat,
 *        2026-09-30; cookie behaviour per instructions.md Stage 4). Requests use same-origin paths
 *        (Vite proxy in development, API gateway in deployment). No requirements, architecture, schema,
 *        or API decisions were made by the AI tool.
 * Author review: Congchen
  *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Identical in-flight GET requests share one network call. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Order Service frontend integration - ApiError keeps the response body (order-service
 *        transition errors carry their code as `error`), and getAccessToken() lets the Socket.IO
 *        client send the in-memory token in its handshake.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Stage 16b of instructions.md - proactive refresh (schedules a refresh 60s before the
 *        current access token's exp, reusing the existing shared in-flight refresh; cancelled
 *        whenever the token is cleared), ApiError now carries retryAfterSeconds from the
 *        service's Retry-After header (for ResendButton's cooldown), and the JWT-claim decoder
 *        moved here from api/auth.js as decodeAccessTokenClaims so this file can reuse it too.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Stage 23c of instructions.md - refreshAccessToken now also hands the response's
 *        sessionTimeLeftSeconds (added to POST /auth/refresh in stage 23b) to a registered
 *        onSessionTimeLeft callback, the same single-callback pattern already used by
 *        onSessionExpired. This covers session restore, the proactive refresh below, and the
 *        refresh-after-401 retry in send(), since all three call refreshAccessToken(). Added
 *        recordSessionTimeLeft so login() in api/auth.js (which gets its own
 *        sessionTimeLeftSeconds directly from POST /auth/login, not via refreshAccessToken) can
 *        feed the same callback.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Stage 24 of instructions.md - ApiError now also reads credit-service's documented
 *        `{ error: { code, message } }` envelope (credit-service/API.md), which this file
 *        previously only parsed as the user/order-service shapes (`{ message, code }` top
 *        level), leaving `.message`/`.code` undefined for every credit-service error. Falls
 *        back to the nested values only when the top-level ones are absent, so order-service's
 *        own `body.error` (a string code, not an object) is unaffected.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Stage 26e - withQuery now sends an array value as a repeated param (one `.append`
 *        per entry) instead of stringifying it, for the audit log page's `action` filter
 *        (GET /admin/audit-logs?action=X&action=Y). Every other caller still passes scalars,
 *        so this is additive.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

// In memory only: a page reload loses it, and the refresh cookie gets a new one.
let accessToken = null
let refreshing = null
let onSessionExpired = () => {}
let onSessionTimeLeft = () => {}
let refreshTimer = null

export const getAccessToken = () => accessToken
export const setOnSessionExpired = (callback) => {
  onSessionExpired = callback
}
export const setOnSessionTimeLeft = (callback) => {
  onSessionTimeLeft = callback
}
// For callers that get sessionTimeLeftSeconds from a response that didn't go through
// refreshAccessToken (login()'s own POST /auth/login).
export const recordSessionTimeLeft = (secondsLeft) => onSessionTimeLeft(secondsLeft)

// Error envelope from the services: { status_code, error, message, timestamp, details? } (supplier
// service), { message, code } (user service), or { error: { code, message } } (credit service -
// `error` is an object there, unlike order-service's string transition code of the same name).
export class ApiError extends Error {
  constructor(status, body, retryAfterSeconds) {
    const nested = body?.error && typeof body.error === 'object' ? body.error : null
    super(body?.message || nested?.message || 'Request failed (' + status + ')')
    this.status = status
    this.code = body?.code || nested?.code
    this.body = body
    this.details = Array.isArray(body?.details) ? body.details : []
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const readBody = async (response) => {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

// Decoded, not verified: the frontend only needs these for display, routing and refresh timing.
// Each service verifies the token itself against user-service's JWKS before trusting anything.
export function decodeAccessTokenClaims(token) {
  const payload = token?.split('.')[1]
  if (!payload) return null
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    // atob gives bytes, not characters; this is the usual round-trip for non-ASCII claims.
    const text = decodeURIComponent(
      Array.from(json, (ch) => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
    )
    return JSON.parse(text)
  } catch {
    return null
  }
}

// Refreshes 60s before the current token's own exp. One timer at a time: replaced on every new
// token, cleared when the token is cleared (logout, or a failed refresh).
const REFRESH_SKEW_MS = 60_000
function scheduleProactiveRefresh(token) {
  const claims = decodeAccessTokenClaims(token)
  if (!claims?.exp) return
  const delay = claims.exp * 1000 - Date.now() - REFRESH_SKEW_MS
  if (delay <= 0) return
  refreshTimer = setTimeout(() => {
    refreshAccessToken().catch(() => {
      setAccessToken(null)
      onSessionExpired()
    })
  }, delay)
}

export const setAccessToken = (token) => {
  accessToken = token
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  if (token) scheduleProactiveRefresh(token)
}

// One refresh at a time: concurrent 401s share the same request.
export function refreshAccessToken() {
  if (!refreshing) {
    refreshing = fetch('/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (response) => {
        const body = await readBody(response)
        if (!response.ok) throw new ApiError(response.status, body)
        setAccessToken(body.accessToken)
        onSessionTimeLeft(body.sessionTimeLeftSeconds)
        return body.accessToken
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

const withQuery = (path, query) => {
  if (!query) return path
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, String(v)))
    } else {
      params.set(key, String(value))
    }
  })
  const text = params.toString()
  return text ? path + '?' + text : path
}

// Identical GETs that are still in flight share one network request (React strict mode runs effects twice
// in development, and several components can ask for the same list). Nothing is cached after it finishes.
const inFlight = new Map()

export function request(path, options = {}, retried = false) {
  const { method = 'GET', query } = options
  if (method !== 'GET') return send(path, options, retried)
  const key = withQuery(path, query)
  if (!inFlight.has(key)) {
    inFlight.set(
      key,
      send(path, options, retried).finally(() => inFlight.delete(key)),
    )
  }
  return inFlight.get(key)
}

// `json` sends a JSON body, `form` a FormData (the browser sets the multipart boundary).
async function send(path, { method = 'GET', query, json, form, headers = {} } = {}, retried = false) {
  const finalHeaders = { ...headers }
  if (accessToken) finalHeaders.Authorization = 'Bearer ' + accessToken
  let body
  if (json !== undefined) {
    finalHeaders['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) {
    body = form
  }

  const response = await fetch(withQuery(path, query), {
    method,
    headers: finalHeaders,
    body,
    credentials: 'include',
  })

  if (response.status === 401 && !retried && !path.startsWith('/auth/')) {
    try {
      await refreshAccessToken()
    } catch {
      setAccessToken(null)
      onSessionExpired()
      throw new ApiError(401, { message: 'Your session has expired. Please log in again.' })
    }
    return send(path, { method, query, json, form, headers }, true)
  }

  const payload = await readBody(response)
  if (!response.ok) {
    const retryAfter = response.headers.get('Retry-After')
    throw new ApiError(response.status, payload, retryAfter ? Number(retryAfter) : undefined)
  }
  return payload
}
