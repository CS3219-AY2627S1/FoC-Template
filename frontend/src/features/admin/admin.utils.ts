/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-10
 * Scope (AI-28): Generated the account list endpoint, admin users page and their tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

// Shared by the admin dashboard sections

export const PAGE_SIZE = 10

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.'
}
