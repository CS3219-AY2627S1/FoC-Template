// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 4c - refresh token queries
// Author review:
// 25/09/2026: Stage 5 - optional db param, lockRefreshToken for atomic logout
// Author review:
// 25/09/2026: Stage 6 pre-work - lockRefreshToken also returns db_now
// Author review:
// 25/09/2026: Stage 6d - revokeAllRefreshTokensForUser
// Author review:
// 2026-11-05: Stage 23b - createRefreshToken and lockRefreshToken also return seconds_left,
//   computed in SQL from expires_at and clock_timestamp(). Governing decision: instructions.md
//   Stage 23b. No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import pool from "../pool.js";
import type { Queryable } from "../transaction.js";

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  is_revoked: boolean;
  revoked_at: Date | null;
  expires_at: Date;
  user_agent: string | null;
  ip_address: string | null;
  created_at: Date;
}

export type RefreshTokenRowWithNow = RefreshTokenRow & { db_now: Date };
export type RefreshTokenRowWithSecondsLeft = RefreshTokenRow & { seconds_left: number };
export type RefreshTokenRowWithNowAndSecondsLeft = RefreshTokenRowWithNow & {
  seconds_left: number;
};

// Seconds from the database clock until expires_at, whole seconds, rounded down, never negative.
const SECONDS_LEFT_EXPR = `GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (expires_at - clock_timestamp()))))::int`;

export async function createRefreshToken(
  {
    userId,
    tokenHash,
    ttlDays,
    userAgent,
    ipAddress,
  }: {
    userId: string;
    tokenHash: string;
    ttlDays: number;
    userAgent: string | null;
    ipAddress: string | null;
  },
  db: Queryable = pool,
): Promise<RefreshTokenRowWithSecondsLeft> {
  const result = await db.query<RefreshTokenRowWithSecondsLeft>(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, NOW() + make_interval(days => $3), $4, $5)
     RETURNING *, ${SECONDS_LEFT_EXPR} AS seconds_left`,
    [userId, tokenHash, ttlDays, userAgent, ipAddress],
  );
  return result.rows[0]!;
}

export async function findRefreshToken(
  tokenHash: string,
  db: Queryable = pool,
): Promise<RefreshTokenRowWithNow | null> {
  const result = await db.query<RefreshTokenRowWithNow>(
    `SELECT *, clock_timestamp() AS db_now FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function lockRefreshToken(
  tokenHash: string,
  db: Queryable = pool,
): Promise<RefreshTokenRowWithNowAndSecondsLeft | null> {
  const result = await db.query<RefreshTokenRowWithNowAndSecondsLeft>(
    `SELECT *, clock_timestamp() AS db_now, ${SECONDS_LEFT_EXPR} AS seconds_left
     FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function revokeRefreshToken(
  tokenHash: string,
  db: Queryable = pool,
): Promise<void> {
  await db.query(
    `UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE token_hash = $1`,
    [tokenHash],
  );
}

// Call inside the same transaction that changes the password or suspends the user.
export async function revokeAllRefreshTokensForUser(
  userId: string,
  db: Queryable = pool,
): Promise<void> {
  await db.query(
    `UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW()
     WHERE user_id = $1 AND is_revoked = FALSE`,
    [userId],
  );
}
