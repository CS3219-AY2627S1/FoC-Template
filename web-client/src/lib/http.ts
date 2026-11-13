// The one way the web client talks to the services. Every request goes through the
// gateway as /api/<service>/<path>, so no host, port or URL of a service appears in code.

export type ServiceName = 'user' | 'supplier' | 'order' | 'credit' | 'recommendation' | 'rag' | 'message'

export type Paginated<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export type FieldErrors = Record<string, string[]>

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: FieldErrors
  readonly details: unknown

  constructor(status: number, code: string, message: string, fieldErrors: FieldErrors = {}, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.details = details
  }
}

// The field messages of a refused request, or none. Forms pass these to their fields.
export function fieldErrorsOf(error: unknown): FieldErrors {
  return error instanceof ApiError ? error.fieldErrors : {}
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  signal?: AbortSignal
}

export async function request<T>(
  service: ServiceName,
  path: `/${string}`,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, query, signal } = options

  let response: Response
  try {
    response = await fetch(buildUrl(service, path, query), {
      method,
      signal,
      // Same origin as the gateway, so the session cookie goes along automatically.
      credentials: 'same-origin',
      headers:
        body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    // A cancelled request is not a failure; whoever cancelled it handles that.
    if (signal?.aborted) throw error
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach Relay. Check your connection and try again.')
  }

  if (!response.ok) throw await toApiError(response)
  // 204 No Content has no body to parse, e.g. logout.
  if (response.status === 204) return undefined as T
  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError(response.status, 'UNEXPECTED_RESPONSE', 'The server sent a response Relay cannot read.')
  }
}

function buildUrl(service: ServiceName, path: string, query: RequestOptions['query']): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value))
  }
  const search = params.toString()
  return `/api/${service}${path}${search ? `?${search}` : ''}`
}

type ErrorBody = {
  error: { code: string; message: string; details?: unknown; fields?: unknown }
}

async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null)
  if (isErrorBody(body)) {
    const { code, message, details } = body.error
    return new ApiError(response.status, code, message, readFieldErrors(body.error), details)
  }
  // No JSON at all usually means a proxy or server in between failed.
  if (response.status >= 500) {
    return new ApiError(response.status, 'SERVICE_UNAVAILABLE', 'This part of Relay is not reachable right now.')
  }
  return new ApiError(response.status, 'UNEXPECTED_RESPONSE', `Unexpected response (${response.status}).`)
}

// The services and the gateway all answer errors as {"error":{"code":"...","message":"..."}}.
function isErrorBody(body: unknown): body is ErrorBody {
  return (
    isRecord(body) &&
    isRecord(body.error) &&
    typeof body.error.code === 'string' &&
    typeof body.error.message === 'string'
  )
}

function readFieldErrors(error: ErrorBody['error']): FieldErrors {
  const fieldErrors: FieldErrors = {}

  // user-service: details.fields = { email: ['must end with @u.nus.edu or @nus.edu.sg'] }
  if (isRecord(error.details) && isRecord(error.details.fields)) {
    for (const [field, messages] of Object.entries(error.details.fields)) {
      if (Array.isArray(messages)) fieldErrors[field] = messages.map(String)
    }
  }

  // supplier-service, until it uses the shared shape: fields = [{ field: 'name', message: '...' }]
  if (Array.isArray(error.fields)) {
    for (const item of error.fields) {
      if (isRecord(item) && typeof item.field === 'string' && typeof item.message === 'string') {
        const messages = fieldErrors[item.field] ?? []
        messages.push(item.message)
        fieldErrors[item.field] = messages
      }
    }
  }

  return fieldErrors
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
