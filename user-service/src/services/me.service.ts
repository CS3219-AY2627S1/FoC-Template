/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Generated the me service (changeActiveView) as specified in
 *        instructions.md Stage 11.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added getOwnProfile as specified in instructions.md Stage 12a.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added changeUsername as specified in instructions.md Stage 12b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added initiateEmailChange as specified in instructions.md Stage 12c.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added verifyEmailChangeOtp, resendChangeEmailOtp and resendChangePasswordOtp as
 *        specified in instructions.md Stage 12d. Factored initiateEmailChange's inline
 *        requestOtp-result switch into a shared helper reused by all three (no behavior change).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added initiatePasswordChange and confirmPasswordChange as specified in
 *        instructions.md Stage 12e.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: getOwnProfile also returns activeView, as specified in instructions.md Stage 15a.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: changeActiveView now returns the camelCase toUserResponse shape, per
 *        instructions.md Stage 15c.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: initiateEmailChange and initiatePasswordChange now run as two transactions: phase 1
 *        checks the login lockout and the current password (counting a wrong one on the same
 *        counter as login, Stage 18b) and commits its reset/failure write on its own; phase 2
 *        does the email/password-specific checks and the OTP request. This is so a later
 *        failure in phase 2 (e.g. EMAIL_UNCHANGED) can never roll back phase 1's lockout write.
 *        Renamed throwOnUnsentOtp to unsentOtpError (returns the error instead of throwing it)
 *        for the same reason on the OTP side: a send-escalation cap hit (Stage 18c) writes the
 *        new level/block end inside the same transaction that calls requestOtp, so every
 *        caller now applies the result after that transaction commits, not inside it. Its
 *        OTP_RESEND_LIMIT message/Retry-After also now match the escalation level.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Pass locked.username to requestOtp at initiateEmailChange, resendChangeEmailOtp,
 *        resendChangePasswordOtp and initiatePasswordChange, for the OTP-email retry/logging
 *        added in email.service.ts and otp.service.ts. Governing decision: instructions.md
 *        Stage 19.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: changeActiveView passes its own userId as toUserResponse's new requesterId param
 *        (self-view, so the email stays unmasked), per instructions.md Stage 20.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: verifyEmailChangeOtp and confirmPasswordChange now call the shared throwOtpFailure
 *        helper instead of a hardcoded INVALID_OTP throw, per instructions.md Stage 25.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-09
 * Scope: Added the team-specified preferred_lang setting (ISO 639-1 subset: en, zh, hi, ta, ms, es, ar; default en), following the active-view flow.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Author review:
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Fix F4 - initiateEmailChange and initiatePasswordChange's pre-lock bcrypt checks read
 *        the hash via findPasswordHashById, since findById no longer selects password_hash.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Stage 31b - initiateEmailChange and initiatePasswordChange now call the shared
 *        triggerUnlockEmail (auth.service.ts) when a wrong current password hits the login
 *        lockout threshold, after the lock's transaction has committed. Governing decision:
 *        instructions.md Stage 31 (changes table row 4). No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-10, Codex, model: GPT-6): Resolved merge conflicts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import bcrypt from 'bcrypt';
import * as otpQueries from '../db/queries/otp.queries.js';
import * as tokenQueries from '../db/queries/tokens.queries.js';
import * as userQueries from '../db/queries/users.queries.js';
import { withTransaction } from '../db/transaction.js';
import { AppError } from '../utils/AppError.js';
import {
  accountLockedAppError,
  EMAIL_REGEX,
  OTP_REGEX,
  PASSWORD_MESSAGE,
  PASSWORD_REGEX,
  recordLoginFailure,
  throwIfLoginLocked,
  triggerUnlockEmail,
  USERNAME_MESSAGE,
  USERNAME_REGEX,
} from './auth.service.js';
import { escalationWording } from './lockEscalation.js';
import { checkOtp, requestOtp, throwOtpFailure, type RequestOtpResult } from './otp.service.js';
import { toUserResponse, type UserResponse } from './userResponse.js';

const BCRYPT_WORK_FACTOR = 10;

function isPgUniqueViolation(err: unknown): err is { code: string; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}

// Shared by initiateEmailChange, resendChangeEmailOtp and resendChangePasswordOtp.
// no-user/not-verified cannot occur at any of these call sites, since each already holds
// the user row locked and active, but the switch stays exhaustive.
//
// Returns the error rather than throwing it: a cap hit writes the new escalation level/block
// end (Stage 18c) inside the same transaction that calls requestOtp, so throwing in there would
// roll that write back. Callers return the RequestOtpResult as their transaction's value and
// call `if (err) throw err;` with this only after that transaction has committed.
function unsentOtpError(result: RequestOtpResult): AppError | null {
  switch (result.status) {
    case 'sent':
      return null;
    case 'throttled':
      if (result.reason === 'cooldown') {
        return new AppError(
          429,
          'Please wait before requesting another OTP',
          'OTP_RESEND_COOLDOWN',
          result.retryAfterSeconds,
        );
      }
      return new AppError(
        429,
        `Maximum OTP resends reached. Please try again in ${escalationWording(result.level)}.`,
        'OTP_RESEND_LIMIT',
        result.retryAfterSeconds,
      );
    case 'no-user':
      return new AppError(404, 'User not found', 'USER_NOT_FOUND');
    case 'not-verified':
      return new AppError(
        403,
        'Account not verified. Please finish registration first.',
        'ACCOUNT_NOT_VERIFIED',
      );
  }
}

// A plain single-row UPDATE: no lock or transaction, since there is no transition rule and no
// side effect to keep atomic with the write.
export async function changeActiveView(
  userId: string,
  activeView: 'requester' | 'courier',
): Promise<UserResponse> {
  const row = await userQueries.updateActiveView(userId, activeView);
  if (!row) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }
  return toUserResponse(row, userId);
}

// AI-generated (edited by <name>).
export async function changePreferredLang(
  userId: string,
  preferredLang: string,
): Promise<UserResponse> {
  const row = await userQueries.updatePreferredLang(userId, preferredLang);
  if (!row) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }
  return toUserResponse(row, userId);
}

export async function getOwnProfile(
  userId: string,
): Promise<{
  username: string;
  email: string;
  activeView: 'requester' | 'courier';
  preferredLang: string;
}> {
  const user = await userQueries.findById(userId);
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }
  return {
    username: user.username,
    email: user.email,
    activeView: user.active_view,
    preferredLang: user.preferred_lang,
  };
}

export async function changeUsername(
  userId: string,
  newUsername: string,
): Promise<{ username: string; email: string }> {
  if (!USERNAME_REGEX.test(newUsername)) {
    throw new AppError(400, USERNAME_MESSAGE, 'VALIDATION_ERROR');
  }

  return withTransaction(async (client) => {
    const locked = await userQueries.lockUserById(userId, client);
    if (!locked) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    if (newUsername === locked.username) {
      throw new AppError(
        409,
        'New username must be different from your current username',
        'USERNAME_UNCHANGED',
      );
    }

    const existing = await userQueries.findByUsername(newUsername, client);
    if (existing && existing.id !== userId) {
      throw new AppError(409, 'Username already in use', 'USERNAME_TAKEN');
    }

    let updated;
    try {
      updated = await userQueries.updateUsername(locked.id, newUsername, client);
    } catch (err) {
      if (isPgUniqueViolation(err) && (err.constraint ?? '').includes('username')) {
        throw new AppError(409, 'Username already in use', 'USERNAME_TAKEN');
      }
      throw err;
    }

    return { username: updated.username, email: updated.email };
  });
}

export async function initiateEmailChange(
  userId: string,
  { currentPassword, newEmail }: { currentPassword: string; newEmail: string },
): Promise<void> {
  if (!EMAIL_REGEX.test(newEmail)) {
    throw new AppError(400, 'Please enter a valid email', 'VALIDATION_ERROR');
  }

  // Unlocked read first: bcrypt is slow, so verify before taking the row lock. Only the hash is
  // read (fix F4: findById no longer selects password_hash).
  const user = await userQueries.findPasswordHashById(userId);
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }
  const passwordMatches = await bcrypt.compare(currentPassword, user.password_hash);

  // Phase 1: the lock check and current-password check, committed on their own, so a correct
  // password's reset of the login-lockout counter (Stage 18b) is never undone by a later
  // failure in phase 2 (e.g. EMAIL_UNCHANGED) rolling back this transaction.
  const authOutcome = await withTransaction(async (client) => {
    const locked = await userQueries.lockUserByIdWithNow(userId, client);
    if (!locked) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    // Check order (Stage 18b): the lock check runs before the current-password check.
    throwIfLoginLocked(locked);

    // Re-verify against the locked row: the pre-lock read can be stale.
    const stillMatches = passwordMatches && (await bcrypt.compare(currentPassword, locked.password_hash));
    if (!stillMatches) {
      if (locked.status !== 'pending' && locked.status !== 'suspended') {
        const failureResult = await recordLoginFailure(locked, client);
        // The failure that hits the threshold is itself rejected with ACCOUNT_LOCKED, not
        // INVALID_PASSWORD, but the lock write must commit before that is thrown.
        if (failureResult.locked) {
          return { kind: 'locked' as const, result: failureResult };
        }
      }
      return { kind: 'invalid' as const };
    }
    // A correct current password resets the login-lockout counter (Stage 18b).
    await userQueries.resetLoginLock(locked.id, client);
    return { kind: 'ok' as const };
  });

  if (authOutcome.kind === 'locked') {
    triggerUnlockEmail(authOutcome.result.user, authOutcome.result.lockedUntil);
    throw accountLockedAppError(authOutcome.result);
  }
  if (authOutcome.kind === 'invalid') {
    throw new AppError(401, 'Current password is incorrect', 'INVALID_PASSWORD');
  }

  // Phase 2: email validation and the OTP request. A cap hit's write must commit even though
  // the result is an error, so unsentOtpError is applied after this transaction, not inside it.
  const otpResult = await withTransaction(async (client) => {
    const locked = await userQueries.lockUserById(userId, client);
    if (!locked) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    if (newEmail === locked.email) {
      throw new AppError(
        409,
        'New email must be different from your current email',
        'EMAIL_UNCHANGED',
      );
    }
    const stillExisting = await userQueries.findByEmail(newEmail, client);
    if (stillExisting && stillExisting.id !== userId) {
      throw new AppError(409, 'Email already in use', 'EMAIL_TAKEN');
    }

    return requestOtp(
      { userId: locked.id, email: locked.email, purpose: 'Change Email', newEmail, username: locked.username },
      client,
    );
  });
  const err = unsentOtpError(otpResult);
  if (err) throw err;
}

// The OTP row's new_email is always set for a Change Email purpose: initiateEmailChange is
// the only writer, and it always passes newEmail.
export async function verifyEmailChangeOtp(userId: string, otp: string): Promise<void> {
  const result = await withTransaction(async (client) => {
    const locked = await userQueries.lockUserById(userId, client);
    if (!locked) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const pending = await otpQueries.findLatestOtp(userId, 'Change Email', client);
    if (!pending) {
      throw new AppError(400, 'Invalid or expired OTP', 'INVALID_OTP');
    }

    const check = await checkOtp({ userId, purpose: 'Change Email', otp }, client);
    if (check.ok) {
      try {
        await userQueries.updateEmail(locked.id, pending.new_email!, client);
      } catch (err) {
        if (isPgUniqueViolation(err) && (err.constraint ?? '').includes('email')) {
          // Someone else took the address in the meantime. The whole transaction, including
          // the OTP consumption above, rolls back, so the OTP stays usable for another email.
          throw new AppError(409, 'Email already in use', 'EMAIL_TAKEN');
        }
        throw err;
      }
    }
    return check;
  });

  // Thrown only after commit so the incremented attempt count is persisted.
  if (!result.ok) {
    throwOtpFailure(result);
  }
}

export async function resendChangeEmailOtp(userId: string): Promise<void> {
  // A cap hit's write must commit even though the result is an error, so unsentOtpError is
  // applied after this transaction, not inside it.
  const result = await withTransaction(async (client) => {
    const locked = await userQueries.lockUserById(userId, client);
    if (!locked) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const pending = await otpQueries.findLatestOtp(userId, 'Change Email', client);
    if (!pending || pending.consumed_at) {
      throw new AppError(400, 'No pending email change found', 'NO_PENDING_EMAIL_CHANGE');
    }

    return requestOtp(
      {
        userId: locked.id,
        email: locked.email,
        purpose: 'Change Email',
        newEmail: pending.new_email!,
        username: locked.username,
      },
      client,
    );
  });
  const err = unsentOtpError(result);
  if (err) throw err;
}

export async function resendChangePasswordOtp(userId: string): Promise<void> {
  // A cap hit's write must commit even though the result is an error, so unsentOtpError is
  // applied after this transaction, not inside it.
  const result = await withTransaction(async (client) => {
    const locked = await userQueries.lockUserById(userId, client);
    if (!locked) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const pending = await otpQueries.findLatestOtp(userId, 'Change Password', client);
    if (!pending || pending.consumed_at) {
      throw new AppError(400, 'No pending password change found', 'NO_PENDING_PASSWORD_CHANGE');
    }

    return requestOtp(
      { userId: locked.id, email: locked.email, purpose: 'Change Password', username: locked.username },
      client,
    );
  });
  const err = unsentOtpError(result);
  if (err) throw err;
}

// newPassword is validated here but never written anywhere — it is discarded once this
// call returns. confirmPasswordChange re-supplies and applies it.
export async function initiatePasswordChange(
  userId: string,
  { currentPassword, newPassword }: { currentPassword: string; newPassword: string },
): Promise<void> {
  if (!PASSWORD_REGEX.test(newPassword)) {
    throw new AppError(400, PASSWORD_MESSAGE, 'VALIDATION_ERROR');
  }

  // Unlocked read first: bcrypt is slow, so verify before taking the row lock. Only the hash is
  // read (fix F4: findById no longer selects password_hash).
  const user = await userQueries.findPasswordHashById(userId);
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }
  const passwordMatches = await bcrypt.compare(currentPassword, user.password_hash);

  // Phase 1: the lock check and current-password check, committed on their own, so a correct
  // password's reset of the login-lockout counter (Stage 18b) is never undone by a later
  // failure in phase 2 (e.g. PASSWORD_UNCHANGED) rolling back this transaction.
  const authOutcome = await withTransaction(async (client) => {
    const locked = await userQueries.lockUserByIdWithNow(userId, client);
    if (!locked) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    // Check order (Stage 18b): the lock check runs before the current-password check.
    throwIfLoginLocked(locked);

    // Re-verify against the locked row: the pre-lock read can be stale.
    const stillMatches = passwordMatches && (await bcrypt.compare(currentPassword, locked.password_hash));
    if (!stillMatches) {
      if (locked.status !== 'pending' && locked.status !== 'suspended') {
        const failureResult = await recordLoginFailure(locked, client);
        // The failure that hits the threshold is itself rejected with ACCOUNT_LOCKED, not
        // INVALID_PASSWORD, but the lock write must commit before that is thrown.
        if (failureResult.locked) {
          return { kind: 'locked' as const, result: failureResult };
        }
      }
      return { kind: 'invalid' as const };
    }
    // A correct current password resets the login-lockout counter (Stage 18b).
    await userQueries.resetLoginLock(locked.id, client);
    return { kind: 'ok' as const };
  });

  if (authOutcome.kind === 'locked') {
    triggerUnlockEmail(authOutcome.result.user, authOutcome.result.lockedUntil);
    throw accountLockedAppError(authOutcome.result);
  }
  if (authOutcome.kind === 'invalid') {
    throw new AppError(401, 'Current password is incorrect', 'INVALID_PASSWORD');
  }

  // Phase 2: the new-password check and the OTP request. A cap hit's write must commit even
  // though the result is an error, so unsentOtpError is applied after this transaction, not
  // inside it.
  const otpResult = await withTransaction(async (client) => {
    const locked = await userQueries.lockUserById(userId, client);
    if (!locked) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const sameAsCurrent = await bcrypt.compare(newPassword, locked.password_hash);
    if (sameAsCurrent) {
      throw new AppError(
        400,
        'New password must be different from your current password',
        'PASSWORD_UNCHANGED',
      );
    }

    return requestOtp(
      { userId: locked.id, email: locked.email, purpose: 'Change Password', username: locked.username },
      client,
    );
  });
  const err = unsentOtpError(otpResult);
  if (err) throw err;
}

export async function confirmPasswordChange(
  userId: string,
  { otp, newPassword }: { otp: string; newPassword: string },
): Promise<void> {
  if (!PASSWORD_REGEX.test(newPassword)) {
    throw new AppError(400, PASSWORD_MESSAGE, 'VALIDATION_ERROR');
  }
  if (!OTP_REGEX.test(otp)) {
    throw new AppError(400, 'OTP must be a 6-digit code', 'VALIDATION_ERROR');
  }

  const result = await withTransaction(async (client) => {
    const locked = await userQueries.lockUserById(userId, client);
    if (!locked) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    // Re-checked here in case the password changed between initiate and confirm.
    const sameAsCurrent = await bcrypt.compare(newPassword, locked.password_hash);
    if (sameAsCurrent) {
      throw new AppError(
        400,
        'New password must be different from your current password',
        'PASSWORD_UNCHANGED',
      );
    }

    const check = await checkOtp({ userId, purpose: 'Change Password', otp }, client);
    if (check.ok) {
      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_WORK_FACTOR);
      await userQueries.updatePasswordHash(locked.id, passwordHash, client);
      // Same transaction as the password change, so no old session outlives it.
      await tokenQueries.revokeAllRefreshTokensForUser(locked.id, client);
    }
    return check;
  });

  // Thrown only after commit so the incremented attempt count is persisted.
  if (!result.ok) {
    throwOtpFailure(result);
  }
}
