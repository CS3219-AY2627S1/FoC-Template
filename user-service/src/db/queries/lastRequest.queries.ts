// AI Assistance Disclosure:
// Tool: Codex (model: GPT-6), date: 2026-11-08
// Scope: Queries for the last request table in the precise delivery location spec.
// No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import pool from '../pool.js';
import type { Queryable } from '../transaction.js';

export interface LastRequest {
  last_req_del_loc_id: number | null;
  last_req_del_loc_details: string | null;
}

export async function getLastRequest(userId: string, db: Queryable = pool): Promise<LastRequest | null> {
  const result = await db.query<LastRequest>(
    'SELECT last_req_del_loc_id, last_req_del_loc_details FROM last_request WHERE user_id = $1', [userId],
  );
  return result.rows[0] ?? null;
}

export async function upsertLastRequest(userId: string, locationId: number, details: string, db: Queryable = pool): Promise<void> {
  await db.query(`INSERT INTO last_request (user_id, last_req_del_loc_id, last_req_del_loc_details)
    VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE
    SET last_req_del_loc_id = EXCLUDED.last_req_del_loc_id,
        last_req_del_loc_details = EXCLUDED.last_req_del_loc_details, updated_at = NOW()`,
  [userId, locationId, details]);
}

export async function insertDefaultRow(userId: string, db: Queryable = pool): Promise<void> {
  await db.query('INSERT INTO last_request (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
}
