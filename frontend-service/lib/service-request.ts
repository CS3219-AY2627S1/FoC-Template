/**
 * Shared fetch wrapper for the FastAPI services that authenticate with the
 * User Service bearer token (Order and Credit). Only use it on the server:
 * the token lives in an httpOnly cookie and must never reach the browser.
 */

import 'server-only';

const TIMEOUT_MS = 5000;

export class ServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Machine-readable code, when the service sends one. */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

type ValidationIssue = { loc?: (string | number)[]; msg?: string };

/** FastAPI errors are `{detail}`; validation errors are `{detail: [{loc, msg}]}`. */
function parseError(status: number, body: unknown, fallback: string) {
  const { detail, code } = (body ?? {}) as { detail?: unknown; code?: unknown };
  const errorCode = typeof code === 'string' ? code : undefined;

  if (status === 401) {
    return new ServiceError(
      401,
      'Your session has expired. Please log in again.',
      errorCode,
    );
  }
  if (Array.isArray(detail)) {
    const issue = (detail as ValidationIssue[]).find((i) => i.msg);
    const field = issue?.loc?.at(-1);
    const message = issue?.msg?.replace(/^Value error, /, '');
    return new ServiceError(
      status,
      message
        ? `${typeof field === 'string' ? `${field}: ` : ''}${message}`
        : 'Some fields are invalid.',
      errorCode,
    );
  }
  return new ServiceError(
    status,
    typeof detail === 'string' ? detail : fallback,
    errorCode,
  );
}

export type RequestOptions = {
  method?: string;
  body?: unknown;
  token: string | undefined;
  headers?: Record<string, string>;
};

/** Builds a `request()` bound to one service's base URL. */
export function createServiceRequest(baseUrl: string, serviceName: string) {
  return async function request<T>(
    path: string,
    { method = 'GET', body, token, headers }: RequestOptions,
  ): Promise<T> {
    // A missing cookie is the same as a rejected session to the caller.
    if (!token) throw parseError(401, null, '');

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Timeouts and connection failures say nothing about the session itself.
      throw new ServiceError(503, `${serviceName} is unavailable.`);
    }

    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw parseError(response.status, data, `${serviceName} request failed.`);
    }
    // Every route answers with JSON, so an empty or non-JSON success body is
    // a broken response, not data.
    if (data === null) {
      throw new ServiceError(502, `${serviceName} sent an invalid response.`);
    }
    return data as T;
  };
}

/** The paged list shape both services return. */
export type Page<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

/** Appends the defined parameters, in order, as a query string. */
export function withQuery(
  path: string,
  params: Record<string, string | number | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
