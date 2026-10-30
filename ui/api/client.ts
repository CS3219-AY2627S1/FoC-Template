// Error with the HTTP status so pages can tell "wrong password" (4xx)
// apart from "service not running" (5xx / network).
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

type ErrorBody = {
  message?: string
  error?: string
  errors?: string[]
  details?: Record<string, string[]>
}

// user-service returns { message } for most errors, but validation errors
// come back as { details: { field: [msg] } } instead
function errorMessage(body: ErrorBody, status: number) {
  const detail = body.details ? Object.values(body.details).flat()[0] : undefined
  return body.message ?? detail ?? body.errors?.[0] ?? body.error ?? `Request failed (${status})`
}

let refreshing: Promise<string | null> | null = null

// Swaps the refresh cookie for a new access token. Calls made at the same time
// share one request, since the backend rotates the cookie on every refresh.
export function refreshToken() {
  refreshing ??= fetch("/backend/users/refresh", { method: "POST" })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => {
      const token: string | null = body?.token ?? null
      if (token) localStorage.setItem("token", token)
      else localStorage.removeItem("token")
      return token
    })
    .catch(() => null)
    .finally(() => { refreshing = null })
  return refreshing
}

function send(path: string, options: RequestInit) {
  const token = localStorage.getItem("token")
  return fetch(`/backend${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
}

// Shared fetch helper: adds JSON headers + login token, throws on errors.
// On a 401 it refreshes the token once and retries.
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await send(path, options)
    if (res.status === 401 && path !== "/users/login" && (await refreshToken())) {
      res = await send(path, options)
    }
  } catch {
    throw new ApiError("Cannot reach the server.", 0)
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(errorMessage(body, res.status), res.status)
  return body as T
}