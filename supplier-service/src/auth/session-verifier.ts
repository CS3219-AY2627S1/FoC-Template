/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: defined the Supplier authentication seam, verified principal, and
 * transport-independent verification failures for issue #16.
 * Author review: Reviewed and approved by @ron.
 */
export const USER_ROLES = ["MEMBER", "ADMINISTRATOR"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface VerifiedPrincipal {
  id: string;
  role: UserRole;
}

export interface SessionVerifier {
  verify(authorization: string): Promise<VerifiedPrincipal>;
}

export const SESSION_VERIFIER = Symbol("SESSION_VERIFIER");

export class UnauthenticatedSessionError extends Error {
  constructor() {
    super("The bearer token is not authenticated.");
    this.name = "UnauthenticatedSessionError";
  }
}

export class SessionVerificationUnavailableError extends Error {
  constructor() {
    super("Session verification is unavailable.");
    this.name = "SessionVerificationUnavailableError";
  }
}
