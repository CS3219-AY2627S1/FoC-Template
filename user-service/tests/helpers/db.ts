// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - SQL helpers for manipulating test DB state directly
// Author review:
// 2026-10-22: Added getCreditAllocationOutboxRows, a read helper for the
//   credit_allocation_outbox test coverage on bootstrapTestUser. No requirements,
//   architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-10-23: Added getOutboxRowById and seedOutboxRow for Stage 14's
//   creditOutbox.queries.test.ts and the Stage 14d activation/bootstrap wiring tests, which had
//   no test coverage at all before this change (Stage 14 itself deferred its tests to the
//   end-of-project test stage). No requirements, architecture, schema, or API decisions were
//   made by the AI tool.
// Author review:
// 2026-11-04: Stage 18f - added getUserById, setLoginLockState and setOtpSendBlock, so tests
//   can seed/backdate the login-lockout and OTP send-escalation state directly. Governing
//   decision: instructions.md Stage 18.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-04: Stage 20 - added dbNow, so tests can assert that a logged timestamp came from
//   the database clock rather than the service's own clock. Governing decision:
//   instructions.md Stage 20.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-05: Stage 23b - added setRefreshTokenExpiresInMinutes, so tests can backdate a
//   refresh token's expires_at to an arbitrary point for sessionTimeLeftSeconds coverage.
//   Governing decision: instructions.md Stage 23b.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// 2026-11-05: Added getBookmarkRows for supplier bookmarking tests (Tool: Claude Code, model:
//   claude-sonnet-5-5). No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-06: Stage 26a - added getAuditLogRowsForTarget/getAuditLogRowsForActor, for tests on
//   admin_audit_log. Since that table has no FK to users, truncateAll's TRUNCATE ... CASCADE
//   does not clear it between tests in the same file (by design - deleting a user must never
//   touch audit rows); these helpers filter by target/actor instead of relying on an empty
//   table. Governing decision: instructions.md Stage 26.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-10: Fix F3 (Tool: Claude Code, model: claude-fable-5-1) - setLoginLockState gained an
//   optional lockedUntilSecondsFromNow, so a lock can be seeded 1 s either side of the DB clock.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import type pg from 'pg';
import pool from '../../src/db/pool.js';
import { sha256 } from '../../src/utils/hash.js';
import type { OtpPurpose, OtpRow } from '../../src/db/queries/otp.queries.js';
import type { CreditAllocationOutboxRow, OutboxStatus } from '../../src/db/queries/creditOutbox.queries.js';
import type { RefreshTokenRow } from '../../src/db/queries/tokens.queries.js';
import type { UserRow } from '../../src/db/queries/users.queries.js';
import type { AuditLogRow } from '../../src/db/queries/auditLog.queries.js';

export async function truncateAll(): Promise<void> {
  await pool.query('TRUNCATE users CASCADE');
}

export async function dbNow(): Promise<Date> {
  const r = await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
  return r.rows[0]!.now;
}

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  const r = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  return r.rows[0];
}

export async function getUserByUsername(username: string): Promise<UserRow | undefined> {
  const r = await pool.query<UserRow>('SELECT * FROM users WHERE username = $1', [username]);
  return r.rows[0];
}

export async function getUserById(userId: string): Promise<UserRow | undefined> {
  const r = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  return r.rows[0];
}

// Directly sets the Stage 18b login-lockout columns, so tests can seed a lock or an escalation
// level/window without driving the rate limit through real requests. `lockedUntil` and
// `windowStart` take an offset in minutes from now (negative = in the past);
// `lockedUntilSecondsFromNow` is the seconds-granularity alternative (fix F3 tests). Both offsets
// are applied to the DB clock, never to Date.now().
export async function setLoginLockState(
  userId: string,
  {
    failedAttempts = 0,
    windowStartMinutesAgo,
    lockedUntilMinutesFromNow,
    lockedUntilSecondsFromNow,
    lockLevel = 0,
  }: {
    failedAttempts?: number;
    windowStartMinutesAgo?: number;
    lockedUntilMinutesFromNow?: number;
    lockedUntilSecondsFromNow?: number;
    lockLevel?: number;
  },
): Promise<void> {
  const lockedUntilSeconds =
    lockedUntilMinutesFromNow === undefined && lockedUntilSecondsFromNow === undefined
      ? null
      : (lockedUntilMinutesFromNow ?? 0) * 60 + (lockedUntilSecondsFromNow ?? 0);
  await pool.query(
    `UPDATE users SET
       login_failed_attempts = $2,
       login_failure_window_start = CASE WHEN $3::int IS NULL THEN NULL
         ELSE NOW() - make_interval(mins => $3::int) END,
       login_locked_until = CASE WHEN $4::int IS NULL THEN NULL
         ELSE clock_timestamp() + make_interval(secs => $4::int) END,
       login_lock_level = $5
     WHERE id = $1`,
    [userId, failedAttempts, windowStartMinutesAgo ?? null, lockedUntilSeconds, lockLevel],
  );
}

// Directly sets the Stage 18c OTP send-escalation columns on the latest row for
// (userId, purpose), so tests can seed a block/level without driving the send cap through real
// requests. `blockedUntilMinutesFromNow` takes an offset in minutes from now (negative = past).
export async function setOtpSendBlock(
  userId: string,
  purpose: OtpPurpose,
  { level, blockedUntilMinutesFromNow }: { level: number; blockedUntilMinutesFromNow: number | null },
): Promise<void> {
  await pool.query(
    `UPDATE users_otps SET
       send_escalation_level = $3,
       send_blocked_until = CASE WHEN $4::int IS NULL THEN NULL
         ELSE NOW() + make_interval(mins => $4::int) END
     WHERE id = (
       SELECT id FROM users_otps WHERE user_id = $1 AND purpose = $2
       ORDER BY created_at DESC LIMIT 1
     )`,
    [userId, purpose, level, blockedUntilMinutesFromNow],
  );
}

export async function countUsers(): Promise<number> {
  const r = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM users');
  return Number(r.rows[0]!.count);
}

export async function getOtps(userId: string, purpose?: OtpPurpose): Promise<OtpRow[]> {
  const r = purpose
    ? await pool.query<OtpRow>(
        'SELECT * FROM users_otps WHERE user_id = $1 AND purpose = $2 ORDER BY created_at',
        [userId, purpose],
      )
    : await pool.query<OtpRow>('SELECT * FROM users_otps WHERE user_id = $1 ORDER BY created_at', [
        userId,
      ]);
  return r.rows;
}

export async function getCreditAllocationOutboxRows(
  userId: string,
): Promise<{ status: string }[]> {
  const r = await pool.query<{ status: string }>(
    'SELECT status FROM credit_allocation_outbox WHERE user_id = $1',
    [userId],
  );
  return r.rows;
}

export async function getOutboxRowById(
  id: string,
): Promise<CreditAllocationOutboxRow | undefined> {
  const r = await pool.query<CreditAllocationOutboxRow>(
    'SELECT * FROM credit_allocation_outbox WHERE id = $1',
    [id],
  );
  return r.rows[0];
}

// Inserts a row directly, bypassing insertCreditAllocation's transaction-only contract, so a
// test can set up a specific status/attempts/next_attempt_at/last_error without going through
// the relay or an activation flow.
export async function seedOutboxRow(
  userId: string,
  overrides: {
    status?: OutboxStatus;
    attempts?: number;
    nextAttemptAt?: Date;
    lastError?: string | null;
  } = {},
): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO credit_allocation_outbox (user_id, status, attempts, next_attempt_at, last_error)
     VALUES ($1, $2, $3, COALESCE($4, NOW()), $5)
     RETURNING id`,
    [
      userId,
      overrides.status ?? 'pending',
      overrides.attempts ?? 0,
      overrides.nextAttemptAt ?? null,
      overrides.lastError ?? null,
    ],
  );
  return r.rows[0]!.id;
}

export async function getRefreshTokens(userId: string): Promise<RefreshTokenRow[]> {
  const r = await pool.query<RefreshTokenRow>(
    'SELECT * FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at',
    [userId],
  );
  return r.rows;
}

export async function getRefreshTokenByPlain(plain: string): Promise<RefreshTokenRow | undefined> {
  const r = await pool.query<RefreshTokenRow>(
    'SELECT * FROM refresh_tokens WHERE token_hash = $1',
    [sha256(plain)],
  );
  return r.rows[0];
}

export async function setUserStatus(
  userId: string,
  status: 'pending' | 'active' | 'suspended',
): Promise<void> {
  await pool.query('UPDATE users SET status = $2 WHERE id = $1', [userId, status]);
}

export async function setUserRole(
  userId: string,
  role: 'user' | 'admin' | 'super admin',
): Promise<void> {
  await pool.query('UPDATE users SET role = $2 WHERE id = $1', [userId, role]);
}

// Puts every OTP of the user (optionally one purpose) in the past, so it has expired.
export async function expireOtps(userId: string, purpose?: OtpPurpose): Promise<void> {
  await pool.query(
    `UPDATE users_otps SET expires_at = NOW() - INTERVAL '1 minute'
     WHERE user_id = $1 AND ($2::purpose_enum IS NULL OR purpose = $2)`,
    [userId, purpose ?? null],
  );
}

// Moves created_at back, so the resend cooldown (or rolling window) has passed.
export async function backdateOtps(
  userId: string,
  minutes: number,
  purpose?: OtpPurpose,
): Promise<void> {
  await pool.query(
    `UPDATE users_otps SET created_at = created_at - make_interval(mins => $3)
     WHERE user_id = $1 AND ($2::purpose_enum IS NULL OR purpose = $2)`,
    [userId, purpose ?? null, minutes],
  );
}

export async function expireRefreshToken(plain: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE token_hash = $1`,
    [sha256(plain)],
  );
}

export async function setRefreshTokenExpiresInMinutes(plain: string, minutes: number): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET expires_at = NOW() + make_interval(mins => $2) WHERE token_hash = $1`,
    [sha256(plain), minutes],
  );
}

// Inserts an OTP with a known plaintext, for tests that skip the email step.
export async function seedOtp(
  userId: string,
  purpose: OtpPurpose,
  otp: string,
  opts: { newEmail?: string } = {},
): Promise<void> {
  await pool.query(
    `UPDATE users_otps SET consumed_at = NOW()
     WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [userId, purpose],
  );
  await pool.query(
    `INSERT INTO users_otps (user_id, otp_hash, purpose, new_email, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
    [userId, sha256(otp), purpose, opts.newEmail ?? null],
  );
}

// Inserts a refresh token with a known plaintext, without going through login.
export async function seedRefreshToken(userId: string, plain: string): Promise<void> {
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
    [userId, sha256(plain)],
  );
}

// Runs fn inside a transaction that already holds the user's row lock, so the caller can start
// a service call that will block on that lock, change state, and release it by returning.
export async function withHeldUserLock<T>(
  userId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Resolves once at least `count` other backend(s) are waiting on a row lock.
export async function waitForLockWaiters(count = 1, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (Number(r.rows[0]!.n) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for a query to block on a lock');
}

export async function getBookmarkRows(
  userId: string,
): Promise<{ supplier_id: number; created_at: Date }[]> {
  const r = await pool.query<{ supplier_id: number; created_at: Date }>(
    'SELECT supplier_id, created_at FROM user_bookmarks WHERE user_id = $1 ORDER BY created_at, supplier_id',
    [userId],
  );
  return r.rows;
}

export async function getAuditLogRowsForTarget(targetId: string): Promise<AuditLogRow[]> {
  const r = await pool.query<AuditLogRow>(
    'SELECT * FROM admin_audit_log WHERE target_id = $1 ORDER BY created_at',
    [targetId],
  );
  return r.rows;
}

export async function getAuditLogRowsForActor(actorId: string): Promise<AuditLogRow[]> {
  const r = await pool.query<AuditLogRow>(
    'SELECT * FROM admin_audit_log WHERE actor_id = $1 ORDER BY created_at',
    [actorId],
  );
  return r.rows;
}
