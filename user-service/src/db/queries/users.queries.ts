// Scope (2026-11-10, Codex, model: GPT-6): Resolved merge conflict and retained preferred language in safe user queries.
// No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 4b - user queries
// Author review: Congchen
// 25/09/2026: Stage 4e - super admin queries
// Author review: Congchen
// 25/09/2026: Stage 5a - optional db param, status param, lock/activate/stale-cleanup queries
// Author review: Congchen
// 25/09/2026: Stage 6d - updatePasswordHash
// Author review: Congchen
// 27/09/2026: Stage 9 - listAllUsers, updateUserStatus
// Author review: Congchen
// 27/09/2026: Stage 10 - updateUserRole
// Author review: Congchen
// 27/09/2026: Stage 11 - active_view on UserRow, updateActiveView
// Author review: Congchen
// 27/09/2026: Stage 12b - updateUsername
// Author review: Congchen
// 27/09/2026: Stage 12d - updateEmail
// Author review: Congchen
// 2026-10-19: findPublicSummariesByIds for the public lookup (GET /users/public).
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen
// 2026-10-22: Stage 15b - replaced listAllUsers with listUsersPage (paginated, filtered,
//   sorted). Governing decision: instructions.md Stage 15b.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen
// 2026-11-04: Stage 18a/18b/18d - added the login-lockout columns to UserRow, lockUserByIdWithNow,
//   recordLoginFailure, lockLoginAccount, resetLoginLock, and the `locked` filter on
//   listUsersPage. Governing decision: instructions.md Stage 18.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen
// 2026-11-04: Stage 20 - added findByIdWithNow, an unlocked read (no FOR UPDATE) alongside
//   clock_timestamp(), for the unmask-email actor lookup (NFR3.1.1), which needs the DB clock
//   for its log line but takes no lock since it writes no state. Governing decision:
//   instructions.md Stage 20.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen
// 2026-11-06: Stage 26d - exported escapeLikePattern so auditLog.queries.ts's actor/target
//   filters can reuse it. No requirements, architecture, schema, or API decisions were made by
//   the AI tool.
// Author review: Congchen

// 2026-11-09 (Claude Code, model: claude-sonnet-5-5): Added preferred_lang to UserRow and updatePreferredLang.
// No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen

// Scope (2026-11-08, Codex, model: GPT-6): Added the default last-request row at user creation.
// No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen
// 2026-11-10: Fix F3 (Tool: Claude Code, model: claude-fable-5-1) - added IS_LOCKED_SQL, the one
//   SQL expression for "currently login-locked" against clock_timestamp() (convention 5), selected
//   AS is_locked by every query whose row reaches toUserResponse and reused by listUsersPage's
//   `locked` filter; added the UserRowWithLock type. Governing decision: the team's F3 fix note
//   (chat, 2026-11-10) and instructions.md convention 5.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
// Scope (2026-11-10, Codex, model: GPT-6): Resolved merge conflict and retained DB lock status for preferred language updates.
// No requirements, architecture, schema, or API decisions were made by the AI tool.
// 2026-11-10: Fix F4 (Tool: Claude Code, model: claude-fable-5-1) - added SAFE_USER_COLUMNS (every
//   users column except password_hash, plus is_locked) and the SafeUserRow type; findById,
//   listUsersPage and the status/role/active-view RETURNING clauses select it instead of `*`;
//   resetLoginLock now RETURNs the safe columns so unlock needs no object spread; added
//   findPasswordHashById for me.service's pre-lock bcrypt checks, which were the only findById
//   callers that need the hash. Governing decision: the team's F4 fix note (chat, 2026-11-10).
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
import pool from "../pool.js";
import { insertDefaultRow } from './lastRequest.queries.js';
import type { Queryable } from "../transaction.js";

export interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
  status: "pending" | "active" | "suspended";
  role: "user" | "admin" | "super admin";
  active_view: "requester" | "courier";
  preferred_lang: string;
  login_failed_attempts: number;
  login_failure_window_start: Date | null;
  login_locked_until: Date | null;
  login_lock_level: number;
}

// "Currently login-locked", decided by the database clock (convention 5), never by the app
// server's. Every query whose row reaches toUserResponse selects this AS is_locked, and
// listUsersPage's `locked` filter uses the very same expression, so the field and the filter
// cannot disagree. NOT (...) is true for a NULL login_locked_until, since (false AND NULL) is
// false in SQL.
export const IS_LOCKED_SQL =
  '(login_locked_until IS NOT NULL AND login_locked_until > clock_timestamp()) ';
const IS_LOCKED_COLUMN = `${IS_LOCKED_SQL} AS is_locked`;

// A user row plus the DB-computed is_locked flag. toUserResponse requires this type, so a
// query that forgets to select is_locked cannot feed a response without a type error.
export type UserRowWithLock = UserRow & { is_locked: boolean };

export type UserRowWithNow = UserRowWithLock & { db_now: Date };

// A user row with password_hash left out, plus is_locked: the only row shape that may reach
// toUserResponse (fix F4). Structurally, a UserRowWithLock still satisfies it, so the FOR UPDATE
// reads that login and the password-change paths share can also feed the mapper.
export type SafeUserRow = Omit<UserRow, 'password_hash'> & { is_locked: boolean };

// The one column list for every SELECT / RETURNING whose row ends up in a response: every column
// toUserResponse reads, the four login-lock columns, and the is_locked expression (fix F3).
// password_hash is deliberately absent, so such a row cannot carry it even by accident; queries
// that need the hash (login, password change/reset) keep their own explicit SELECT *.
export const SAFE_USER_COLUMNS = [
  'id',
  'username',
  'email',
  'created_at',
  'updated_at',
  'status',
  'role',
  'active_view',
  'preferred_lang',
  'login_failed_attempts',
  'login_failure_window_start',
  'login_locked_until',
  'login_lock_level',
  IS_LOCKED_COLUMN,
].join(', ');

export async function createUser(
  {
    username,
    email,
    passwordHash,
    status,
  }: {
    username: string;
    email: string;
    passwordHash: string;
    status: "pending" | "active";
  },
  db: Queryable = pool,
): Promise<UserRow> {
  const result = await db.query<UserRow>(
    `INSERT INTO users (username, email, password_hash, status) VALUES ($1, $2, $3, $4) RETURNING *`,
    [username, email, passwordHash, status],
  );
  await insertDefaultRow(result.rows[0]!.id, db);
  return result.rows[0]!;
}

export async function findByUsername(
  username: string,
  db: Queryable = pool,
): Promise<UserRow | null> {
  const result = await db.query<UserRow>(
    `SELECT * FROM users WHERE username = $1`,
    [username],
  );
  return result.rows[0] ?? null;
}

export async function findByEmail(
  email: string,
  db: Queryable = pool,
): Promise<UserRow | null> {
  const result = await db.query<UserRow>(
    `SELECT * FROM users WHERE email = $1`,
    [email],
  );
  return result.rows[0] ?? null;
}

export async function findById(
  userId: string,
  db: Queryable = pool,
): Promise<SafeUserRow | null> {
  const result = await db.query<SafeUserRow>(
    `SELECT ${SAFE_USER_COLUMNS} FROM users WHERE id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

// The hash alone, for the pre-lock bcrypt check in me.service's email/password change paths
// (fix F4: findById no longer selects password_hash). Nothing else is selected.
export async function findPasswordHashById(
  userId: string,
  db: Queryable = pool,
): Promise<{ password_hash: string } | null> {
  const result = await db.query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

// Unlocked read plus the database's own clock, for callers that log a timestamp but take no
// lock (Stage 20's unmask-email actor lookup: a read with no state change).
export async function findByIdWithNow(
  userId: string,
  db: Queryable = pool,
): Promise<UserRowWithNow | null> {
  const result = await db.query<UserRowWithNow>(
    `SELECT *, ${IS_LOCKED_COLUMN}, clock_timestamp() AS db_now FROM users WHERE id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function findSuperAdmin(
  db: Queryable = pool,
): Promise<UserRow | null> {
  const result = await db.query<UserRow>(
    `SELECT * FROM users WHERE role = 'super admin' LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

export async function createSuperAdmin(
  {
    username,
    email,
    passwordHash,
  }: {
    username: string;
    email: string;
    passwordHash: string;
  },
  db: Queryable = pool,
): Promise<UserRow | null> {
  const result = await db.query<UserRow>(
  `INSERT INTO users (username, email, password_hash, status, role)
   VALUES ($1, $2, $3, 'active', 'super admin')
   ON CONFLICT DO NOTHING
   RETURNING *`,
  [username, email, passwordHash],
);
  if (result.rows[0]) await insertDefaultRow(result.rows[0].id, db);
  return result.rows[0] ?? null;
}

export async function lockUserById(
  userId: string,
  db: Queryable = pool,
): Promise<UserRowWithLock | null> {
  const result = await db.query<UserRowWithLock>(
    `SELECT *, ${IS_LOCKED_COLUMN} FROM users WHERE id = $1 FOR UPDATE`,
    [userId],
  );
  return result.rows[0] ?? null;
}

// Same as lockUserById, plus the database's own clock so login-lockout decisions (Stage 18b)
// compare against the same clock that backdated test rows use, not the app server's clock.
export async function lockUserByIdWithNow(
  userId: string,
  db: Queryable = pool,
): Promise<UserRowWithNow | null> {
  const result = await db.query<UserRowWithNow>(
    `SELECT *, ${IS_LOCKED_COLUMN}, clock_timestamp() AS db_now FROM users WHERE id = $1 FOR UPDATE`,
    [userId],
  );
  return result.rows[0] ?? null;
}

// Call inside a transaction, against a row already locked with lockUserByIdWithNow.
// windowStart is null to start a fresh rolling window (the previous one had expired).
export async function recordLoginFailure(
  userId: string,
  { failedAttempts, windowStart }: { failedAttempts: number; windowStart: Date },
  db: Queryable = pool,
): Promise<void> {
  await db.query(
    `UPDATE users SET login_failed_attempts = $2, login_failure_window_start = $3,
       updated_at = NOW()
     WHERE id = $1`,
    [userId, failedAttempts, windowStart],
  );
}

// Call inside a transaction, against a row already locked with lockUserByIdWithNow.
// Also clears the failure counter/window: once locked, further attempts are rejected before
// reaching this point and do not extend it (Stage 18b), and a fresh window starts once the
// lock has passed.
export async function lockLoginAccount(
  userId: string,
  { lockedUntil, lockLevel }: { lockedUntil: Date; lockLevel: number },
  db: Queryable = pool,
): Promise<void> {
  await db.query(
    `UPDATE users SET login_failed_attempts = 0, login_failure_window_start = NULL,
       login_locked_until = $2, login_lock_level = $3, updated_at = NOW()
     WHERE id = $1`,
    [userId, lockedUntil, lockLevel],
  );
}

// A successful login, a correct current password on the email/password change endpoints, or
// an admin unlock all clear the failure count, the window and the escalation level (Stage 18b).
// Returns the cleared row (safe columns only, fix F4) so unlock can respond with what the
// database actually wrote instead of a hand-assembled copy. Callers that do not respond with the
// row (login, the password paths) simply ignore it.
export async function resetLoginLock(
  userId: string,
  db: Queryable = pool,
): Promise<SafeUserRow | null> {
  const result = await db.query<SafeUserRow>(
    `UPDATE users SET login_failed_attempts = 0, login_failure_window_start = NULL,
       login_locked_until = NULL, login_lock_level = 0, updated_at = NOW()
     WHERE id = $1 RETURNING ${SAFE_USER_COLUMNS}`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function activateUser(
  userId: string,
  db: Queryable = pool,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1 AND status = 'pending'`,
    [userId],
  );
  return (result.rowCount ?? 0) > 0;
}


export async function deleteStalePendingUsers(
  { username, email }: { username: string; email: string },
  db: Queryable = pool,
): Promise<void> {
  await db.query(
    `DELETE FROM users
     WHERE id IN (
       SELECT id FROM users
       WHERE status = 'pending'
         AND (username = $1 OR email = $2)
         AND NOT EXISTS (
           SELECT 1 FROM users_otps o
           WHERE o.user_id = users.id AND o.expires_at > NOW()
         )
       FOR UPDATE SKIP LOCKED
     )`,
    [username, email],
  );
}

export async function updatePasswordHash(
  userId: string,
  passwordHash: string,
  db: Queryable = pool,
): Promise<void> {
  await db.query(
    `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
    [userId, passwordHash],
  );
}

// Only id and username are selected, so no other column can reach a caller even by
// accident. Unknown ids simply do not come back.
export async function findPublicSummariesByIds(
  ids: string[],
  db: Queryable = pool,
): Promise<{ id: string; username: string }[]> {
  const result = await db.query<{ id: string; username: string }>(
    `SELECT id, username FROM users WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  return result.rows;
}

const SORT_COLUMNS = {
  username: "username",
  email: "email",
  createdAt: "created_at",
} as const;

const SORT_DIRECTIONS = {
  asc: "ASC",
  desc: "DESC",
} as const;

// Escapes \, % and _ so a LIKE pattern built from user input matches those characters
// literally instead of as wildcards or the escape character itself. Exported for
// auditLog.queries.ts's actor/target filters (Stage 26d), which use the same technique.
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export interface ListUsersPageParams {
  usernameContains?: string;
  email?: string;
  status?: "pending" | "active" | "suspended";
  role?: "user" | "admin" | "super admin";
  locked?: boolean;
  sortBy: keyof typeof SORT_COLUMNS;
  sortDir: keyof typeof SORT_DIRECTIONS;
  limit: number;
  offset: number;
}

export async function listUsersPage(
  { usernameContains, email, status, role, locked, sortBy, sortDir, limit, offset }: ListUsersPageParams,
  db: Queryable = pool,
): Promise<{ rows: SafeUserRow[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (usernameContains) {
    values.push(`%${escapeLikePattern(usernameContains)}%`);
    conditions.push(`username LIKE $${values.length} ESCAPE '\\'`);
  }
  if (email) {
    values.push(email);
    conditions.push(`email = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  if (role) {
    values.push(role);
    conditions.push(`role = $${values.length}`);
  }
  if (locked !== undefined) {
    // Same expression as the is_locked column below (fix F3), so filter and field agree.
    conditions.push(locked ? IS_LOCKED_SQL : `NOT ${IS_LOCKED_SQL}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortColumn = SORT_COLUMNS[sortBy];
  const sortDirection = SORT_DIRECTIONS[sortDir];

  const result = await db.query<SafeUserRow & { full_count: string }>(
    `SELECT ${SAFE_USER_COLUMNS}, COUNT(*) OVER() AS full_count FROM users
     ${whereClause}
     ORDER BY ${sortColumn} ${sortDirection}, id ${sortDirection}
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );

  if (result.rows.length > 0) {
    const total = Number(result.rows[0]!.full_count);
    return {
      // This spread only ever sees SAFE_USER_COLUMNS, so it cannot carry password_hash (fix F4).
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      rows: result.rows.map(({ full_count, ...row }) => row),
      total,
    };
  }

  // A page past the end gets no rows from the window function above, so total
  // needs its own query here.
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM users ${whereClause}`,
    values,
  );
  return { rows: [], total: Number(countResult.rows[0]!.count) };
}

export async function updateUserStatus(
  userId: string,
  status: "active" | "suspended",
  db: Queryable = pool,
): Promise<SafeUserRow> {
  const result = await db.query<SafeUserRow>(
    `UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING ${SAFE_USER_COLUMNS}`,
    [userId, status],
  );
  return result.rows[0]!;
}

// Call inside a transaction, against a row already locked with lockUserById.
export async function updateUserRole(
  userId: string,
  role: "admin" | "user",
  db: Queryable = pool,
): Promise<SafeUserRow> {
  const result = await db.query<SafeUserRow>(
    `UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1 RETURNING ${SAFE_USER_COLUMNS}`,
    [userId, role],
  );
  return result.rows[0]!;
}

export async function updateUsername(
  userId: string,
  username: string,
  db: Queryable = pool,
): Promise<UserRow> {
  const result = await db.query<UserRow>(
    `UPDATE users SET username = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [userId, username],
  );
  return result.rows[0]!;
}

export async function updateEmail(
  userId: string,
  email: string,
  db: Queryable = pool,
): Promise<UserRow> {
  const result = await db.query<UserRow>(
    `UPDATE users SET email = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [userId, email],
  );
  return result.rows[0]!;
}

export async function updateActiveView(
  userId: string,
  activeView: "requester" | "courier",
  db: Queryable = pool,
): Promise<SafeUserRow | null> {
  const result = await db.query<SafeUserRow>(
    `UPDATE users SET active_view = $2, updated_at = NOW() WHERE id = $1 RETURNING ${SAFE_USER_COLUMNS}`,
    [userId, activeView],
  );
  return result.rows[0] ?? null;
}

// AI-generated (edited by <name>).
export async function updatePreferredLang(
  userId: string,
  preferredLang: string,
  db: Queryable = pool,
): Promise<SafeUserRow | null> {
  const result = await db.query<SafeUserRow>(
    `UPDATE users SET preferred_lang = $2, updated_at = NOW() WHERE id = $1 RETURNING ${SAFE_USER_COLUMNS}`,
    [userId, preferredLang],
  );
  return result.rows[0] ?? null;
}
