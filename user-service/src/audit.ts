/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-10
 * Scope: Implemented the author's audit-log design (US-NFR1): appends that take the
 *        admin-actions lock themselves and run in the caller's transaction, the author's
 *        HMAC hash-chain recipe, chain verification, and the paged viewer query.
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: The viewer also returns each entry's link to the one before (previousHash).
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */
import { createHmac } from "node:crypto";
import { PoolClient } from "pg";
import { pool } from "./db";
import { loadAuditKey } from "./config";

// Taken by every admin action (role change, suspend, restore) and by every audit append,
// so admin actions queue one at a time and id order is chain order. Distinct from the
// bootstrap lock (3219001) and the migration lock (3219003).
export const ADMIN_ACTIONS_LOCK_ID = 3219002;

export const GENESIS_HASH = "0".repeat(64);

export const AUDIT_ACTIONS = ["FIRST_ADMIN_CREATED", "ROLE_CHANGED", "ACCOUNT_SUSPENDED", "ACCOUNT_RESTORED"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntryInput {
  actorType: "USER" | "SYSTEM";
  actorId: string | null;
  action: AuditAction;
  targetId: string;
  previousValue: string | null;
  newValue: string;
  reason: string | null;
}

export interface AppendedEntry {
  id: string;
  hash: string;
}

let key: Buffer | undefined;
function auditKey(): Buffer {
  key ??= loadAuditKey();
  return key;
}

// The author's recipe, "v1". Changing anything here makes old entries fail verification.
function computeHash(prevHash: string, occurredAt: Date, e: AuditEntryInput): string {
  const payload = JSON.stringify([
    "v1", occurredAt.toISOString(), e.actorType, e.actorId,
    e.action, e.targetId, e.previousValue, e.newValue, e.reason,
  ]);
  return createHmac("sha256", auditKey()).update(prevHash + "\n" + payload).digest("hex");
}

/**
 * Appends one entry. Must be called inside the caller's transaction on the same client, so
 * the action and its entry commit or roll back together (US-NFR1.1.2). Takes the
 * admin-actions lock itself (a no-op if the caller already holds it), so appends never
 * interleave whoever calls this.
 */
export async function appendAudit(client: PoolClient, entry: AuditEntryInput): Promise<AppendedEntry> {
  await client.query("SELECT pg_advisory_xact_lock($1)", [ADMIN_ACTIONS_LOCK_ID]);

  const last = await client.query("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1");
  const prevHash: string = last.rows[0]?.hash ?? GENESIS_HASH;

  // Set here, at millisecond precision, so the stored value re-hashes identically
  const occurredAt = new Date();
  const hash = computeHash(prevHash, occurredAt, entry);

  const inserted = await client.query(
    `INSERT INTO audit_log
       (occurred_at, actor_type, actor_id, action, target_id, previous_value, new_value, reason, prev_hash, hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [occurredAt, entry.actorType, entry.actorId, entry.action, entry.targetId,
     entry.previousValue, entry.newValue, entry.reason, prevHash, hash],
  );
  return { id: String(inserted.rows[0].id), hash };
}

// Anchoring checkpoint: call after COMMIT, so only entries that really exist are logged.
// Comparing these lines with the table reveals deleted newest entries; container logs are
// not durable storage, so this is a checkpoint, not a guarantee.
export function logAuditAppended(entry: AppendedEntry): void {
  console.log(`audit.appended ${JSON.stringify(entry)}`);
}

export interface ChainCheck {
  valid: boolean;
  checkedEntries: number;
  firstInvalidId: string | null;
  latestHash: string;
}

/** Re-hashes every entry in id order and checks each links to the one before it. */
export async function verifyAuditChain(): Promise<ChainCheck> {
  const result = await pool.query(
    `SELECT id, occurred_at, actor_type, actor_id, action, target_id,
            previous_value, new_value, reason, prev_hash, hash
     FROM audit_log ORDER BY id`,
  );
  let expectedPrev = GENESIS_HASH;
  for (const row of result.rows) {
    const recomputed = computeHash(row.prev_hash, row.occurred_at, {
      actorType: row.actor_type, actorId: row.actor_id, action: row.action, targetId: row.target_id,
      previousValue: row.previous_value, newValue: row.new_value, reason: row.reason,
    });
    if (row.prev_hash !== expectedPrev || row.hash !== recomputed) {
      return { valid: false, checkedEntries: result.rows.length, firstInvalidId: String(row.id), latestHash: lastHash(result.rows) };
    }
    expectedPrev = row.hash;
  }
  return { valid: true, checkedEntries: result.rows.length, firstInvalidId: null, latestHash: lastHash(result.rows) };
}

function lastHash(rows: { hash: string }[]): string {
  return rows.length > 0 ? rows[rows.length - 1].hash : GENESIS_HASH;
}

export interface AuditQuery {
  targetId?: string;
  actorId?: string;
  action?: AuditAction;
  before?: string;
  limit: number;
}

/** Newest first, keyset-paged by id. Usernames are joined at read time, never stored. */
export async function listAudit(q: AuditQuery) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (q.targetId) add("a.target_id = ?", q.targetId);
  if (q.actorId) add("a.actor_id = ?", q.actorId);
  if (q.action) add("a.action = ?", q.action);
  if (q.before) add("a.id < ?", q.before);
  params.push(q.limit + 1); // one extra row tells us whether there is a next page

  const result = await pool.query(
    `SELECT a.id, a.occurred_at, a.actor_type, a.actor_id, actor.username AS actor_username,
            a.action, a.target_id, target.username AS target_username,
            a.previous_value, a.new_value, a.reason, a.prev_hash, a.hash
     FROM audit_log a
     LEFT JOIN users actor  ON actor.id  = a.actor_id
     LEFT JOIN users target ON target.id = a.target_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY a.id DESC
     LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, q.limit);
  return {
    entries: rows.map((r) => ({
      id: String(r.id),
      occurredAt: r.occurred_at.toISOString(),
      actor: { type: r.actor_type, id: r.actor_id, username: r.actor_username ?? null },
      action: r.action,
      target: { id: r.target_id, username: r.target_username ?? null },
      previousValue: r.previous_value,
      newValue: r.new_value,
      reason: r.reason,
      previousHash: r.prev_hash, // the hash of the entry before; the chain's link
      hash: r.hash,
    })),
    nextCursor: result.rows.length > q.limit ? String(rows[rows.length - 1].id) : null,
  };
}
