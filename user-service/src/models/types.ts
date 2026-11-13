/**
 * AI Assistance Disclosure
 * Tool: GitHub Copilot, date: 2026-10-20
 * Scope: Add the User Service-local authenticated user type used by its middleware.
 * Author review: Review pending.
 */

export type Role = "ADMIN" | "REQUESTER" | "COURIER";

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: Role[];
}

export interface JwtPayload {
  sub: string;
  jti: string;
  exp: number;
  roles: Role[];
}

export interface AuthenticatedUser {
  id: string;
  jti: string;
  exp: number;
  roles: Role[];
}
