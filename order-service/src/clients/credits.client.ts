/*
 * AI Assistance Disclosure:
 * Tool: GitHub Copilot SDK in VS Code (model: GPT-5.6 Luna), date: 2026-10-13
 * Scope: Extended credit reservation input to carry the order identifier.
 * No requirements, architecture, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope (2026-10-20): Issue #4 - replaced the stub contract with an HTTP client for
 *        credit-service's POST /credits/reserve and /credits/release
 *        (credit-service/API.md), keyed on requestId = order id with no reservation
 *        handle; no timeout (George, 2026-10-20). Outcome classification follows
 *        George's decisions: reserve 409 RESERVATION_ALREADY_EXISTS = success; release
 *        404 RESERVATION_NOT_FOUND / 409 ALREADY_RELEASED = success; only timeouts,
 *        5xx and connection errors are transient. The stub stays for unit tests only.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

/**
 * `transient` failures are retried by the worker; `permanent` ones are not.
 * `code` is credit-service's machine-readable error code where it sent one.
 */
export type CreditCallResult =
  | { ok: true }
  | {
      ok: false;
      kind: 'transient' | 'permanent';
      status?: number;
      code: string;
    };

export interface CreditsClient {
  reserve(input: {
    userId: string;
    requestId: string;
    amount: number;
  }): Promise<CreditCallResult>;

  release(input: { requestId: string }): Promise<CreditCallResult>;
}

/** Error codes that mean "already done" for each call (idempotent repeats). */
const ALREADY_DONE: Record<'reserve' | 'release', ReadonlySet<string>> = {
  reserve: new Set(['RESERVATION_ALREADY_EXISTS']),
  release: new Set(['RESERVATION_NOT_FOUND', 'ALREADY_RELEASED']),
};

type FetchLike = typeof fetch;

export function createHttpCreditsClient(
  baseUrl: string,
  fetchImpl: FetchLike = fetch,
): CreditsClient {
  async function post(
    op: 'reserve' | 'release',
    body: object,
  ): Promise<CreditCallResult> {
    let res: Response;
    try {
      // No timeout, by decision: a hung call waits on undici's own limits.
      res = await fetchImpl(new URL(`/credits/${op}`, baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // Connection refused / reset / DNS: credit-service unreachable.
      return {
        ok: false,
        kind: 'transient',
        code: err instanceof Error ? err.message : 'NETWORK_ERROR',
      };
    }

    if (res.ok) return { ok: true };

    const code = await errorCodeOf(res);
    if (ALREADY_DONE[op].has(code)) return { ok: true };
    return {
      ok: false,
      kind: res.status >= 500 ? 'transient' : 'permanent',
      status: res.status,
      code,
    };
  }

  return {
    reserve: ({ userId, requestId, amount }) =>
      post('reserve', { userId, requestId, amount }),
    release: ({ requestId }) => post('release', { requestId }),
  };
}

/** Reads `{ error: { code } }` (API.md's error envelope); falls back to the status. */
async function errorCodeOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { code?: unknown } };
    if (typeof body?.error?.code === 'string') return body.error.code;
  } catch {
    // Non-JSON body (e.g. a proxy error page): fall through.
  }
  return `HTTP_${res.status}`;
}

/** Unit tests only: approves everything. */
export function createStubCreditsClient(): CreditsClient {
  return {
    async reserve() {
      return { ok: true };
    },
    async release() {
      return { ok: true };
    },
  };
}
