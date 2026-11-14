/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Extracted maskEmail out of email.service.ts into its own module (Stage 20), so
 *        userResponse.ts can reuse the same masking format for admin-facing user responses
 *        (NFR3.1.1) without a cross-service-layer import. Output is unchanged from Stage 19.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool —
 *        see instructions.md Stage 20's "Changes to already-implemented code" #1.
 * Author review:
 */

// First character of the local part, then `***`, then `@` and the full domain.
export function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return email;
  return `${email[0]}***${email.slice(atIndex)}`;
}
