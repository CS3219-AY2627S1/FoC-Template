/**
 * AI Assistance Disclosure
 * Tool: GitHub Copilot (GPT-6 Luna)
 * Scope: Define role and JWT authentication types for supplier-service. (Now copied to credit service)
 * Author review: Reviewed and included in PR
 */
export type Role = "ADMIN" | "REQUESTER" | "COURIER";

export interface JwtClaims {
  sub: string;
  jti?: string;
  exp?: number;
  roles?: unknown;
}

export interface AuthenticatedUser {
  id: string;
  jti: string;
  exp: number;
  roles: Role[];
}