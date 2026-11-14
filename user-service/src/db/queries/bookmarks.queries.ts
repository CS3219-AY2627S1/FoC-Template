// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5-5), date: 2026-11-05
// Scope: Queries for the user_bookmarks table, per the 2026-11-05 supplier-bookmarking spec.
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import pool from "../pool.js";
import type { Queryable } from "../transaction.js";

// Locks the user's row so two adds for the same user run one after the other; without it two
// adds at 19 bookmarks could both pass the count check. Call inside a transaction.
export async function lockUser(userId: string, db: Queryable): Promise<void> {
  await db.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
}

// Oldest first, then by supplier id so ties are stable.
export async function listSupplierIds(
  userId: string,
  db: Queryable = pool,
): Promise<number[]> {
  const result = await db.query<{ supplier_id: number }>(
    `SELECT supplier_id FROM user_bookmarks
     WHERE user_id = $1
     ORDER BY created_at, supplier_id`,
    [userId],
  );
  return result.rows.map((row) => row.supplier_id);
}

export async function countBookmarks(
  userId: string,
  db: Queryable = pool,
): Promise<number> {
  const result = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM user_bookmarks WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]!.count;
}

export async function bookmarkExists(
  userId: string,
  supplierId: number,
  db: Queryable = pool,
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM user_bookmarks WHERE user_id = $1 AND supplier_id = $2`,
    [userId, supplierId],
  );
  return (result.rowCount ?? 0) > 0;
}

// True when a row was inserted, false when the pair already existed.
export async function insertBookmark(
  userId: string,
  supplierId: number,
  db: Queryable = pool,
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO user_bookmarks (user_id, supplier_id) VALUES ($1, $2)
     ON CONFLICT (user_id, supplier_id) DO NOTHING`,
    [userId, supplierId],
  );
  return (result.rowCount ?? 0) > 0;
}

// True when a row was deleted, false when there was nothing to delete.
export async function deleteBookmark(
  userId: string,
  supplierId: number,
  db: Queryable = pool,
): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM user_bookmarks WHERE user_id = $1 AND supplier_id = $2`,
    [userId, supplierId],
  );
  return (result.rowCount ?? 0) > 0;
}
