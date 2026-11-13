/**
 * AI Assistance Disclosure
 * Tool: GitHub Copilot, date: 2026-10-20
 * Scope: Define the Supplier Service's local authenticated user and role contract.
 * Author review: Review pending.
 */

export type Role = "ADMIN" | "REQUESTER" | "COURIER";

export interface AuthenticatedUser {
  id: string;
  roles: Role[];
  jti?: string;
  exp?: number;
}