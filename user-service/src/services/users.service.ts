/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Generated the users service (listUsers, getUserById, changeUserStatus) as specified in
 *        instructions.md Stage 9.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added changeUserRole as specified in instructions.md Stage 10.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Exported toPublicUser so me.service.ts can reuse it (Stage 11).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: listUsers takes pagination/search/filter/sort params and returns the paginated
 *        shape, per instructions.md Stage 15b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Replaced toPublicUser/PublicUser with the shared toUserResponse mapper
 *        (src/services/userResponse.ts), per instructions.md Stage 15c.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: listUsers takes the `locked` filter, and added unlockUser (POST /users/:id/unlock),
 *        per instructions.md Stage 18d. Its permission rules mirror changeUserStatus's.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: listUsers, getUserById, changeUserStatus, changeUserRole and unlockUser now take the
 *        requester's ID and pass it to toUserResponse for email masking (NFR3.1.1). Added
 *        getFullEmail (GET /users/:id/full-email) and logUnmaskValidationFailure, with the
 *        `[UNMASK EMAIL]` console log shared by both. Per instructions.md Stage 20.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: changeUserStatus, changeUserRole and unlockUser now take a `reason` and `userAgent`
 *        and write an admin_audit_log row, in the same transaction as the change, when (and
 *        only when) the change actually happens. unlockUser now only acts on a target that is
 *        currently login-locked (per the Verify-first report: it previously had no such check
 *        and unconditionally cleared the lock state); a non-locked target is now a no-op.
 *        Per instructions.md Stage 26b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: getFullEmail now backs POST /users/:id/full-email (was GET): takes `reason` instead
 *        of logging, and writes an EMAIL_UNMASK audit row (before/after NULL) instead of the
 *        `[UNMASK EMAIL]` console lines, which are removed along with logUnmaskAttempt,
 *        formatUserAgent and logUnmaskValidationFailure (nothing else uses them). Per
 *        instructions.md Stage 26c.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: changeUserStatus and changeUserRole now take the caller's `sid` and the
 *        `Elevated-Token` header value, and check elevation last - after the lock, role
 *        restrictions, pending/suspended rules AND the no-op check (so a no-op still needs no
 *        elevation), but before the write/audit row. A missing, invalid or expired token is
 *        403 ELEVATION_REQUIRED; unlock and full-email are unaffected. Per instructions.md
 *        Stage 27b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Added getWorkerStatus for GET /users/worker/:id (order-service's scheduler), per
 *        instructions.md Stage 28b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Fix F3 - unlockUser decides lock vs no-op from the DB-computed is_locked on the row it
 *        locks FOR UPDATE (same IS_LOCKED_SQL as the list filter and the isLocked field), and
 *        the synthesized post-unlock row carries is_locked: false.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Fix F4 - unlockUser no longer spreads the FOR UPDATE row (which carries password_hash)
 *        into the response; the row stays internal for the lock-vs-no-op decision and the audit
 *        "before" value, and the response is built from resetLoginLock's RETURNING row (safe
 *        columns only).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Stage 31c - extracted unlockUser's clearing step (resetLoginLock plus
 *        clearSendBlocksForUser) into exported clearLoginLock, so auth.service.ts's new
 *        POST /auth/unlock (unlockByToken) can share it instead of duplicating it. unlockUser's
 *        own behaviour, permission rules and audit row are unchanged. Governing decision:
 *        instructions.md Stage 31 ("What a valid click does": "Share the clearing code with
 *        the admin unlock; do not duplicate it."). No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

import * as auditLogQueries from '../db/queries/auditLog.queries.js';
import * as otpQueries from '../db/queries/otp.queries.js';
import * as tokenQueries from '../db/queries/tokens.queries.js';
import * as userQueries from '../db/queries/users.queries.js';
import type { SafeUserRow } from '../db/queries/users.queries.js';
import { withTransaction, type Queryable } from '../db/transaction.js';
import { AppError } from '../utils/AppError.js';
import { isElevated } from '../utils/elevation.js';
import { toUserResponse, type UserResponse } from './userResponse.js';

function requireElevation(elevatedToken: string | undefined, userId: string, sid: string): void {
  if (!isElevated(elevatedToken, userId, sid)) {
    throw new AppError(403, 'Verify your identity to perform this action.', 'ELEVATION_REQUIRED');
  }
}

/** Everything a caller without a role may see about another user: who they are, nothing else. */
export interface PublicUserSummary {
  id: string;
  username: string;
}

/**
 * Display names for a batch of ids.
 *
 * Unknown ids are left out of the result rather than raising: a caller resolving a page
 * of references should not have the whole page fail because one user was deleted.
 */
export async function listPublicUsers(ids: string[]): Promise<PublicUserSummary[]> {
  return userQueries.findPublicSummariesByIds(ids);
}

export async function getPublicUserById(id: string): Promise<PublicUserSummary> {
  const [row] = await userQueries.findPublicSummariesByIds([id]);
  if (!row) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }
  return row;
}

/** Just enough for order-service's scheduler to decide whether to fire an occurrence. */
export interface WorkerUserStatus {
  status: 'pending' | 'active' | 'suspended';
  lockedUntil: Date | null;
}

export async function getWorkerStatus(id: string): Promise<WorkerUserStatus> {
  const row = await userQueries.findById(id);
  if (!row) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }
  return { status: row.status, lockedUntil: row.login_locked_until };
}

const PAGE_SIZE = 50;

export interface ListUsersParams {
  page: number;
  username?: string;
  email?: string;
  status?: 'pending' | 'active' | 'suspended';
  role?: 'user' | 'admin' | 'super admin';
  locked?: boolean;
  sortBy: 'username' | 'email' | 'createdAt';
  sortDir: 'asc' | 'desc';
  requesterId: string;
}

export interface ListUsersResult {
  users: UserResponse[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function listUsers({
  page,
  username,
  email,
  status,
  role,
  locked,
  sortBy,
  sortDir,
  requesterId,
}: ListUsersParams): Promise<ListUsersResult> {
  const offset = (page - 1) * PAGE_SIZE;
  const { rows, total } = await userQueries.listUsersPage({
    usernameContains: username,
    email,
    status,
    role,
    locked,
    sortBy,
    sortDir,
    limit: PAGE_SIZE,
    offset,
  });

  return {
    users: rows.map((row) => toUserResponse(row, requesterId)),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

// The id's UUID format is validated at the controller before this is called.
export async function getUserById(id: string, requesterId: string): Promise<UserResponse> {
  const row = await userQueries.findById(id);
  if (!row) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }
  return toUserResponse(row, requesterId);
}

export async function changeUserStatus(
  requesterId: string,
  requestorRole: string,
  requesterSid: string,
  targetId: string,
  status: 'active' | 'suspended',
  reason: string,
  userAgent: string | null,
  elevatedToken: string | undefined,
): Promise<UserResponse> {
  const action = status === 'suspended' ? 'USER_SUSPEND' : 'USER_UNSUSPEND';

  return withTransaction(async (client) => {
    const locked = await userQueries.lockUserById(targetId, client);
    if (!locked) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    // Target-role restriction.
    if (locked.role === 'super admin') {
      throw new AppError(403, 'Cannot modify a super administrator', 'SUPER_ADMIN_IMMUTABLE');
    }
    if (locked.role === 'admin' && requestorRole === 'admin') {
      throw new AppError(403, 'Only a super admin may suspend an admin', 'FORBIDDEN');
    }

    if (locked.status === 'pending') {
      throw new AppError(422, 'Cannot change the status of a pending user', 'CANNOT_CHANGE_STATUS_PENDING_USER');
    }

    // Already in the requested status: success, no write, no token revocation, no audit row,
    // no elevation needed (Stage 27b: elevation is checked last, after this no-op case).
    if (locked.status === status) {
      return toUserResponse(locked, requesterId);
    }

    requireElevation(elevatedToken, requesterId, requesterSid);

    const updated = await userQueries.updateUserStatus(locked.id, status, client);

    // Same transaction as the status change, so no session outlives the suspension.
    if (status === 'suspended') {
      await tokenQueries.revokeAllRefreshTokensForUser(locked.id, client);
    }

    await auditLogQueries.insertAuditLog(
      {
        actorId: requesterId,
        action,
        targetId: locked.id,
        before: { status: locked.status },
        after: { status },
        reason,
        userAgent,
      },
      client,
    );

    return toUserResponse(updated, requesterId);
  });
}

export async function changeUserRole(
  requesterId: string,
  requesterSid: string,
  targetId: string,
  newRole: 'admin' | 'user',
  reason: string,
  userAgent: string | null,
  elevatedToken: string | undefined,
): Promise<UserResponse> {
  if (targetId === requesterId) {
    throw new AppError(403, 'Cannot modify your own role', 'SELF_ROLE_CHANGE');
  }

  const action = newRole === 'admin' ? 'USER_PROMOTE' : 'USER_DEMOTE';

  return withTransaction(async (client) => {
    const locked = await userQueries.lockUserById(targetId, client);
    if (!locked) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    if (locked.role === 'super admin') {
      throw new AppError(403, 'Cannot modify a super administrator', 'SUPER_ADMIN_IMMUTABLE');
    }

    // Only an active target's role can change. Checked before the no-op case.
    if (locked.status === 'pending') {
      throw new AppError(
        422,
        'Cannot change the role of a pending user',
        'CANNOT_CHANGE_ROLE_PENDING_USER',
      );
    }
    if (locked.status === 'suspended') {
      throw new AppError(
        422,
        'Cannot change the role of a suspended user',
        'CANNOT_CHANGE_ROLE_SUSPENDED_USER',
      );
    }

    // Already has the requested role: success, no write, no token revocation, no audit row,
    // no elevation needed (Stage 27b: elevation is checked last, after this no-op case).
    if (locked.role === newRole) {
      return toUserResponse(locked, requesterId);
    }

    requireElevation(elevatedToken, requesterId, requesterSid);

    const updated = await userQueries.updateUserRole(locked.id, newRole, client);

    // Same transaction as the role change, so the old role cannot be extended by refreshing.
    await tokenQueries.revokeAllRefreshTokensForUser(locked.id, client);

    await auditLogQueries.insertAuditLog(
      {
        actorId: requesterId,
        action,
        targetId: locked.id,
        before: { role: locked.role },
        after: { role: newRole },
        reason,
        userAgent,
      },
      client,
    );

    return toUserResponse(updated, requesterId);
  });
}

// Shared by unlockUser below and auth.service.ts's unlockByToken (Stage 31c: "Share the
// clearing code with the admin unlock; do not duplicate it"). Call inside a transaction,
// against a row already locked FOR UPDATE. Clears the login lock and its escalation, and the
// OTP send blocks and their escalation for all three purposes. Returns the cleared row (safe
// columns, fix F4) or null if the user no longer exists.
export async function clearLoginLock(userId: string, client: Queryable): Promise<SafeUserRow | null> {
  const cleared = await userQueries.resetLoginLock(userId, client);
  if (!cleared) {
    return null;
  }
  await otpQueries.clearSendBlocksForUser(userId, client);
  return cleared;
}

// POST /users/:id/unlock. Permission rules mirror changeUserStatus's: SUPER_ADMIN_IMMUTABLE on
// a super-admin target, FORBIDDEN when an admin targets another admin (Stage 18d).
//
// Stage 26b: only acts on a target that is currently login-locked. A non-locked target is a
// no-op: no clearing, no audit row. The Verify-first report for this stage found the previous
// version had no such check at all.
//
// Fix F3: lock vs no-op is decided by the DB-computed is_locked on the row locked FOR UPDATE
// (IS_LOCKED_SQL in users.queries.ts), the same expression the `locked` list filter and the
// isLocked response field use, so the three can never disagree.
//
// Fix F4: the FOR UPDATE row (`locked`) is a full SELECT * and carries password_hash. It stays
// internal: it decides lock vs no-op and supplies the audit "before" value. The response comes
// from resetLoginLock's UPDATE ... RETURNING <safe columns>, never from spreading `locked`.
export async function unlockUser(
  requesterId: string,
  requestorRole: string,
  targetId: string,
  userAgent: string | null,
): Promise<UserResponse> {
  return withTransaction(async (client) => {
    const locked = await userQueries.lockUserByIdWithNow(targetId, client);
    if (!locked) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    if (locked.role === 'super admin') {
      throw new AppError(403, 'Cannot modify a super administrator', 'SUPER_ADMIN_IMMUTABLE');
    }
    if (locked.role === 'admin' && requestorRole === 'admin') {
      throw new AppError(403, 'Only a super admin may unlock an admin', 'FORBIDDEN');
    }

    if (!locked.is_locked) {
      return toUserResponse(locked, requesterId);
    }

    // The row is locked FOR UPDATE above, so clearLoginLock's UPDATE cannot miss.
    const cleared = await clearLoginLock(locked.id, client);
    if (!cleared) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    await auditLogQueries.insertAuditLog(
      {
        actorId: requesterId,
        action: 'USER_UNLOCK',
        targetId: locked.id,
        before: { isLocked: true },
        after: { isLocked: false },
        reason: 'N/A',
        userAgent,
      },
      client,
    );

    return toUserResponse(cleared, requesterId);
  });
}

// POST /users/:id/full-email. No lock: unmask makes no state change to the target. The audit
// insert runs first, in the same transaction as nothing else - it is the only write - so a
// failed insert never returns an email. Replaces the Stage 20 GET route and its
// `[UNMASK EMAIL]` console lines entirely (Stage 26c): rejected attempts write nothing, same as
// before, but there is no longer a console line for them either.
export async function getFullEmail(
  actorId: string,
  targetId: string,
  userAgent: string | null,
): Promise<{ email: string }> {
  return withTransaction(async (client) => {
    const target = await userQueries.findById(targetId, client);
    if (!target) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    if (target.role === 'super admin') {
      throw new AppError(403, "Cannot unmask a super administrator's email", 'FORBIDDEN');
    }

    await auditLogQueries.insertAuditLog(
      {
        actorId,
        action: 'EMAIL_UNMASK',
        targetId: target.id,
        before: null,
        after: null,
        reason: 'N/A',
        userAgent,
      },
      client,
    );

    return { email: target.email };
  });
}
