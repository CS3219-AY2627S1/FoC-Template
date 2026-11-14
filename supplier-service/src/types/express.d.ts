/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Generated Express Request type augmentation adding req.user ({ user_id, role }) for the
 *        auth middleware. No requirements, architecture, schema, or API decisions were made by the
 *        AI tool.
 * Author review: Congchen
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5): added supplierServiceKeyAuthenticated,
 *        set by authenticate.ts when a valid Supplier-Order-Service-Key replaces a user JWT
 *        (instructions.md Stage 28 c1). No requirements, architecture, schema, or API decisions
 *        were made by the AI tool.
 * Author review:
 */
declare global {
  namespace Express {
    interface Request {
      user?: { user_id: string; role: string };
      supplierServiceKeyAuthenticated?: boolean;
    }
  }
}

export {};
