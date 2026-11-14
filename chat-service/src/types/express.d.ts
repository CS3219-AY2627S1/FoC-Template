/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Implemented and verified the team-specified conversation listing endpoint.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */
declare global {
  namespace Express {
    interface Request {
      user?: { user_id: string; role: string };
    }
  }
}
export {};
