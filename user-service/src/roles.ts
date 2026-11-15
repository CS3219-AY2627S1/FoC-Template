// Additional AI assistance: Codex (GPT-6), 2026-10-18. Scope: account-status publishing and verification. Author review: Reviewed and approved by @phuc.
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Implemented the author's role-change rules (admin-only, no self change,
 *        never zero ACTIVE admins, idempotent) with the author's lock-then-check
 *        concurrency approach.
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-10
 * Scope: The author's Phase 1 rules: one admin-actions lock (shared with suspend/restore),
 *        status rules for role changes, an optional reason, and an audit entry in the same
 *        transaction.
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */
import { PoolClient } from "pg";
import { pool } from "./db";
import { Role } from "./accounts";
import { wakePublisher } from "./publisherWake";
import { ADMIN_ACTIONS_LOCK_ID, AppendedEntry, appendAudit, logAuditAppended } from "./audit";

export const ROLES: readonly Role[] = ["MEMBER", "ADMINISTRATOR"];

export interface RoleChangeResult {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

export class NotAllowedError extends Error {}       // -> 403
export class OwnRoleError extends Error {}          // -> 403
export class UserNotFoundError extends Error {}     // -> 404
export class LastAdministratorError extends Error {} // -> 409
export class InvalidStatusTransitionError extends Error {} // -> 409

export interface AdminTarget {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  status: string;
}

/**
 * Runs one admin action: BEGIN, take the admin-actions lock (role changes, suspend and
 * restore all queue here), re-check that the actor is still an ACTIVE administrator (they
 * may have been demoted or suspended while waiting), load the target, run `action`, COMMIT.
 * `action` returns the audit entry it appended, if any; it is logged only after COMMIT.
 */
export async function runAdminAction<T>(
  actorId: string,
  targetId: string,
  action: (client: PoolClient, target: AdminTarget) => Promise<{ result: T; appended?: AppendedEntry }>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Released automatically at COMMIT/ROLLBACK
    await client.query("SELECT pg_advisory_xact_lock($1)", [ADMIN_ACTIONS_LOCK_ID]);

    const actor = await client.query("SELECT role, status FROM users WHERE id = $1", [actorId]);
    if (actor.rows[0]?.role !== "ADMINISTRATOR" || actor.rows[0]?.status !== "ACTIVE") {
      throw new NotAllowedError();
    }

    const target = await client.query(
      "SELECT id, username, display_name, role, status FROM users WHERE id = $1",
      [targetId],
    );
    if (!target.rows[0]) throw new UserNotFoundError();

    const { result, appended } = await action(client, target.rows[0]);
    await client.query("COMMIT");
    wakePublisher();
    if (appended) logAuditAppended(appended);
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Change targetId's role on behalf of actorId, independent of how a route identifies the
 * target. Rules (author, 2026-10-10): PENDING_VERIFICATION and CLOSED targets -> 409;
 * same role -> no change, no audit entry; promotion only for ACTIVE targets; demotion for
 * ACTIVE or SUSPENDED targets; never leave zero ACTIVE administrators (US-F4.1.3).
 */
export async function changeRole(
  actorId: string,
  targetId: string,
  newRole: Role,
  reason: string | null,
): Promise<RoleChangeResult> {
  // US-F4.1.2: only *another* account's role
  if (actorId === targetId) throw new OwnRoleError();

  return runAdminAction(actorId, targetId, async (client, t) => {
    if (t.status !== "ACTIVE" && t.status !== "SUSPENDED") throw new InvalidStatusTransitionError();

    let appended: AppendedEntry | undefined;
    if (t.role !== newRole) {
      // A suspended member would become an admin the moment they are restored
      if (newRole === "ADMINISTRATOR" && t.status !== "ACTIVE") throw new InvalidStatusTransitionError();
      // US-F4.1.3
      if (t.role === "ADMINISTRATOR" && t.status === "ACTIVE") {
        const admins = await client.query(
          "SELECT count(*)::int AS n FROM users WHERE role = 'ADMINISTRATOR' AND status = 'ACTIVE'",
        );
        if (admins.rows[0].n <= 1) throw new LastAdministratorError();
      }
      await client.query("UPDATE users SET role = $1, updated_at = now() WHERE id = $2", [newRole, targetId]);
      appended = await appendAudit(client, {
        actorType: "USER", actorId, action: "ROLE_CHANGED", targetId,
        previousValue: t.role, newValue: newRole, reason,
      });
      t.role = newRole;
    }
    return {
      result: { id: t.id, username: t.username, displayName: t.display_name, role: t.role },
      appended,
    };
  });
}
