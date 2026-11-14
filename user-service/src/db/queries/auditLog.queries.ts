// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
// Scope: Stage 26a - insertAuditLog for the admin_audit_log table. listAuditLogsPage is added
//        in Stage 26d. No requirements, architecture, schema, or API decisions were made by the
//        AI tool — see instructions.md Stage 26 for the governing decision.
// Author review:
// 2026-11-06: Stage 26b - AuditAction moved to src/constants/auditReasons.ts, imported here, so
//   the controller can use the preset lists without a circular import.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-06: Stage 26d - added listAuditLogsPage for GET /admin/audit-logs, LEFT JOINing
//   users twice (actor, target) for their usernames. Mirrors listUsersPage's window-function
//   total/fallback-count pattern (Stage 15b) and its LIKE-escaping for the actor/target
//   substring filters.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import type { AuditAction } from "../../constants/auditReasons.js";
import pool from "../pool.js";
import { escapeLikePattern } from "./users.queries.js";
import type { Queryable } from "../transaction.js";

export type { AuditAction };

export interface AuditLogRow {
  id: string;
  created_at: Date;
  actor_id: string;
  action: AuditAction;
  target_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string;
  user_agent: string | null;
}

export interface InsertAuditLogInput {
  actorId: string;
  action: AuditAction;
  targetId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string;
  userAgent: string | null;
}

// Transaction-only: call with the same client as the change this audit row belongs to, so the
// insert commits or rolls back with it. created_at comes from clock_timestamp() in the table's
// own default, not from the application.
export async function insertAuditLog(
  input: InsertAuditLogInput,
  db: Queryable,
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO admin_audit_log (actor_id, action, target_id, before, after, reason, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.actorId,
      input.action,
      input.targetId,
      input.before === null ? null : JSON.stringify(input.before),
      input.after === null ? null : JSON.stringify(input.after),
      input.reason,
      input.userAgent,
    ],
  );
  return result.rows[0]!.id;
}

export interface AuditLogListRow {
  id: string;
  created_at: Date;
  actor_id: string;
  actor_username: string | null;
  action: AuditAction;
  target_id: string;
  target_username: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string;
  user_agent: string | null;
}

export interface ListAuditLogsPageParams {
  actor?: string;
  target?: string;
  actions?: AuditAction[];
  reasonCode?: string;
  from?: Date;
  to?: Date;
  sortDir: "asc" | "desc";
  limit: number;
  offset: number;
}

const SORT_DIRECTIONS = { asc: "ASC", desc: "DESC" } as const;

export async function listAuditLogsPage(
  { actor, target, actions, reasonCode, from, to, sortDir, limit, offset }: ListAuditLogsPageParams,
  db: Queryable = pool,
): Promise<{ rows: AuditLogListRow[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (actor) {
    values.push(`%${escapeLikePattern(actor)}%`);
    conditions.push(`actor_user.username LIKE $${values.length} ESCAPE '\\'`);
  }
  if (target) {
    values.push(`%${escapeLikePattern(target)}%`);
    conditions.push(`target_user.username LIKE $${values.length} ESCAPE '\\'`);
  }
  if (actions && actions.length > 0) {
    values.push(actions);
    conditions.push(`log.action = ANY($${values.length}::audit_action_enum[])`);
  }
  if (reasonCode) {
    if (reasonCode === "OTHER") {
      conditions.push(`log.reason LIKE 'OTHER: %'`);
    } else {
      values.push(reasonCode);
      conditions.push(`log.reason = $${values.length}`);
    }
  }
  if (from) {
    values.push(from);
    conditions.push(`log.created_at >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    conditions.push(`log.created_at <= $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortDirection = SORT_DIRECTIONS[sortDir];
  const fromClause = `
     FROM admin_audit_log log
     LEFT JOIN users actor_user ON actor_user.id = log.actor_id
     LEFT JOIN users target_user ON target_user.id = log.target_id
     ${whereClause}`;

  const result = await db.query<AuditLogListRow & { full_count: string }>(
    `SELECT log.id, log.created_at, log.actor_id, actor_user.username AS actor_username,
            log.action, log.target_id, target_user.username AS target_username,
            log.before, log.after, log.reason, log.user_agent,
            COUNT(*) OVER() AS full_count
     ${fromClause}
     ORDER BY log.created_at ${sortDirection}, log.id ${sortDirection}
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );

  if (result.rows.length > 0) {
    const total = Number(result.rows[0]!.full_count);
    return {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      rows: result.rows.map(({ full_count, ...row }) => row),
      total,
    };
  }

  // A page past the end gets no rows from the window function above, so total needs its own
  // query here (same WHERE, so the same join and filters, per instructions.md Stage 26d).
  const countResult = await db.query<{ count: string }>(`SELECT COUNT(*) ${fromClause}`, values);
  return { rows: [], total: Number(countResult.rows[0]!.count) };
}
