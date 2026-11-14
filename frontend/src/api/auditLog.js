/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Stage 26e - listAuditLogs (GET /admin/audit-logs) for the new audit log page.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { request } from './http'

// 200 { logs, page, pageSize, total, totalPages }. Each entry: { id, createdAt, actorId,
// actorUsername, action, targetId, targetUsername, before, after, reason, userAgent }.
// actorUsername/targetUsername is null when that user has been deleted.
// `action` is an array of AuditAction values (sent as repeated query params) or undefined.
// Admin/super admin only (403 FORBIDDEN otherwise).
export async function listAuditLogs({ page, actor, target, action, reasonCode, from, to, sortDir }) {
  return request('/admin/audit-logs', {
    query: { page, actor, target, action, reasonCode, from, to, sortDir },
  })
}
