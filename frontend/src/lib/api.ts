/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated or updated frontend code for the team-specified report form, order association, navigation, and completion reminder.
 * Author review: I reviewed for correctness
 */
// Error envelope every FoC backend service returns (see AGENTS.md "API conventions").
export type ApiErrorBody = {
  status: number
  error: string
  message: string
  path?: string
  timestamp?: string
  details?: { field?: string; message: string }[]
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: ApiErrorBody["details"]

  constructor(status: number, code: string, message: string, details?: ApiErrorBody["details"]) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * Every authenticated browser request must have a Firebase ID token before
 * it reaches the gateway. Keeping this check beside the request primitives
 * makes accidental unauthenticated calls fail locally instead of becoming a
 * network 401.
 */
export function requireBearerToken(token: string | null): string {
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.")
  return token
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown | FormData
  token?: string | null
  signal?: AbortSignal
  responseType?: "json" | "blob"
}

export async function apiRequest<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" }
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData
  if (options.body !== undefined && !isFormData) headers["Content-Type"] = "application/json"
  if (options.token) headers.Authorization = `Bearer ${options.token}`

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : isFormData ? options.body as FormData : JSON.stringify(options.body),
      signal: options.signal,
      cache: "no-store",
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection and try again.")
  }

  if (response.status === 204) return undefined as T
  if (response.ok && options.responseType === "blob") return await response.blob() as T

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const body = payload as Partial<ApiErrorBody> | null
    throw new ApiError(
      response.status,
      body?.error ?? "HTTP_ERROR",
      body?.message ?? `Request failed with status ${response.status}.`,
      body?.details,
    )
  }
  return payload as T
}
