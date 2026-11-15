/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: Shared helpers for calling the User and Supplier services over HTTP (timeout, error
 *        types), per the User and Supplier integration plan.
 * Author review: Reviewed and approved by @mattis.
 */
export type UpstreamService = "user" | "supplier";

/** The service is down, slow or unreachable. The HTTP layer answers 503. */
export class UpstreamUnavailableError extends Error {
  constructor(readonly service: UpstreamService, detail: string) {
    super(`${service} service unavailable: ${detail}`);
    this.name = "UpstreamUnavailableError";
  }
}

/** The service answered in a way Order does not expect. The HTTP layer answers 500 and logs it. */
export class UpstreamContractError extends Error {
  constructor(readonly service: UpstreamService, detail: string) {
    super(`unexpected ${service} service reply: ${detail}`);
    this.name = "UpstreamContractError";
  }
}

const isAbort = (err: unknown) => err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");

/** fetch with a deadline; a timeout or network error becomes UpstreamUnavailableError. No retries. */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  service: UpstreamService,
): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new UpstreamUnavailableError(service, isAbort(err) ? `no reply within ${timeoutMs} ms` : String(err));
  }
}

/** The response body as JSON; a body that is not JSON is a contract error. */
export async function readJson(response: Response, service: UpstreamService): Promise<unknown> {
  try {
    return await response.json();
  } catch (err) {
    // The deadline also covers reading the body
    if (isAbort(err)) throw new UpstreamUnavailableError(service, "body not received in time");
    throw new UpstreamContractError(service, "body is not JSON");
  }
}
