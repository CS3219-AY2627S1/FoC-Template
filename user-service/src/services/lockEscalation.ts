/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Created the shared escalation math (duration per level, wording, quiet-window reset)
 *        used by both the login lockout and the OTP send escalation, per instructions.md
 *        Stage 18. No requirements, architecture, schema, or API decisions were made by the AI
 *        tool.
 * Author review:
 */

import { config } from '../config.js';

const HOUR_MS = 3_600_000;

// Level 1 -> escalationHours[0] (1h), level 2 -> [1] (4h), level 3+ -> capped at the last
// entry (24h).
export function durationHoursForLevel(level: number): number {
  const hours = config.lock.escalationHours;
  const idx = Math.min(Math.max(level, 1) - 1, hours.length - 1);
  return hours[idx]!;
}

export function escalationWording(level: number): string {
  const hours = durationHoursForLevel(level);
  if (hours === 1) return 'about an hour';
  if (hours === 24) return 'about a day';
  return `about ${hours} hours`;
}

// The quiet-window reset: a level stays in effect until `escalationResetHours` pass without
// the threshold being hit again. The time it was last hit is derived from `lockEndOrBlockEnd`
// (login_locked_until / send_blocked_until) minus that level's own duration, since no separate
// "last hit at" column is kept.
export function effectiveEscalationLevel(
  storedLevel: number,
  lockEndOrBlockEnd: Date | null,
  now: Date,
): number {
  if (storedLevel <= 0 || !lockEndOrBlockEnd) return 0;
  const lastHitAt = lockEndOrBlockEnd.getTime() - durationHoursForLevel(storedLevel) * HOUR_MS;
  const resetMs = config.lock.escalationResetHours * HOUR_MS;
  return now.getTime() - lastHitAt >= resetMs ? 0 : storedLevel;
}
