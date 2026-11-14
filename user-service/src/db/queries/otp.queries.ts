// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 5c - OTP queries
// Author review:
// 25/09/2026: Stage 6 pre-work - countOtps optional rolling window (sinceMinutes)
// Author review:
// 2026-11-04: Stage 18c/18d - added send_escalation_level/send_blocked_until to OtpRow and
//   createOtp, plus setSendBlock, resetSendEscalation and clearSendBlocksForUser. Governing
//   decision: instructions.md Stage 18.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-06: Stage 25c - incrementAttempts caps at max_attempts (LEAST) so repeated guesses
//   against an exhausted or expired code cannot overflow the SMALLINT column. Governing
//   decision: instructions.md Stage 25c.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import type { Queryable } from "../transaction.js";

export type OtpPurpose =
  | "Registration"
  | "Forgot Password"
  | "Change Email"
  | "Change Password"
  | "Admin Action";

export interface OtpRow {
  id: string;
  user_id: string;
  otp_hash: string;
  new_email: string | null;
  purpose: OtpPurpose;
  attempts_count: number;
  max_attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
  send_escalation_level: number;
  send_blocked_until: Date | null;
}

export type OtpRowWithNow = OtpRow & { db_now: Date };


export async function createOtp(
  {
    userId,
    otpHash,
    purpose,
    newEmail,
    ttlMinutes,
    sendEscalationLevel,
    sendBlockedUntil,
  }: {
    userId: string;
    otpHash: string;
    purpose: OtpPurpose;
    newEmail: string | null;
    ttlMinutes: number;
    // Carried forward from the previous latest row for this (user, purpose), per Stage 18c,
    // so a cap hit right after a block ends keeps escalating instead of restarting at 1h.
    sendEscalationLevel?: number;
    sendBlockedUntil?: Date | null;
  },
  db: Queryable,
): Promise<OtpRow> {
  const result = await db.query<OtpRow>(
    `INSERT INTO users_otps
       (user_id, otp_hash, purpose, new_email, expires_at, send_escalation_level, send_blocked_until)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(mins => $5), $6, $7) RETURNING *`,
    [userId, otpHash, purpose, newEmail, ttlMinutes, sendEscalationLevel ?? 0, sendBlockedUntil ?? null],
  );
  return result.rows[0]!;
}

// Call on a cap hit, against the latest row for this (user, purpose).
export async function setSendBlock(
  otpId: string,
  { level, blockedUntil }: { level: number; blockedUntil: Date },
  db: Queryable,
): Promise<void> {
  await db.query(
    `UPDATE users_otps SET send_escalation_level = $2, send_blocked_until = $3 WHERE id = $1`,
    [otpId, level, blockedUntil],
  );
}

// Call after a successful consuming verify for a purpose that resets the send-escalation level
// (Stage 18c): reset-password, verify-otp with change_email, and confirm-password-change.
export async function resetSendEscalation(otpId: string, db: Queryable): Promise<void> {
  await db.query(
    `UPDATE users_otps SET send_escalation_level = 0, send_blocked_until = NULL WHERE id = $1`,
    [otpId],
  );
}

// Admin unlock (Stage 18d): clears the send block and its escalation for all three purposes.
// Touches every row, not just the latest, which is harmless since only the latest is ever read.
export async function clearSendBlocksForUser(userId: string, db: Queryable): Promise<void> {
  await db.query(
    `UPDATE users_otps SET send_escalation_level = 0, send_blocked_until = NULL
     WHERE user_id = $1 AND purpose IN ('Forgot Password', 'Change Email', 'Change Password')`,
    [userId],
  );
}

export async function invalidateActiveOtps(
  userId: string,
  purpose: OtpPurpose,
  db: Queryable,
): Promise<void> {
  await db.query(
    `UPDATE users_otps SET consumed_at = NOW()
     WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [userId, purpose],
  );
}

export async function findLatestOtp(
  userId: string,
  purpose: OtpPurpose,
  db: Queryable,
): Promise<OtpRowWithNow | null> {
  const result = await db.query<OtpRowWithNow>(
    `SELECT *, clock_timestamp() AS db_now FROM users_otps
     WHERE user_id = $1 AND purpose = $2
     ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose],
  );
  return result.rows[0] ?? null;
}

// Without sinceMinutes, counts every row (registration). With it, counts only rows
// created within that many minutes, compared against the database clock.
export async function countOtps(
  userId: string,
  purpose: OtpPurpose,
  db: Queryable,
  sinceMinutes?: number,
): Promise<number> {
  const result =
    sinceMinutes === undefined
      ? await db.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM users_otps WHERE user_id = $1 AND purpose = $2`,
          [userId, purpose],
        )
      : await db.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM users_otps
           WHERE user_id = $1 AND purpose = $2
             AND created_at > clock_timestamp() - make_interval(mins => $3)`,
          [userId, purpose, sinceMinutes],
        );
  return Number(result.rows[0]!.count);
}

// Capped at max_attempts so repeated guesses against an exhausted/expired code (Stage 25c)
// can never push the SMALLINT column past it.
export async function incrementAttempts(
  otpId: string,
  db: Queryable,
): Promise<number> {
  const result = await db.query<{ attempts_count: number }>(
    `UPDATE users_otps SET attempts_count = LEAST(attempts_count + 1, max_attempts)
     WHERE id = $1 RETURNING attempts_count`,
    [otpId],
  );
  return result.rows[0]!.attempts_count;
}

export async function consumeOtp(
  otpId: string,
  db: Queryable,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE users_otps SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL`,
    [otpId],
  );
  return (result.rowCount ?? 0) > 0;
}
