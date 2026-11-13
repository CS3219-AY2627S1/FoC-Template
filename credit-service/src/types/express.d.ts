/**
 * AI Assistance Disclosure
 * Tool: GitHub Copilot (GPT-6 Luna)
 * Scope: Add the authenticated user to Express request types. (Now copied to credit service)
 * Author review: Reviewed and included in PR
 */

import type { AuthenticatedUser } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};