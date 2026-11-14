// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 4b - registration
// Author review:
// 25/09/2026: Stage 4c - login + tokens
// Author review:
// 25/09/2026: Stage 4d - logout + refresh
// Author review:
// 25/09/2026: Stage 5d - pending registration with OTP
// Author review:
// 25/09/2026: Stage 5e - verify and resend registration OTP
// Author review:
// 25/09/2026: Stage 6 pre-work - login creates refresh token under user row lock
// Author review:
// 25/09/2026: Stage 6 pre-work - registration resend-limit message text
// Author review:
// 25/09/2026: Stage 6 pre-work - refresh locks user then token in a transaction
// Author review:
// 25/09/2026: Stage 6b - forgotPassword
// Author review:
// 25/09/2026: Stage 6c - verifyForgotPasswordOtp
// Author review:
// 25/09/2026: Stage 6d - resetPassword
// Author review:
// 25/09/2026: Stage 6e - resendForgotPasswordOtp
// Author review:
// 27/09/2026: Stage 11 - login returns activeView
// Author review:
// 27/09/2026: Stage 12b - exported USERNAME_REGEX, EMAIL_REGEX, USERNAME_MESSAGE for reuse in me.service.ts
// Author review:
// 27/09/2026: Stage 12e - exported OTP_REGEX for reuse in me.service.ts
// Author review:
// 2026-10-21: Stage 14d - insert the credit-allocation outbox row after activation, same
//   transaction/client. No requirements, architecture, schema, or API decisions were made by
//   the AI tool — see instructions.md Stage 14 for the governing decision.
// Author review:
// 2026-11-04: Stage 17 - moved PASSWORD_REGEX/PASSWORD_MESSAGE into utils/passwordPolicy.ts
//   (re-exported here) so src/scripts/setupLocalDev.ts can import the policy without
//   transitively importing config.ts. No requirements, architecture, schema, or API decisions
//   were made by the AI tool.
// Author review:
// 2026-11-04: Stage 18b/18c - login() checks and records the escalating login lockout before
//   the password check (throwIfLoginLocked/recordLoginFailure), with the failure that hits the
//   threshold itself rejected as ACCOUNT_LOCKED (429) rather than INVALID_CREDENTIALS once its
//   lock write has committed. forgotPassword's switch on requestOtp's result now runs after
//   that call's transaction commits, not inside it, so an OTP send-escalation cap hit's write
//   (Stage 18c) is never rolled back by the OTP_RESEND_LIMIT throw; its message/Retry-After
//   also now match the escalation level. Governing decision: instructions.md Stage 18.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-04: Stage 19 - pass username to issueOtp/requestOtp at register(), resendRegistrationOtp()
//   and forgotPassword(), for the new OTP-email retry/logging in email.service.ts. Governing
//   decision: instructions.md Stage 19.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-05: Stage 23b - login() and refresh() also return sessionTimeLeftSeconds, taken from
//   tokens.queries.ts' seconds_left (computed in SQL, never Date.now()). Checks, check order,
//   locking and error codes are unchanged. Governing decision: instructions.md Stage 23b.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-06: Stage 25a/25c - verifyRegistrationOtp, verifyForgotPasswordOtp and resetPassword
//   now call the shared throwOtpFailure helper instead of a hardcoded INVALID_OTP throw, so
//   they also surface OTP_EXPIRED and the 429 OTP_ATTEMPTS_EXCEEDED (with Retry-After) from
//   otp.service.ts. Governing decision: instructions.md Stage 25.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-09: Stage 27a - login() and refresh() now pass the login's refresh_tokens.id as
//   `sid` into signAccessToken, so the access token carries the same device-binding claim the
//   new elevation token uses. Governing decision: instructions.md Stage 27.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-10: Stage 31b - recordLoginFailure's locked result now carries lockedUntil and the
//   {id, email, username} that triggered it; login() uses the new triggerUnlockEmail to fire
//   the Stage 31b unlock email in the background (caught, never awaited) after the lock's
//   transaction commits. me.service.ts's initiateEmailChange/initiatePasswordChange, which
//   share recordLoginFailure, call the same exported triggerUnlockEmail. Tool: Claude Code
//   (model: claude-sonnet-5). Governing decision: instructions.md Stage 31 ("When the email is
//   sent" table, changes table row 4). No requirements, architecture, schema, or API decisions
//   were made by the AI tool.
// Author review:
// 2026-11-10: Stage 31c - added unlockByToken for POST /auth/unlock: verifies the unlock token,
//   locks the target row FOR UPDATE, and only clears it (via users.service.ts's shared
//   clearLoginLock) when the token's `lck` equals the row's current login_locked_until (to the
//   second) and that lock has not yet passed by the DB clock; otherwise ALREADY_UNLOCKED, with
//   no write. No audit row (Stage 31's own rule). Tool: Claude Code (model: claude-sonnet-5).
//   Governing decision: instructions.md Stage 31 ("The unlock link and token" table). No
//   requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-10: Bug fix - fixed verify-otp/resend-otp (registration purpose) being resolvable
//   purely from the request body's `email`, letting one pending account's OTP flow be driven
//   against a different pending account. register() now also returns a pendingToken (signed for
//   the new user's id); login()'s pending-account throw now attaches the same kind of token as
//   an AppError cookie; verifyRegistrationOtp/resendRegistrationOtp take an added pendingToken
//   param and, via the new assertPendingTokenMatches helper, reject with 403 EMAIL_MISMATCH
//   before any OTP attempt-count/resend-cooldown/resend-count logic runs if the cookie is
//   missing, invalid/expired, or belongs to a different account than the one found by `email`.
//   forgotPassword/resendForgotPasswordOtp/verifyForgotPasswordOtp/resetPassword are untouched.
//   Tool: Claude Code (model: claude-sonnet-5). Governing decision: bug report + team decisions
//   recorded in this task's conversation (pending-token cookie mechanism, EMAIL_MISMATCH 403
//   with no OTP-counter interaction, TTL = config.otp.ttlMinutes). No requirements, architecture,
//   schema, or API decisions were made by the AI tool.
// Author review:

import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { config } from '../config.js';
import * as creditOutboxQueries from '../db/queries/creditOutbox.queries.js';
import * as tokenQueries from '../db/queries/tokens.queries.js';
import * as userQueries from '../db/queries/users.queries.js';
import type { UserRowWithNow } from '../db/queries/users.queries.js';
import { withTransaction, type Queryable } from '../db/transaction.js';
import { AppError } from '../utils/AppError.js';
import { sha256 } from '../utils/hash.js';
import {
  signAccessToken,
  signPendingVerificationToken,
  signUnlockToken,
  verifyPendingVerificationToken,
  verifyUnlockToken,
} from '../utils/jwt.js';
import { REFRESH_COOKIE_OPTIONS } from '../utils/cookies.js';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../utils/passwordPolicy.js';
import * as otpQueries from '../db/queries/otp.queries.js';
import { durationHoursForLevel, effectiveEscalationLevel, escalationWording } from './lockEscalation.js';
import { checkOtp, issueOtp, requestOtp, throwOtpFailure } from './otp.service.js';
import { sendUnlockEmail } from './email.service.js';
import { clearLoginLock } from './users.service.js';

function accountLockedMessage(lockLevel: number): string {
  return `Too many failed login attempts. Please try again in ${escalationWording(lockLevel)}.`;
}

// Shared with me.service.ts (initiateEmailChange / initiatePasswordChange), which count a
// wrong current password on the same login-lockout counter (Stage 18b). Safe to throw directly
// (rather than returning a result for the caller to throw after commit, as recordLoginFailure
// below does): nothing has been written yet in either caller's transaction at the point this is
// called, so there is nothing a rollback would undo.
export function throwIfLoginLocked(row: UserRowWithNow): void {
  if (!row.login_locked_until || row.login_locked_until.getTime() <= row.db_now.getTime()) {
    return;
  }
  const retryAfterSeconds = Math.ceil(
    (row.login_locked_until.getTime() - row.db_now.getTime()) / 1000,
  );
  throw new AppError(429, accountLockedMessage(row.login_lock_level), 'ACCOUNT_LOCKED', retryAfterSeconds);
}

export type RecordLoginFailureResult =
  | { locked: false }
  | {
      locked: true;
      lockLevel: number;
      retryAfterSeconds: number;
      lockedUntil: Date;
      user: { id: string; email: string; username: string };
    };

// Call inside a transaction, against a row already locked with lockUserByIdWithNow, when a
// password attempt on that row's account failed. Not called for pending/suspended accounts
// (Stage 18b: "what does not count"), which is also why a locked result's user is always an
// active account, matching Stage 31b's "no email for pending/suspended" rule without a
// separate check here.
//
// Returns rather than throws when the threshold is hit on this very call: the lock write must
// commit, so the caller throws accountLockedAppError(result) itself only after its
// withTransaction call resolves (the same "thrown only after commit" pattern used elsewhere in
// this file for OTP attempt counts) — the 5th failure in the window is itself rejected with
// ACCOUNT_LOCKED, per the Stage 18b Verification bullet. lockedUntil and user are carried on the
// result (Stage 31b) so the caller can trigger the unlock email after that commit.
export async function recordLoginFailure(
  row: UserRowWithNow,
  db: Queryable,
): Promise<RecordLoginFailureResult> {
  const windowMs = config.lock.loginFailureWindowMinutes * 60_000;
  const windowStart = row.login_failure_window_start;
  const windowExpired = !windowStart || row.db_now.getTime() - windowStart.getTime() > windowMs;
  const newCount = windowExpired ? 1 : row.login_failed_attempts + 1;

  if (newCount >= config.lock.maxLoginFailures) {
    const currentLevel = effectiveEscalationLevel(
      row.login_lock_level,
      row.login_locked_until,
      row.db_now,
    );
    const newLevel = currentLevel + 1;
    const durationHours = durationHoursForLevel(newLevel);
    const lockedUntil = new Date(row.db_now.getTime() + durationHours * 3_600_000);
    await userQueries.lockLoginAccount(row.id, { lockedUntil, lockLevel: newLevel }, db);
    return {
      locked: true,
      lockLevel: newLevel,
      retryAfterSeconds: durationHours * 3600,
      lockedUntil,
      user: { id: row.id, email: row.email, username: row.username },
    };
  }

  await userQueries.recordLoginFailure(
    row.id,
    { failedAttempts: newCount, windowStart: windowExpired ? row.db_now : windowStart },
    db,
  );
  return { locked: false };
}

export function accountLockedAppError(result: { lockLevel: number; retryAfterSeconds: number }): AppError {
  return new AppError(429, accountLockedMessage(result.lockLevel), 'ACCOUNT_LOCKED', result.retryAfterSeconds);
}

// Stage 31b: fires the lockout unlock email in the background, after the caller's lock
// transaction has committed. Never awaited by the caller - the 429 response must not wait for
// the send - and the send's rejection is caught here so a failed send (logged by
// sendMailWithRetry's own attempt lines) can never become an unhandled rejection. Shared by
// login() below and by me.service.ts's initiateEmailChange/initiatePasswordChange, which hit
// the same counter on a wrong current password.
export function triggerUnlockEmail(
  user: { id: string; email: string; username: string },
  lockedUntil: Date,
): void {
  const token = signUnlockToken({ userId: user.id, lockedUntil });
  const unlockUrl = `${config.frontend.baseUrl}/unlock-account?token=${token}`;
  void sendUnlockEmail({ to: user.email, username: user.username, unlockUrl }).catch(() => {
    // Every attempt, including the final failure, is already logged by sendMailWithRetry; the
    // lock stands regardless of whether the email ever goes out.
  });
}

// POST /auth/unlock (Stage 31c). Public; the token alone decides everything. A structurally
// invalid, wrong-typ, bad-signature or expired token is INVALID_UNLOCK_TOKEN. Otherwise the
// token is valid and "already unlocked" covers every other case that reveals nothing about
// account state: no such user, pending/suspended, the lock has passed by the DB clock, or the
// token's `lck` no longer matches the row's current login_locked_until (cleared, replaced by a
// newer lock, or already consumed by a previous click of this same link).
export async function unlockByToken(token: string): Promise<'UNLOCKED' | 'ALREADY_UNLOCKED'> {
  let decoded: { user_id: string; lck: number };
  try {
    decoded = verifyUnlockToken(token);
  } catch {
    throw new AppError(401, 'This link is invalid or has expired', 'INVALID_UNLOCK_TOKEN');
  }

  return withTransaction(async (client) => {
    const locked = await userQueries.lockUserByIdWithNow(decoded.user_id, client);
    if (!locked || locked.status === 'pending' || locked.status === 'suspended') {
      return 'ALREADY_UNLOCKED';
    }
    if (!locked.login_locked_until || locked.login_locked_until.getTime() <= locked.db_now.getTime()) {
      return 'ALREADY_UNLOCKED';
    }
    // Compared to the second, like the token's claim (Stage 31a: `lck` is epoch seconds),
    // since the column itself carries sub-second precision.
    const currentLck = Math.floor(locked.login_locked_until.getTime() / 1000);
    if (currentLck !== decoded.lck) {
      return 'ALREADY_UNLOCKED';
    }

    // The row is locked FOR UPDATE above, so a concurrent click with the same token either
    // waits behind this one (and then sees the cleared lock and falls into one of the checks
    // above) or runs first and clears it itself - either way, only one click ever reaches here.
    const cleared = await clearLoginLock(locked.id, client);
    if (!cleared) {
      return 'ALREADY_UNLOCKED';
    }
    return 'UNLOCKED';
  });
}

export { PASSWORD_MESSAGE, PASSWORD_REGEX };

export const USERNAME_REGEX = /^[A-Za-z0-9_]{3,255}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const USERNAME_MESSAGE =
  'Username must contain between 3 and 255 chars and have no spaces or special characters.';

export const OTP_REGEX = /^\d{6}$/;

const BCRYPT_WORK_FACTOR = 10;

function isPgUniqueViolation(err: unknown): err is { code: string; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}

export async function register({
  username,
  email,
  password,
}: {
  username: string;
  email: string;
  password: string;
}): Promise<{ pendingToken: string }> {
  if (!USERNAME_REGEX.test(username)) {
    throw new AppError(400, USERNAME_MESSAGE, 'VALIDATION_ERROR');
  }

  if (!EMAIL_REGEX.test(email)) {
    throw new AppError(400, 'Please enter a valid email', 'VALIDATION_ERROR');
  }

  if (!PASSWORD_REGEX.test(password)) {
    throw new AppError(400, PASSWORD_MESSAGE, 'VALIDATION_ERROR');
  }

  const userId = await withTransaction(async (client) => {
    await userQueries.deleteStalePendingUsers({ username, email }, client);

    // A live pending user (unexpired OTP) still counts as taken: this is the reservation.
    const existingUsername = await userQueries.findByUsername(username, client);
    if (existingUsername) {
      throw new AppError(409, 'Username already in use', 'USERNAME_TAKEN');
    }

    const existingEmail = await userQueries.findByEmail(email, client);
    if (existingEmail) {
      throw new AppError(409, 'Email already in use', 'EMAIL_TAKEN');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_WORK_FACTOR);

    let userId: string;
    try {
      const user = await userQueries.createUser(
        { username, email, passwordHash, status: 'pending' },
        client,
      );
      userId = user.id;
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        const constraint = err.constraint ?? '';
        if (constraint.includes('username')) {
          throw new AppError(409, 'Username already in use', 'USERNAME_TAKEN');
        }
        if (constraint.includes('email')) {
          throw new AppError(409, 'Email already in use', 'EMAIL_TAKEN');
        }
      }
      throw err;
    }

    await issueOtp({ userId, email, purpose: 'Registration', username }, client);
    return userId;
  });

  return { pendingToken: signPendingVerificationToken({ userId }) };
}

export async function login(
  { identifier, password }: { identifier: string; password: string },
  userAgent: string | null,
  ipAddress: string | null,
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; email: string; role: string; activeView: string };
  sessionTimeLeftSeconds: number;
}> {
  const user =
    (await userQueries.findByUsername(identifier)) ?? (await userQueries.findByEmail(identifier));

  if (!user) {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  // bcrypt is slow, so compute it before taking the row lock below. Its result is used only
  // after the lock check and the stale-hash re-check inside the transaction.
  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  const refreshTokenPlain = randomBytes(32).toString('hex');
  const refreshTokenHash = sha256(refreshTokenPlain);

  // Lock the user and re-check everything against the locked row, so a reset, suspend or
  // another login's failure/lock that committed in between is never missed.
  const outcome = await withTransaction(async (client) => {
    const locked = await userQueries.lockUserByIdWithNow(user.id, client);
    if (!locked) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Check order (Stage 18b): the lock check runs before the password check, whatever
    // password was sent. Nothing has been written yet, so throwing here directly is safe.
    throwIfLoginLocked(locked);

    // Stale-hash guard: the pre-lock bcrypt result is only valid if the hash has not changed
    // since (e.g. a concurrent password reset).
    const effectiveMatch = passwordMatches && locked.password_hash === user.password_hash;
    const countsTowardLock = locked.status !== 'pending' && locked.status !== 'suspended';

    if (!effectiveMatch) {
      if (countsTowardLock) {
        const failureResult = await recordLoginFailure(locked, client);
        // The 5th failure in the window is itself rejected with ACCOUNT_LOCKED, not
        // INVALID_CREDENTIALS, but the lock write must commit before that is thrown.
        if (failureResult.locked) {
          return { kind: 'locked' as const, result: failureResult };
        }
      }
      return { kind: 'invalid' as const };
    }

    if (locked.status === 'pending') {
      throw new AppError(403, 'Account not verified', 'ACCOUNT_NOT_VERIFIED', undefined, {
        name: 'pendingToken',
        value: signPendingVerificationToken({ userId: locked.id }),
        options: { ...REFRESH_COOKIE_OPTIONS, maxAge: config.otp.ttlMinutes * 60 * 1000 },
      });
    }
    if (locked.status === 'suspended') {
      throw new AppError(403, 'Account suspended', 'ACCOUNT_SUSPENDED');
    }

    // A successful login clears the failure count, the window and the escalation level.
    await userQueries.resetLoginLock(locked.id, client);

    const tokenRow = await tokenQueries.createRefreshToken(
      {
        userId: user.id,
        tokenHash: refreshTokenHash,
        ttlDays: config.jwt.refreshTokenTtlDays,
        userAgent,
        ipAddress,
      },
      client,
    );
    return {
      kind: 'success' as const,
      role: locked.role,
      activeView: locked.active_view,
      sessionTimeLeftSeconds: tokenRow.seconds_left,
      sid: tokenRow.id,
    };
  });

  if (outcome.kind === 'locked') {
    triggerUnlockEmail(outcome.result.user, outcome.result.lockedUntil);
    throw accountLockedAppError(outcome.result);
  }
  if (outcome.kind === 'invalid') {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  const accessToken = signAccessToken({ userId: user.id, role: outcome.role, sid: outcome.sid });

  return {
    accessToken,
    refreshToken: refreshTokenPlain,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: outcome.role,
      activeView: outcome.activeView,
    },
    sessionTimeLeftSeconds: outcome.sessionTimeLeftSeconds,
  };
}

export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = sha256(refreshToken);

  await withTransaction(async (client) => {
    const tokenRow = await tokenQueries.lockRefreshToken(tokenHash, client);
    if (!tokenRow || tokenRow.is_revoked) {
      throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }
    await tokenQueries.revokeRefreshToken(tokenHash, client);
  });
}

export async function refresh(
  refreshToken: string,
): Promise<{ accessToken: string; sessionTimeLeftSeconds: number }> {
  const tokenHash = sha256(refreshToken);
  const tokenRow = await tokenQueries.findRefreshToken(tokenHash);

  if (
    !tokenRow ||
    tokenRow.is_revoked ||
    tokenRow.expires_at.getTime() < tokenRow.db_now.getTime()
  ) {
    throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  // Lock order: user row first, then token row (see the lock ordering rule in Stage 4d).
  // Re-check on the locked rows, so a logout, reset or suspend that committed while this
  // request waited cannot be followed by a freshly issued access token.
  const { id, role, sessionTimeLeftSeconds, sid } = await withTransaction(async (client) => {
    const lockedUser = await userQueries.lockUserById(tokenRow.user_id, client);
    if (!lockedUser) {
      throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }

    const lockedToken = await tokenQueries.lockRefreshToken(tokenHash, client);
    if (
      !lockedToken ||
      lockedToken.is_revoked ||
      lockedToken.expires_at.getTime() < lockedToken.db_now.getTime()
    ) {
      throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }

    if (lockedUser.status === 'suspended') {
      throw new AppError(403, 'Account suspended', 'ACCOUNT_SUSPENDED');
    }

    // Role comes from the freshly locked row, so a promotion applies on the next refresh.
    return {
      id: lockedUser.id,
      role: lockedUser.role,
      sessionTimeLeftSeconds: lockedToken.seconds_left,
      sid: lockedToken.id,
    };
  });

  const accessToken = signAccessToken({ userId: id, role, sid });

  return { accessToken, sessionTimeLeftSeconds };
}

// Pre-check for verifyRegistrationOtp/resendRegistrationOtp: the `pendingToken` cookie must be
// present, valid and issued for the same account the `email` body field resolved to. Throws
// 403 EMAIL_MISMATCH (same response for a missing cookie, a malformed/expired token, or a
// token for a different account - the three cases are never distinguished) before any
// OTP-related logic (attempt count, resend cooldown/count) runs.
function assertPendingTokenMatches(pendingToken: string | undefined, userId: string): void {
  if (!pendingToken) {
    throw new AppError(403, "This link doesn't match the account you're verifying", 'EMAIL_MISMATCH');
  }
  let decoded: { user_id: string };
  try {
    decoded = verifyPendingVerificationToken(pendingToken);
  } catch {
    throw new AppError(403, "This link doesn't match the account you're verifying", 'EMAIL_MISMATCH');
  }
  if (decoded.user_id !== userId) {
    throw new AppError(403, "This link doesn't match the account you're verifying", 'EMAIL_MISMATCH');
  }
}

export async function verifyRegistrationOtp({
  email,
  otp,
  pendingToken,
}: {
  email: string;
  otp: string;
  pendingToken: string | undefined;
}): Promise<void> {
  if (!OTP_REGEX.test(otp)) {
    throw new AppError(400, 'OTP must be a 6-digit code', 'VALIDATION_ERROR');
  }

  const result = await withTransaction(async (client) => {
    const user = await userQueries.findByEmail(email, client);
    if (!user || user.status !== 'pending') {
      throw new AppError(400, 'Invalid or expired OTP', 'INVALID_OTP');
    }
    assertPendingTokenMatches(pendingToken, user.id);

    const locked = await userQueries.lockUserById(user.id, client);

    if (!locked || locked.status !== 'pending') {
      throw new AppError(400, 'Invalid or expired OTP', 'INVALID_OTP');
    }

    const check = await checkOtp({ userId: user.id, purpose: 'Registration', otp }, client);
    if (check.ok) {
      const activated = await userQueries.activateUser(user.id, client);
      if (!activated) {
        throw new AppError(400, 'Invalid or expired OTP', 'INVALID_OTP');
      }
      await creditOutboxQueries.insertCreditAllocation(user.id, client);
    }
    return check;
  });

  // Thrown only after commit so the incremented attempt count is persisted.
  if (!result.ok) {
    throwOtpFailure(result);
  }
}

export async function resendRegistrationOtp({
  email,
  pendingToken,
}: {
  email: string;
  pendingToken: string | undefined;
}): Promise<void> {
  await withTransaction(async (client) => {
    const user = await userQueries.findByEmail(email, client);
    if (!user || user.status !== 'pending') {
      throw new AppError(400, 'No pending registration found', 'NO_PENDING_REGISTRATION');
    }
    assertPendingTokenMatches(pendingToken, user.id);

    const locked = await userQueries.lockUserById(user.id, client);

    if (!locked || locked.status !== 'pending') {
      throw new AppError(400, 'No pending registration found', 'NO_PENDING_REGISTRATION');
    }

    const count = await otpQueries.countOtps(user.id, 'Registration', client);
    if (count - 1 >= config.otp.maxResends) {
      throw new AppError(
        429,
        'Maximum OTP resends reached. Please try registering again in about 10 minutes.',
        'OTP_RESEND_LIMIT',
      );
    }

    const latest = await otpQueries.findLatestOtp(user.id, 'Registration', client);
    if (latest) {
      const availableAt = latest.created_at.getTime() + config.otp.resendCooldownSeconds * 1000;
      const remainingMs = availableAt - latest.db_now.getTime();
      if (remainingMs > 0) {
        throw new AppError(
          429,
          'Please wait before requesting another OTP',
          'OTP_RESEND_COOLDOWN',
          Math.ceil(remainingMs / 1000),
        );
      }
    }

    await issueOtp(
      { userId: user.id, email: user.email, purpose: 'Registration', username: user.username },
      client,
    );
  });
}

export async function forgotPassword({ email }: { email: string }): Promise<void> {
  // A cap hit writes the new escalation level/block end (Stage 18c) inside the same
  // transaction that calls requestOtp, so the switch below runs after this transaction has
  // committed rather than inside it, or that write would be rolled back by the throw.
  const result = await withTransaction(async (client) => {
    // Plain read is a cheap early exit; requestOtp re-checks after locking the row.
    const user = await userQueries.findByEmail(email, client);
    if (!user) {
      throw new AppError(404, 'Email not found', 'EMAIL_NOT_FOUND');
    }
    if (user.status === 'pending') {
      throw new AppError(
        403,
        'Account not verified. Please finish registration first.',
        'ACCOUNT_NOT_VERIFIED',
      );
    }

    return requestOtp(
      { userId: user.id, email: user.email, purpose: 'Forgot Password', username: user.username },
      client,
    );
  });

  switch (result.status) {
    case 'sent':
      return;
    case 'throttled':
      if (result.reason === 'cooldown') {
        throw new AppError(
          429,
          'Please wait before requesting another OTP',
          'OTP_RESEND_COOLDOWN',
          result.retryAfterSeconds,
        );
      }
      throw new AppError(
        429,
        `Maximum OTP resends reached. Please try again in ${escalationWording(result.level)}.`,
        'OTP_RESEND_LIMIT',
        result.retryAfterSeconds,
      );
    case 'no-user':
      throw new AppError(404, 'Email not found', 'EMAIL_NOT_FOUND');
    case 'not-verified':
      throw new AppError(
        403,
        'Account not verified. Please finish registration first.',
        'ACCOUNT_NOT_VERIFIED',
      );
  }
}

// Same operation as forgotPassword (both request a fresh OTP through requestOtp), so it is
// implemented once there and reused here for POST /auth/resend-otp.
export async function resendForgotPasswordOtp({ email }: { email: string }): Promise<void> {
  await forgotPassword({ email });
}

// Non-consuming check: the code stays valid until reset-password consumes it.
export async function verifyForgotPasswordOtp({
  email,
  otp,
}: {
  email: string;
  otp: string;
}): Promise<void> {
  if (!OTP_REGEX.test(otp)) {
    throw new AppError(400, 'OTP must be a 6-digit code', 'VALIDATION_ERROR');
  }

  const result = await withTransaction(async (client) => {
    const user = await userQueries.findByEmail(email, client);
    if (!user) {
      throw new AppError(404, 'Email not found', 'EMAIL_NOT_FOUND');
    }
    if (user.status === 'pending') {
      throw new AppError(
        403,
        'Account not verified. Please finish registration first.',
        'ACCOUNT_NOT_VERIFIED',
      );
    }

    // Re-check after the lock: the pre-lock read can be stale. Suspended accounts are allowed.
    const locked = await userQueries.lockUserById(user.id, client);
    if (!locked) {
      throw new AppError(404, 'Email not found', 'EMAIL_NOT_FOUND');
    }
    if (locked.status === 'pending') {
      throw new AppError(
        403,
        'Account not verified. Please finish registration first.',
        'ACCOUNT_NOT_VERIFIED',
      );
    }

    return checkOtp({ userId: user.id, purpose: 'Forgot Password', otp }, client, false);
  });

  // Thrown only after commit so the incremented attempt count is persisted.
  if (!result.ok) {
    throwOtpFailure(result);
  }
}

export async function resetPassword({
  email,
  otp,
  newPassword,
}: {
  email: string;
  otp: string;
  newPassword: string;
}): Promise<void> {
  if (!PASSWORD_REGEX.test(newPassword)) {
    throw new AppError(400, PASSWORD_MESSAGE, 'VALIDATION_ERROR');
  }
  if (!OTP_REGEX.test(otp)) {
    throw new AppError(400, 'OTP must be a 6-digit code', 'VALIDATION_ERROR');
  }

  const result = await withTransaction(async (client) => {
    const user = await userQueries.findByEmail(email, client);
    if (!user) {
      throw new AppError(404, 'Email not found', 'EMAIL_NOT_FOUND');
    }
    if (user.status === 'pending') {
      throw new AppError(
        403,
        'Account not verified. Please finish registration first.',
        'ACCOUNT_NOT_VERIFIED',
      );
    }

    // Lock the user row first (lock order: user, then its refresh tokens).
    // Re-check after the lock: the pre-lock read can be stale. Suspended accounts are allowed.
    const locked = await userQueries.lockUserById(user.id, client);
    if (!locked) {
      throw new AppError(404, 'Email not found', 'EMAIL_NOT_FOUND');
    }
    if (locked.status === 'pending') {
      throw new AppError(
        403,
        'Account not verified. Please finish registration first.',
        'ACCOUNT_NOT_VERIFIED',
      );
    }

    // Default consuming check: this is the real gate.
    const check = await checkOtp({ userId: user.id, purpose: 'Forgot Password', otp }, client);
    if (check.ok) {
      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_WORK_FACTOR);
      await userQueries.updatePasswordHash(user.id, passwordHash, client);
      // Same transaction as the password change, so no old session outlives it.
      await tokenQueries.revokeAllRefreshTokensForUser(user.id, client);
    }
    return check;
  });

  // Thrown only after commit so the incremented attempt count is persisted.
  if (!result.ok) {
    throwOtpFailure(result);
  }
}
