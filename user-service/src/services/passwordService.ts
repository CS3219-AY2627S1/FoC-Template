/**
 * Services related to reset and forgot password
 *
 *
 * 1: Reset Password (Only when authenticated)
 *
 * 
 * Logged-in reset uses the same reset:{email} OTP and completeForgotPassword.
 *
 * 2: Reinstantiate Deleted Account (Get OTP, register again)
 */
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { CompleteForgotPasswordInput, ForgotPasswordInput } from '../api/dto/otpDto';
import { sendOTPRequest, verifyOTP } from './otpService';

const SALT_ROUNDS = 10;

// Same challenge used when sending the forgot-password OTP, so verify finds it.
export const RESET_CHALLENGE = 'reset';

type ForgotPasswordResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'deleted'
        | 'throttled'
        | 'locked'
        | 'missing'
        | 'challenge'
        | 'mismatch'
        | 'invalid';
      retryAfterSeconds?: number;
    };

// A deleted account is removed from User and kept on ArchivedUser until purgeAfter.
// Reset mail is only for a live account. Re-registration is the register flow.
async function retainedDeletion(email: string): Promise<boolean> {
  const archived = await prisma.archivedUser.findUnique({
    where: { email },
    select: { purgeAfter: true },
  });
  return !!archived && archived.purgeAfter > new Date();
}

//DEPRECATED FOR UNATHENTICATED USER
export async function requestForgotPassword(input: ForgotPasswordInput,): Promise<ForgotPasswordResult> {
  if (await retainedDeletion(input.email)) return { ok: false, reason: 'deleted' };

  const user = await prisma.user.findFirst({
    where: { email: input.email },
    select: { id: true, email: true },
  });
  // Same 200 when the email is unknown, so this is not an account oracle.
  if (!user) return { ok: true };

  return sendOTPRequest({
    email: user.email,
    challengeId: RESET_CHALLENGE,
  });
}


export async function completeForgotPassword( input: CompleteForgotPasswordInput,): Promise<ForgotPasswordResult> {
  if (await retainedDeletion(input.email)) return { ok: false, reason: 'deleted' };

  const user = await prisma.user.findFirst({
    where: { email: input.email },
    select: { id: true },
  });
  if (!user) return { ok: false, reason: 'not_found' };

  const otpResult = await verifyOTP({
    email: input.email,
    challengeId: RESET_CHALLENGE,
    otp: input.otp,
  });
  if (!otpResult.ok) return otpResult;

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const { count } = await tx.user.updateMany({
      where: { email: input.email },
      data: { passwordHash },
    });
    // updateMany does not throw P2025; count 0 is the same "no row" outcome.
    if (count !== 1) return { ok: false as const, reason: 'not_found' as const };

    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true as const };
  });
}

//Deployed 
export async function requestResetPassword(userId: string): Promise<ForgotPasswordResult> {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) return { ok: false, reason: 'not_found' };

  return sendOTPRequest({
    email: user.email,
    challengeId: RESET_CHALLENGE,
  });
}

