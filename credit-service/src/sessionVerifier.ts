/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Live User Service verification for issue #58, following Order's verifier.
 * Author review: Reviewed and approved by @phuc. */
export class VerificationUnavailable extends Error {}
export class VerificationContractError extends Error {}

export interface Principal { id: string; role: "MEMBER" | "ADMINISTRATOR" }
export interface SessionVerifier { verify(authorization: string | undefined): Promise<Principal | null> }

export class HttpSessionVerifier implements SessionVerifier {
  constructor(
    private readonly config: { baseUrl: string; timeoutMs: number },
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async verify(authorization: string | undefined): Promise<Principal | null> {
    if (!authorization || !/^Bearer \S+$/i.test(authorization)) return null;
    const signal = AbortSignal.timeout(this.config.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(new URL("/auth/verify", this.config.baseUrl), {
        headers: { authorization }, signal, redirect: "error",
      });
    } catch {
      throw new VerificationUnavailable("User Service is unavailable.");
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      if (response.status === 401) return null;
      if (response.status >= 500) throw new VerificationUnavailable("User Service is unavailable.");
      throw new VerificationContractError("Unexpected User Service status.");
    }
    let body: { id?: unknown; role?: unknown } | null;
    try {
      body = await response.json() as typeof body;
    } catch (error) {
      if (signal.aborted || !(error instanceof SyntaxError)) throw new VerificationUnavailable("User Service response could not be read.");
      throw new VerificationContractError("Invalid User Service response.");
    }
    if (typeof body?.id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.id) ||
        (body.role !== "MEMBER" && body.role !== "ADMINISTRATOR")) {
      throw new VerificationContractError("Invalid User Service identity.");
    }
    return { id: body.id.toLowerCase(), role: body.role };
  }
}
