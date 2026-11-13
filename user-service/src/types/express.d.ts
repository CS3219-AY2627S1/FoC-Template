/**
 * AI Assistance Disclosure
 * Tool: GitHub Copilot, date: 2026-10-20
 * Scope: Add User Service-local Express typing for the authenticated user.
 * Author review: Review pending.
 */

import type { AuthenticatedUser } from "../models/types.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};