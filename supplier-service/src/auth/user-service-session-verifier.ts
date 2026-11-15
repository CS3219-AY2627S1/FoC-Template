/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: implemented bounded, fail-closed User Service session verification
 * for issue #16 and adopted shared UUID validation during issue #17 review.
 * Author review: Reviewed and approved by @ron.
 */
import { SessionVerificationConfiguration } from "../config/environment";
import { isUuid } from "../http/uuid";
import {
  SessionVerificationUnavailableError,
  SessionVerifier,
  UnauthenticatedSessionError,
  USER_ROLES,
  UserRole,
  VerifiedPrincipal,
} from "./session-verifier";

type Fetch = typeof globalThis.fetch;

function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.some((role) => role === value);
}

function parsePrincipal(value: unknown): VerifiedPrincipal {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("id" in value) ||
    !("role" in value) ||
    !isUuid(value.id) ||
    !isUserRole(value.role)
  ) {
    throw new SessionVerificationUnavailableError();
  }

  return { id: value.id, role: value.role };
}

export class UserServiceSessionVerifier implements SessionVerifier {
  private readonly verifyUrl: URL;

  constructor(
    private readonly configuration: SessionVerificationConfiguration,
    private readonly fetchImplementation: Fetch = globalThis.fetch,
  ) {
    this.verifyUrl = new URL("/auth/verify", configuration.userServiceBaseUrl);
  }

  async verify(authorization: string): Promise<VerifiedPrincipal> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.verifyUrl, {
        method: "GET",
        redirect: "error",
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(this.configuration.timeoutMs),
      });
    } catch {
      throw new SessionVerificationUnavailableError();
    }

    if (response.status === 401) {
      throw new UnauthenticatedSessionError();
    }
    if (!response.ok) {
      throw new SessionVerificationUnavailableError();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new SessionVerificationUnavailableError();
    }

    return parsePrincipal(body);
  }
}
