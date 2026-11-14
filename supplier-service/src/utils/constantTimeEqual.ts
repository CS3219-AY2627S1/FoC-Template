/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 c1 (instructions.md) - constant-time secret comparison helper, used by the new
 *        supplier-order-service key check. Hashes both inputs first so the comparison never
 *        leaks timing information from differing lengths. No requirements, architecture, schema,
 *        or API decisions were made by the AI tool.
 * Author review:
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export function constantTimeEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}
