/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Extracted PASSWORD_REGEX/PASSWORD_MESSAGE out of auth.service.ts into their own
 *        module (Stage 17), so src/scripts/setupLocalDev.ts can validate generated passwords
 *        against the real policy without transitively importing config.ts (which exits the
 *        process when .env is missing/incomplete - exactly the state setupLocalDev.ts runs
 *        in). auth.service.ts re-exports both so no other import site changes. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool - see
 *        instructions.md Stage 17's "Watch for" note, and the user's explicit go-ahead in
 *        chat to make this extraction.
 * Author review:
 */

export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const PASSWORD_MESSAGE =
  'Password must contain at least 8 characters, with at least one uppercase, one lowercase, one digit and one special character. ';
