/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: SessionVerifier interface (the Order Service's only view of User Service sessions) and a
 *        stub that trusts `Bearer stub.<uuid>.<role>` tokens, implementing the approved plan.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: UserServiceSessionVerifier, which asks User Service's GET /auth/verify (bounded and
 *        fail-closed, like supplier-service's verifier), so real credit operations are never
 *        triggered by a forged stub identity.
 * Author review of additional changes: Reviewed and approved by @phuc
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: HttpSessionVerifier, which asks the User Service's GET /auth/verify, per the User and
 *        Supplier integration plan.
 * Author review: Reviewed and approved by @mattis.
 */
import type { UpstreamConfig } from "../config";
import { fetchWithTimeout, readJson, UpstreamContractError, UpstreamUnavailableError } from "./upstream";

export interface Principal {
  id: string;
  role: "MEMBER" | "ADMINISTRATOR";
}

export interface SessionVerifier {
  /**
   * The caller for an Authorization header value, or null if it isn't valid. HttpSessionVerifier
   * throws UpstreamUnavailableError (503) or UpstreamContractError (500) when it can't decide.
   */
  verify(authorization: string | undefined): Promise<Principal | null>;
}

const STUB_TOKEN = /^Bearer stub\.([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.(MEMBER|ADMINISTRATOR)$/;

/** Accepts exactly `Bearer stub.<uuid>.<MEMBER|ADMINISTRATOR>`; anything else gives null. */
export class StubSessionVerifier implements SessionVerifier {
  async verify(authorization: string | undefined): Promise<Principal | null> {
    const m = authorization === undefined ? null : STUB_TOKEN.exec(authorization);
    // Everything is case-sensitive except the UUID digits
    if (m === null) return null;
    return { id: m[1].toLowerCase(), role: m[2] as Principal["role"] };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Forwards the caller's Authorization header to User Service GET /auth/verify.
 * 401 gives null; 5xx, timeout or network error throws UpstreamUnavailableError (503);
 * any other status or an unexpected body throws UpstreamContractError (500).
 */
export class HttpSessionVerifier implements SessionVerifier {
  private readonly url: URL;

  constructor(private readonly config: UpstreamConfig, private readonly fetchImpl: typeof fetch = globalThis.fetch) {
    this.url = new URL("/auth/verify", config.baseUrl);
  }

  async verify(authorization: string | undefined): Promise<Principal | null> {
    if (authorization === undefined) return null;
    const res = await fetchWithTimeout(this.fetchImpl, this.url, { headers: { authorization } }, this.config.timeoutMs, "user");
    if (res.status === 401) return null;
    if (res.status >= 500) throw new UpstreamUnavailableError("user", `status ${res.status}`);
    if (res.status !== 200) throw new UpstreamContractError("user", `status ${res.status}`);
    const body = (await readJson(res, "user")) as { id?: unknown; role?: unknown } | null;
    const id = body?.id;
    const role = body?.role;
    if (typeof id !== "string" || !UUID.test(id) || (role !== "MEMBER" && role !== "ADMINISTRATOR")) {
      throw new UpstreamContractError("user", "verify body is missing a uuid id or a known role");
    }
    return { id: id.toLowerCase(), role };
  }
}
