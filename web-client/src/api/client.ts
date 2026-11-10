/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Extended the shared HTTP client for Voice Assist audio requests.
 * Author review: I validated correctness, and added boundary checks.
 */

export type FieldError = {
  field: string;
  code: string;
  message: string;
};

type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    correlationId: string;
    fieldErrors: FieldError[];
  };
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId?: string;
  readonly fieldErrors: FieldError[];

  constructor(
    status: number,
    message: string,
    options: { code?: string; correlationId?: string; fieldErrors?: FieldError[] } = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = options.code ?? "REQUEST_FAILED";
    this.correlationId = options.correlationId;
    this.fieldErrors = options.fieldErrors ?? [];
  }
}

const apiBasePath = import.meta.env.VITE_API_BASE_PATH ?? "/v1";

function createCorrelationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function parseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json") ? response.json() : undefined;
}

function readError(status: number, body: unknown, fallbackCorrelationId?: string): ApiRequestError {
  const payload = body as Partial<ErrorEnvelope> | undefined;
  const error = payload?.error;
  if (error?.message && error.code) {
    return new ApiRequestError(status, error.message, {
      code: error.code,
      correlationId: error.correlationId,
      fieldErrors: error.fieldErrors ?? [],
    });
  }

  return new ApiRequestError(status, "The service could not complete this request.", {
    correlationId: fallbackCorrelationId,
  });
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

export async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const correlationId = createCorrelationId();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Correlation-ID", correlationId);
  // JSON unless the caller sends another body type, such as recorded audio.
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${apiBasePath}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiRequestError(0, "Check your connection and try again.", {
      code: "NETWORK_ERROR",
      correlationId,
    });
  }

  if (response.status === 204) return undefined as T;

  const body = await parseJson(response);
  if (!response.ok) {
    throw readError(response.status, body, response.headers.get("X-Correlation-ID") ?? correlationId);
  }

  return body as T;
}
