// AI-assisted (Claude), reviewed and tested by Maliha
// Additional use: (Claude Code, Claude Opus 5.5), 2026-11-12: migrate() takes a lock so several pods can start together. See ai/usage-log.md, entry 009.
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { env } from './env';
import type { Order } from './orders';
import { endedAt } from './rules';

export const pool = new Pool({ connectionString: env.DATABASE_URL });

// Any number for the lock, as long as nothing else in this database uses it
const MIGRATE_LOCK = 3005;

// schema.sql sits next to src/ and dist/, so this works for both.
// When several chat pods start at once, running CREATE TABLE IF NOT EXISTS at
// the same moment can still fail with a duplicate-key error, so the pods take
// turns: the lock is held until COMMIT, and the next pod finds the tables made.
export async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATE_LOCK]);
    await client.query(sql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export type Message = {
  id: string;
  orderId: string;
  senderId: string;
  body: string;
  sentAt: string;
  readAt: string | null;
};

const MESSAGE_COLUMNS = `id::text, order_id AS "orderId", sender_id AS "senderId", body,
  sent_at AS "sentAt", read_at AS "readAt"`;

// Create the chat on first use, and keep its end time in sync with the order
export async function saveChat(o: Order) {
  await pool.query(
    `INSERT INTO chats (order_id, requester_id, courier_id, ended_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (order_id) DO UPDATE SET ended_at = EXCLUDED.ended_at`,
    [o.id, o.requesterId, o.courierId, endedAt(o)],
  );
}

// oldest first (F10.3)
export async function getMessages(orderId: string) {
  const { rows } = await pool.query<Message>(
    `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE order_id = $1 ORDER BY id`,
    [orderId],
  );
  return rows;
}

export async function addMessage(orderId: string, senderId: string, body: string) {
  const { rows } = await pool.query<Message>(
    `INSERT INTO messages (order_id, sender_id, body) VALUES ($1, $2, $3) RETURNING ${MESSAGE_COLUMNS}`,
    [orderId, senderId, body],
  );
  return rows[0];
}

// Marks the other person's messages as read. Returns how many changed,
// so we only tell the room when something did.
export async function markRead(orderId: string, readerId: string) {
  const { rowCount } = await pool.query(
    `UPDATE messages SET read_at = now()
     WHERE order_id = $1 AND sender_id <> $2 AND read_at IS NULL`,
    [orderId, readerId],
  );
  return rowCount ?? 0;
}

// Messages go with the chat (ON DELETE CASCADE)
export async function deleteOldChats(keepMs: number) {
  const { rowCount } = await pool.query(
    `DELETE FROM chats WHERE ended_at < now() - make_interval(secs => $1)`,
    [keepMs / 1000],
  );
  return rowCount ?? 0;
}

// ── Flags ──

export type Flag = {
  id: string;
  orderId: string;
  userId: string;
  userName: string;
  originalText: string;
  action: 'masked' | 'blocked';
  flaggedAt: string;
  reviewedAt: string | null;
};

export async function addFlag(f: Pick<Flag, 'orderId' | 'userId' | 'userName' | 'originalText' | 'action'>) {
  await pool.query(
    `INSERT INTO flags (order_id, user_id, user_name, original_text, action) VALUES ($1, $2, $3, $4, $5)`,
    [f.orderId, f.userId, f.userName, f.originalText, f.action],
  );
}

// newest first; reviewed ones only when asked for
export async function listFlags(includeReviewed: boolean) {
  const { rows } = await pool.query<Flag>(
    `SELECT id::text, order_id AS "orderId", user_id AS "userId", user_name AS "userName",
            original_text AS "originalText", action, flagged_at AS "flaggedAt", reviewed_at AS "reviewedAt"
     FROM flags
     WHERE $1 OR reviewed_at IS NULL
     ORDER BY flagged_at DESC
     LIMIT 200`,
    [includeReviewed],
  );
  return rows;
}

export async function reviewFlag(id: string, adminId: string) {
  const { rowCount } = await pool.query(
    `UPDATE flags SET reviewed_at = now(), reviewed_by = $2 WHERE id = $1 AND reviewed_at IS NULL`,
    [id, adminId],
  );
  return (rowCount ?? 0) > 0;
}