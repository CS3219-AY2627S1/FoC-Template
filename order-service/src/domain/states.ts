/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Errand state enum and terminal-state set, implementing the approved plan.
 * Author review: Reviewed and approved by @mattis.
 */

export const ERRAND_STATES = [
  "PENDING_RESERVATION",
  "RESERVATION_REJECTED",
  "RESERVATION_TIMED_OUT",
  "OPEN",
  "ACCEPTED",
  "PICKED_UP",
  "DELIVERED",
  "DISPUTED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "FAILED",
] as const;

export type ErrandState = (typeof ERRAND_STATES)[number];

export const TERMINAL_STATES: ReadonlySet<ErrandState> = new Set<ErrandState>([
  "RESERVATION_REJECTED",
  "RESERVATION_TIMED_OUT",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "FAILED",
]);
