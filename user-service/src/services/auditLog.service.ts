// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
// Scope: Stage 26d - listAuditLogs for GET /admin/audit-logs: pagination (mirrors listUsers,
//        Stage 15b) and mapping the query row to the camelCase entry shape from
//        instructions.md's "Viewing the log" decisions table.
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import * as auditLogQueries from "../db/queries/auditLog.queries.js";
import type { AuditAction } from "../constants/auditReasons.js";

const PAGE_SIZE = 50;

export interface ListAuditLogsParams {
  page: number;
  actor?: string;
  target?: string;
  actions?: AuditAction[];
  reasonCode?: string;
  from?: Date;
  to?: Date;
  sortDir: "asc" | "desc";
}

export interface AuditLogEntry {
  id: string;
  createdAt: Date;
  actorId: string;
  actorUsername: string | null;
  action: AuditAction;
  targetId: string;
  targetUsername: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string;
  userAgent: string | null;
}

export interface ListAuditLogsResult {
  logs: AuditLogEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function toAuditLogEntry(row: auditLogQueries.AuditLogListRow): AuditLogEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    actorId: row.actor_id,
    actorUsername: row.actor_username,
    action: row.action,
    targetId: row.target_id,
    targetUsername: row.target_username,
    before: row.before,
    after: row.after,
    reason: row.reason,
    userAgent: row.user_agent,
  };
}

export async function listAuditLogs({
  page,
  actor,
  target,
  actions,
  reasonCode,
  from,
  to,
  sortDir,
}: ListAuditLogsParams): Promise<ListAuditLogsResult> {
  const offset = (page - 1) * PAGE_SIZE;
  const { rows, total } = await auditLogQueries.listAuditLogsPage({
    actor,
    target,
    actions,
    reasonCode,
    from,
    to,
    sortDir,
    limit: PAGE_SIZE,
    offset,
  });

  return {
    logs: rows.map(toAuditLogEntry),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}
