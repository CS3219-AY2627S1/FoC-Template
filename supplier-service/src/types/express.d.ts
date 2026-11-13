/**
 * AI Assistance Disclosure
 * Tool: GitHub Copilot, date: 2026-10-20
 * Scope: Add Supplier Service-local Express typing for the authenticated user.
 * Author review: Review pending.
 */

import type { AuthenticatedUser } from "../models/auth.ts";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};