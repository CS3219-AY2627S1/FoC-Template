/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Read queries behind the errand list and detail endpoints (open listing, my errands,
 *        detail with history, admin listing), implementing the approved plan.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: History actor ids are hidden from viewers who are not a party or an administrator.
 * Author review: Reviewed and approved by @mattis.
 */
import { Pool } from "pg";
import type { ErrandState } from "../domain/states";
import { mapErrandRow, type Errand } from "./errand";

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
}

export interface HistoryEntry {
  fromState: ErrandState | null;
  toState: ErrandState;
  action: string;
  actorType: string;
  actorId: string | null;
  reason: string | null;
  at: Date;
}

interface Paging {
  page: number;
  size: number;
}

/** Runs `SELECT * FROM errands WHERE <where> ORDER BY <order>` for one page, plus the total count. */
async function queryPage(
  pool: Pool, where: string, params: unknown[], order: string, { page, size }: Paging,
): Promise<Page<Errand>> {
  const limit = params.length + 1;
  const { rows } = await pool.query(
    `SELECT *, COUNT(*) OVER () AS total_items FROM errands WHERE ${where}
     ORDER BY ${order} LIMIT $${limit} OFFSET $${limit + 1}`,
    [...params, size, page * size],
  );
  let totalItems = rows.length > 0 ? Number(rows[0].total_items) : 0;
  if (rows.length === 0 && page > 0) {
    // Past the last page there are no rows to carry the window count
    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM errands WHERE ${where}`, params);
    totalItems = c.rows[0].n;
  }
  return { items: rows.map(mapErrandRow), page, size, totalItems };
}

/** OPEN errands other people posted whose listing deadline has not passed, soonest deadline first. */
export function listOpen(pool: Pool, viewerId: string, p: Paging): Promise<Page<Errand>> {
  return queryPage(
    pool, `state = 'OPEN' AND requester_id <> $1 AND listing_deadline > now()`, [viewerId],
    `listing_deadline ASC, id`, p,
  );
}

/** The user's errands as requester or as courier, newest first, optionally in one state. */
export function listMine(
  pool: Pool, userId: string, q: Paging & { as: "requester" | "courier"; state?: ErrandState },
): Promise<Page<Errand>> {
  const column = q.as === "courier" ? "courier_id" : "requester_id";
  const params: unknown[] = [userId];
  let where = `${column} = $1`;
  if (q.state) {
    params.push(q.state);
    where += ` AND state = $2::errand_state`;
  }
  return queryPage(pool, where, params, `created_at DESC, id`, q);
}

/** The errand with its history, or null if it is absent or the viewer may not see it. */
export async function getErrandForViewer(
  pool: Pool, id: string, viewer: { id: string; role: string },
): Promise<(Errand & { history: HistoryEntry[] }) | null> {
  const { rows } = await pool.query(
    `SELECT * FROM errands
     WHERE id = $1
       AND (state = 'OPEN' OR requester_id = $2 OR courier_id = $2 OR $3::text = 'ADMINISTRATOR')`,
    [id, viewer.id, viewer.role],
  );
  if (rows.length === 0) return null;
  const h = await pool.query(
    `SELECT from_state, to_state, action, actor_type, actor_id, reason, at
     FROM errand_history WHERE errand_id = $1 ORDER BY id ASC`,
    [id],
  );
  // Someone who sees the errand only because it is OPEN must not learn who acted
  const e = mapErrandRow(rows[0]);
  const privileged = viewer.role === "ADMINISTRATOR" || e.requesterId === viewer.id.toLowerCase() || e.courierId === viewer.id.toLowerCase();
  const history: HistoryEntry[] = h.rows.map((r) => ({
    fromState: r.from_state,
    toState: r.to_state,
    action: r.action,
    actorType: r.actor_type,
    actorId: privileged ? r.actor_id : null,
    reason: r.reason,
    at: r.at,
  }));
  return { ...e, history };
}

/** Every errand, newest first, optionally filtered by requester, courier and state. */
export function adminListErrands(
  pool: Pool, q: Paging & { requesterId?: string; courierId?: string; state?: ErrandState },
): Promise<Page<Errand>> {
  const params: unknown[] = [];
  const conds: string[] = [];
  if (q.requesterId) conds.push(`requester_id = $${params.push(q.requesterId)}`);
  if (q.courierId) conds.push(`courier_id = $${params.push(q.courierId)}`);
  if (q.state) conds.push(`state = $${params.push(q.state)}::errand_state`);
  return queryPage(pool, conds.length ? conds.join(" AND ") : "TRUE", params, `created_at DESC, id`, q);
}
