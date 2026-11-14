/*
 * AI Assistance Disclosure:
 * Tool: Copilot SDK (model: unspecified by runtime), date: 2026-10-20
 * Scope: Added the Express request type for the verified Order Service principal. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */

declare global {
  namespace Express {
    interface UserPrincipal {
      user_id: string;
      role: string;
    }

    interface Request {
      user?: UserPrincipal;
    }
  }
}

export {};
