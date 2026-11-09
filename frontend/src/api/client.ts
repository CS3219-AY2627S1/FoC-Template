/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Shared HTTP helper for calling backend services through the gateway.
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: preserved
 * response metadata and Supplier error details while retaining the existing
 * authentication and body-only client behaviour for issue #28.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-11-09. Scope: read
 * Order Service error bodies (field errors as a list, currentState on 409).
 * Author review: Reviewed and approved by @mattis.
 */
import { API_BASE } from '../config'
import { getToken } from '../auth/tokenStorage'

// Error thrown for any non-2xx response, carrying what the backend sent back.
// The backends reply with JSON like: { "error": "USERNAME_TAKEN", "message": "Username is taken" }
// (Supplier uses "code" instead of "error"; both are handled. Order sends `details` as a list of
// { field, message } and adds `currentState` to 409s; the list is flattened into a field record.)
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, string>
  readonly fieldErrors: Record<string, string>
  readonly requestId?: string
  readonly existingSupplierId?: string
  readonly currentState?: string

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, string> = {},
    metadata: {
      fieldErrors?: Record<string, string>
      requestId?: string
      existingSupplierId?: string
      currentState?: string
    } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.fieldErrors = metadata.fieldErrors ?? {}
    this.requestId = metadata.requestId
    this.existingSupplierId = metadata.existingSupplierId
    this.currentState = metadata.currentState
  }
}

// Thrown when the server could not be reached at all (server down, no network, ...)
export class NetworkError extends Error {
  constructor() {
    super("Couldn't reach the server. Please check your connection and try again.")
  }
}

// Set by AuthProvider: what to do when a logged-in request gets a 401.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Attach the logged-in user's token. Default true. Login/register pass false. */
  auth?: boolean
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface ApiResponse<T> {
  readonly data: T
  readonly status: number
  readonly headers: Headers
}

/**
 * Call the backend. `path` is relative to /api/v1, e.g. apiRequest('/whoami').
 * Resolves with the parsed JSON body; throws ApiError or NetworkError otherwise.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await apiRequestWithMeta<T>(path, options)
  return response.data
}

/**
 * Call the backend and retain HTTP response metadata needed by conditional APIs.
 * Prefer `apiRequest()` when a caller only needs the JSON body.
 */
export async function apiRequestWithMeta<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, auth = true, headers = {}, signal } = options

  const requestHeaders: Record<string, string> = { ...headers }
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json'
  const token = auth ? getToken() : null
  if (token) requestHeaders['Authorization'] = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new NetworkError()
  }

  // Some successful responses have no body (e.g. 204 No Content)
  const text = await response.text()
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = undefined
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token && onUnauthorized) onUnauthorized()
    throw toApiError(response.status, data)
  }
  return { data: data as T, status: response.status, headers: response.headers }
}

function toApiError(status: number, data: unknown): ApiError {
  const body = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const code = typeof body.error === 'string' ? body.error : typeof body.code === 'string' ? body.code : 'UNKNOWN'
  const message = typeof body.message === 'string' ? body.message : 'Something went wrong. Please try again.'
  const fieldErrors = stringRecord(body.fieldErrors)
  const details = stringRecord(body.details) ?? fieldList(body.details) ?? fieldErrors ?? {}
  return new ApiError(status, code, message, details, {
    fieldErrors: fieldErrors ?? {},
    requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
    existingSupplierId: typeof body.existingSupplierId === 'string' ? body.existingSupplierId : undefined,
    currentState: typeof body.currentState === 'string' ? body.currentState : undefined,
  })
}

// [{ field: "items[0].name", message: "..." }] -> { "items[0].name": "..." }; repeats are joined
function fieldList(value: unknown): Record<string, string> | undefined {
  if (!Array.isArray(value)) return undefined
  const record: Record<string, string> = {}
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return undefined
    const { field, message } = entry as Record<string, unknown>
    if (typeof field !== 'string' || typeof message !== 'string') return undefined
    record[field] = record[field] ? `${record[field]} ${message}` : message
  }
  return record
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  if (!Object.values(value).every((item) => typeof item === 'string')) return undefined
  return value as Record<string, string>
}
