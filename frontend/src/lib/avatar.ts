/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-03
 * Scope: Generated the per-person initials bubble colour, shared by the nav
 *        bar, the profile page and the friends page.
 * Reviewed by Ngooi Jun Sen.
 *
 * Worked out from the account id, so a person has the same colour wherever
 * they appear and for everyone who sees them, with nothing stored. There are
 * no profile pictures (User Service has none), so the colour helps tell
 * people apart.
 */

import type { CSSProperties } from 'react';

const PALETTE: CSSProperties[] = [
  { background: 'var(--color-danger-bg)', color: 'var(--color-accent)' },
  { background: 'var(--color-info-bg)', color: 'var(--color-info)' },
  { background: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
  { background: 'var(--color-success-bg)', color: 'var(--color-success)' },
  { background: 'var(--color-avatar-violet-bg)', color: 'var(--color-avatar-violet)' },
  { background: 'var(--color-avatar-teal-bg)', color: 'var(--color-avatar-teal)' },
  { background: 'var(--color-avatar-pink-bg)', color: 'var(--color-avatar-pink)' },
  { background: 'var(--color-lime-bg)', color: 'var(--color-lime)' },
];

/** The bubble colours for this account id. Ids are compared case-insensitively. */
export function avatarColours(userId: string): CSSProperties {
  let sum = 0;
  for (const char of userId.toLowerCase()) sum = (sum + char.charCodeAt(0)) % 997;
  return PALETTE[sum % PALETTE.length];
}
