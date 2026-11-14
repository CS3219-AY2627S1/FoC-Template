// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
// Scope: Stage 27a - admin OTP elevation service (sendAdminOtp, resendAdminOtp, verifyAdminOtp).
//        Sends/verifies an `Admin Action` OTP to the acting admin's own email through the
//        existing requestOtp/checkOtp infrastructure, and issues the elevation token on a
//        successful verify. Governing decision: instructions.md Stage 27 (OTP and elevation
//        token tables). No requirements, architecture, schema, or API decisions were made by
//        the AI tool.
// Author review:
// 2026-11-09: Stage 27b - throwIfAlreadyElevated now uses the shared isElevated helper
//   (src/utils/elevation.ts), also used by users.service.ts's elevation requirement. No
//   behaviour change here. Governing decision: instructions.md Stage 27.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import * as otpQueries from '../db/queries/otp.queries.js';
import * as userQueries from '../db/queries/users.queries.js';
import { withTransaction } from '../db/transaction.js';
import { AppError } from '../utils/AppError.js';
import { isElevated } from '../utils/elevation.js';
import { signElevationToken } from '../utils/jwt.js';
import { escalationWording } from './lockEscalation.js';
import { OTP_REGEX } from './auth.service.js';
import { checkOtp, requestOtp, throwOtpFailure, type RequestOtpResult } from './otp.service.js';

// A valid Elevated-Token for this caller's device (sub and sid match) blocks send/verify/resend.
// An absent, invalid or expired one does not: it is simply treated as "not elevated".
function throwIfAlreadyElevated(elevatedToken: string | undefined, userId: string, sid: string): void {
  if (isElevated(elevatedToken, userId, sid)) {
    throw new AppError(409, 'Admin actions are already unlocked.', 'ALREADY_ELEVATED');
  }
}

// Shared by sendAdminOtp and resendAdminOtp: both call requestOtp and map its result the same
// way forgotPassword does (Stage 6b/18c).
function throwForThrottledOrMissing(
  result: RequestOtpResult,
): void {
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
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    case 'not-verified':
      throw new AppError(403, 'Account not verified', 'ACCOUNT_NOT_VERIFIED');
  }
}

export async function sendAdminOtp({
  userId,
  sid,
  elevatedToken,
}: {
  userId: string;
  sid: string;
  elevatedToken: string | undefined;
}): Promise<void> {
  throwIfAlreadyElevated(elevatedToken, userId, sid);

  const result = await withTransaction(async (client) => {
    // Plain read is a cheap early exit; requestOtp re-checks after locking the row.
    const user = await userQueries.findById(userId, client);
    if (!user) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }
    return requestOtp(
      { userId: user.id, email: user.email, purpose: 'Admin Action', username: user.username },
      client,
    );
  });

  throwForThrottledOrMissing(result);
}

export async function resendAdminOtp({
  userId,
  sid,
  elevatedToken,
}: {
  userId: string;
  sid: string;
  elevatedToken: string | undefined;
}): Promise<void> {
  throwIfAlreadyElevated(elevatedToken, userId, sid);

  const result = await withTransaction(async (client) => {
    const locked = await userQueries.lockUserById(userId, client);
    if (!locked) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    // Pending = the latest Admin Action OTP row exists and is not consumed (Stage 12d's
    // definition, reused here per instructions.md Stage 27).
    const pending = await otpQueries.findLatestOtp(userId, 'Admin Action', client);
    if (!pending || pending.consumed_at) {
      throw new AppError(400, 'No pending verification found', 'NO_PENDING_OTP');
    }

    return requestOtp(
      { userId: locked.id, email: locked.email, purpose: 'Admin Action', username: locked.username },
      client,
    );
  });

  throwForThrottledOrMissing(result);
}

export async function verifyAdminOtp({
  userId,
  role,
  sid,
  otp,
  elevatedToken,
}: {
  userId: string;
  role: string;
  sid: string;
  otp: string;
  elevatedToken: string | undefined;
}): Promise<{ elevationToken: string }> {
  if (!OTP_REGEX.test(otp)) {
    throw new AppError(400, 'OTP must be a 6-digit code', 'VALIDATION_ERROR');
  }

  throwIfAlreadyElevated(elevatedToken, userId, sid);

  const result = await withTransaction(async (client) => {
    const locked = await userQueries.lockUserById(userId, client);
    if (!locked) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }
    return checkOtp({ userId: locked.id, purpose: 'Admin Action', otp }, client);
  });

  // Thrown only after commit so the incremented attempt count is persisted.
  if (!result.ok) {
    throwOtpFailure(result);
  }

  return { elevationToken: signElevationToken({ userId, role, sid }) };
}
