// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-16
//  2026-10-16: Week 7/8 catch-up - authorization decision for F19.5.1, mirroring the
//    rank comparison in user-service/src/middleware/authorize.ts rather than testing
//    role === 'admin', so 'super admin' is not denied (team decision 2026-10-16).
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

/**
 * Copied from user-service/src/middleware/authorize.ts. It is duplicated rather than
 * imported because the services share no package; if user-service adds a rank, this
 * must be updated to match.
 */
export const ROLE_RANK: Record<string, number> = {
  user: 0,
  admin: 1,
  'super admin': 2,
};

/** The rank at or above which a user may read balances other than their own. */
export const ELEVATED_ROLE = 'admin';

export interface AuthenticatedUser {
  userId: string;
  role: string;
}

/**
 * F19.5.1 authorization: a user may read only their own balance unless they hold an
 * elevated role.
 *
 * Pure and side-effect free so it can be tested without a token, a key, or a database.
 * An unrecognised role ranks below everything and is treated as unelevated.
 */
export function canReadBalance(viewer: AuthenticatedUser, targetUserId: string): boolean {
  if (viewer.userId === targetUserId) return true;
  const rank = ROLE_RANK[viewer.role] ?? -1;
  return rank >= ROLE_RANK[ELEVATED_ROLE]!;
}
