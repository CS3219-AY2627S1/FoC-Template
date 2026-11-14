// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 5c - OTP service
// Author review:
// 25/09/2026: Stage 6 pre-work - checkOtp optional consume flag
// Author review:
// 25/09/2026: Stage 6a - requestOtp (locked, rate-limited OTP request)
// Author review:
// 2026-11-04: Stage 18c - issueOtp carries the send-escalation level/block-end forward onto
//   the new row; requestOtp enforces the escalating send block ahead of the existing cap
//   check and reports the level/exact retry seconds on a cap hit; checkOtp resets the
//   escalation level on a successful consuming verify. Governing decision: instructions.md
//   Stage 18.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-04: Stage 19 - issueOtp and requestOtp gain username, passed through to
//   sendOtpEmail for its per-attempt log lines. Governing decision: instructions.md Stage 19.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-06: Stage 25a/25c - checkOtp now returns a reason on failure instead of always
//   throwing INVALID_OTP; an expired code counts as a failed attempt (capped by
//   incrementAttempts, Stage 25c); the attempts check moved above the expiry check; the 5th
//   failed attempt (wrong or expired) returns 429 OTP_ATTEMPTS_EXCEEDED with a Retry-After
//   computed from the DB clock via the shared otpRetryAfterSeconds helper; added the shared
//   throwOtpFailure helper used by every checkOtp caller. Governing decision: instructions.md
//   Stage 25.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import { config } from "../config.js";
import * as otpQueries from "../db/queries/otp.queries.js";
import type { OtpPurpose, OtpRowWithNow } from "../db/queries/otp.queries.js";
import * as userQueries from "../db/queries/users.queries.js";
import type { Queryable } from "../db/transaction.js";
import { AppError } from "../utils/AppError.js";
import { hashesMatch, sha256 } from "../utils/hash.js";
import { generateOtp } from "../utils/otp.js";
import { durationHoursForLevel, effectiveEscalationLevel } from "./lockEscalation.js";
import { sendOtpEmail } from "./email.service.js";

export async function issueOtp(
  {
    userId,
    email,
    purpose,
    newEmail,
    username,
    carryForwardEscalation,
  }: {
    userId: string;
    email: string;
    purpose: OtpPurpose;
    newEmail?: string;
    username: string;
    // Previous latest row's send-escalation state for this (user, purpose), per Stage 18c.
    carryForwardEscalation?: { level: number; blockedUntil: Date | null };
  },
  db: Queryable,
): Promise<void> {
  await otpQueries.invalidateActiveOtps(userId, purpose, db);

  const otp = generateOtp();
  await otpQueries.createOtp(
    {
      userId,
      otpHash: sha256(otp),
      purpose,
      newEmail: newEmail ?? null,
      ttlMinutes: config.otp.ttlMinutes,
      sendEscalationLevel: carryForwardEscalation?.level,
      sendBlockedUntil: carryForwardEscalation?.blockedUntil,
    },
    db,
  );

  try {
    await sendOtpEmail({ to: newEmail ?? email, otp, purpose, username });
  } catch (err) {
    // Never log the OTP itself.
    console.error(
      "Failed to send OTP email:",
      err instanceof Error ? err.message : err,
    );
    throw new AppError(
      503,
      "Unable to send verification email. Please try again.",
      "EMAIL_SEND_FAILED",
    );
  }
}

export type RequestOtpResult =
  | { status: "sent" }
  | { status: "no-user" }
  | { status: "not-verified" }
  | { status: "throttled"; reason: "limit"; level: number; retryAfterSeconds: number }
  | { status: "throttled"; reason: "cooldown"; retryAfterSeconds: number };

// Any endpoint that sends an OTP must go through this, never issueOtp directly.
// Must run inside withTransaction. It only reports what happened; callers decide the response.
// When throttled, nothing is sent and the existing OTP is not invalidated.
export async function requestOtp(
  {
    userId,
    email,
    purpose,
    newEmail,
    username,
  }: { userId: string; email: string; purpose: OtpPurpose; newEmail?: string; username: string },
  db: Queryable,
): Promise<RequestOtpResult> {
  const locked = await userQueries.lockUserById(userId, db);
  if (!locked) {
    return { status: "no-user" };
  }
  // A pending account never gets OTPs here; registration has its own resend.
  if (locked.status === "pending") {
    return { status: "not-verified" };
  }

  const latest = await otpQueries.findLatestOtp(userId, purpose, db);

  // Stage 18c: a prior cap hit blocks further sends until send_blocked_until, regardless of
  // the rolling-window count below.
  if (latest?.send_blocked_until && latest.send_blocked_until.getTime() > latest.db_now.getTime()) {
    return {
      status: "throttled",
      reason: "limit",
      level: latest.send_escalation_level,
      retryAfterSeconds: Math.ceil(
        (latest.send_blocked_until.getTime() - latest.db_now.getTime()) / 1000,
      ),
    };
  }

  // Rolling window, so the limit is never permanent.
  const count = await otpQueries.countOtps(
    userId,
    purpose,
    db,
    config.otp.resendWindowMinutes,
  );
  if (count - 1 >= config.otp.maxResends) {
    // latest must exist: count only reaches the cap once at least one row has been created.
    const currentLevel = effectiveEscalationLevel(
      latest!.send_escalation_level,
      latest!.send_blocked_until,
      latest!.db_now,
    );
    const newLevel = currentLevel + 1;
    const durationHours = durationHoursForLevel(newLevel);
    const blockedUntil = new Date(latest!.db_now.getTime() + durationHours * 3_600_000);
    await otpQueries.setSendBlock(latest!.id, { level: newLevel, blockedUntil }, db);
    return {
      status: "throttled",
      reason: "limit",
      level: newLevel,
      retryAfterSeconds: durationHours * 3600,
    };
  }

  if (latest) {
    const availableAt =
      latest.created_at.getTime() + config.otp.resendCooldownSeconds * 1000;
    const remainingMs = availableAt - latest.db_now.getTime();
    if (remainingMs > 0) {
      return {
        status: "throttled",
        reason: "cooldown",
        retryAfterSeconds: Math.ceil(remainingMs / 1000),
      };
    }
  }

  await issueOtp(
    {
      userId,
      email,
      purpose,
      newEmail,
      username,
      carryForwardEscalation: latest
        ? { level: latest.send_escalation_level, blockedUntil: latest.send_blocked_until }
        : undefined,
    },
    db,
  );
  return { status: "sent" };
}

export type CheckOtpResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired"; exhausted?: boolean; retryAfterSeconds?: number };

// Seconds until a resend is allowed for this OTP row, on the DB clock. Shared by the
// attempts-exceeded check below and the 5th-failed-attempt path, so both give the same value.
function otpRetryAfterSeconds(row: { created_at: Date; db_now: Date }): number {
  const availableAt = row.created_at.getTime() + config.otp.resendCooldownSeconds * 1000;
  return Math.max(0, Math.ceil((availableAt - row.db_now.getTime()) / 1000));
}

// Throws the response for a checkOtp failure, after the caller's transaction has committed
// (so the incremented attempt count is never rolled back). Use at every checkOtp call site
// instead of a hardcoded INVALID_OTP throw.
export function throwOtpFailure(result: { ok: false; reason: "invalid" | "expired"; exhausted?: boolean; retryAfterSeconds?: number }): never {
  if (result.exhausted) {
    throw new AppError(
      429,
      "Too many incorrect attempts. Please request a new OTP.",
      "OTP_ATTEMPTS_EXCEEDED",
      result.retryAfterSeconds,
    );
  }
  if (result.reason === "expired") {
    throw new AppError(400, "OTP has expired. Please request a new one.", "OTP_EXPIRED");
  }
  throw new AppError(400, "Invalid or expired OTP", "INVALID_OTP");
}

// Must run inside a transaction that already holds the user row lock.
// Returns { ok: false, ... } on a failed guess instead of throwing, so the caller's
// transaction commits and the incremented attempt count is not rolled back. The caller
// throws via throwOtpFailure once the transaction has committed.
export async function checkOtp(
  {
    userId,
    purpose,
    otp,
  }: { userId: string; purpose: OtpPurpose; otp: string },
  db: Queryable,
  consume: boolean = true,
): Promise<CheckOtpResult> {
  const row = await otpQueries.findLatestOtp(userId, purpose, db);
  if (!row || row.consumed_at) {
    throw new AppError(400, "Invalid or expired OTP", "INVALID_OTP");
  }
  // Checked before expiry: a code that is both exhausted and expired is dead, not stale.
  if (row.attempts_count >= row.max_attempts) {
    throw new AppError(
      429,
      "Too many incorrect attempts. Please request a new OTP.",
      "OTP_ATTEMPTS_EXCEEDED",
      otpRetryAfterSeconds(row),
    );
  }

  const expired = row.expires_at.getTime() <= row.db_now.getTime();
  if (!expired && !hashesMatch(sha256(otp), row.otp_hash)) {
    return failedAttempt(row, "invalid", db);
  }
  if (expired) {
    // A guess against an expired code counts as a failed attempt either way (Stage 25c).
    return failedAttempt(row, "expired", db);
  }

  // consume=false validates the code without using it up (wrong guesses still count above).
  if (consume) {
    const consumed = await otpQueries.consumeOtp(row.id, db);
    if (!consumed) {
      throw new AppError(400, "Invalid or expired OTP", "INVALID_OTP");
    }
    // A successful consuming verify resets the send-escalation level for this purpose
    // (Stage 18c): reset-password, verify-otp with change_email, confirm-password-change.
    // verifyForgotPasswordOtp's non-consuming check (consume=false) never reaches here.
    await otpQueries.resetSendEscalation(row.id, db);
  }
  return { ok: true };
}

async function failedAttempt(
  row: OtpRowWithNow,
  reason: "invalid" | "expired",
  db: Queryable,
): Promise<CheckOtpResult> {
  const newCount = await otpQueries.incrementAttempts(row.id, db);
  if (newCount >= row.max_attempts) {
    return { ok: false, reason, exhausted: true, retryAfterSeconds: otpRetryAfterSeconds(row) };
  }
  return { ok: false, reason };
}
