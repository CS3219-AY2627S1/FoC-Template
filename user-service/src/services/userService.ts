// AI Assistance Disclosure:
// Tool: Claude Code (Claude Opus), 2026-09-27 – 2026-10-19; OpenAI Codex,
// 2026-11-02 (Asia/Singapore).
// Scope: AI generated the register logic (duplicate check, P2002 handling,
// bcryptjs hashing), login credential checks, profile/public-profile selects,
// profile update, shared buildNewUser/duplicateField helpers, account
// deletion, user.deleted enqueueing, and archived-account restoration with
// user.restored enqueueing.
// Author review: Author specified the requirements, duplicate handling,
// fields, update rules, deletion workflow, and restore behavior. Entries
// 004, 008, 009, 013, 015, 019, 025, and 026 were reviewed, manually tested,
// and approved. Author also reviewed, manually tested, and approved entry 027.
// See user-service/ai/usage-log.md. OpenAI Codex added the author-specified
// Order Service eligibility client; entry 031 is pending review.

import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { redis } from '../redis';
import type { RegisterInput } from '../api/dto/registerDto';
import type { LoginInput } from '../api/dto/loginDto';
import type { RegisterVerifyInput } from '../api/dto/otpDto';
import type { UpdateProfileInput } from '../api/dto/updateProfileDto';
import { enqueueUserCreated, enqueueUserDeleted, enqueueUserRestored } from '../events/outboxStore';
import { ensureNotLastAdmin, lockAdminSet } from './adminGuards';
import { createOrderClient } from '@foc/grpc';
import { env } from '../env';
import { otpKeyPrefix, sendOTPRequest, verifyOTP } from './otpService';

const SALT_ROUNDS = 10;
const RETENTION_YEARS = 4;
const REGISTER_CHALLENGE = 'register'; //hardcoded, resend keeps three fail lock
const PENDING_TTL_SECONDS = 120;

type PendingRegistration = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
};

function pendingKey(email: string) {
  return `${otpKeyPrefix(REGISTER_CHALLENGE, email)}:pending`;
}

// Profile: everything except secrets — for the user themselves or an admin.
export const profileSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  email: true,
  roles: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

// Public profile: what anyone may see — for other services.
const publicProfileSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

// Shared by initiateRegister and the admin bootstrap so every
// account is built the same way.
export async function buildNewUser(input: RegisterInput) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    username: input.username,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, SALT_ROUNDS),
  };
}

// Which field a unique-constraint violation (Prisma P2002) hit, or null if
// it's not a duplicate email/username.
export function duplicateField(err: unknown): 'email' | 'username' | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return null;
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target.join(',') : String(target ?? '');
  if (fields.includes('email')) return 'email';
  if (fields.includes('username')) return 'username';
  return null;
}

//a check before starting registration process instead of just parsing prisma output
async function findDuplicate(email: string, username: string) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { email: true, username: true },
  });
  if (!existing) return null;
  return existing.email === email ? ('email' as const) : ('username' as const);
}

// HTTP register start: stash the form in Redis and email an OTP. No User row yet.
export async function initiateRegister(input: RegisterInput) {
  const field = await findDuplicate(input.email, input.username); //extra check to make sure user doesn't exist
  if (field) return { ok: false as const, field };

  const archived = await prisma.archivedUser.findUnique({ where: { email: input.email } });
  // Past its 4 years, the row is ignored and deleted at verify: a normal signup.
  const restoreFrom = archived && archived.purgeAfter > new Date() ? archived : null;
  if (restoreFrom && !input.confirmRestore) {
    return { ok: false as const, reason: 'restore_confirmation_required' as const };
  }

  const key = pendingKey(input.email);
  const value = JSON.stringify(await buildNewUser(input)); //standardize
  const ttl = { type: 'EX', value: PENDING_TTL_SECONDS } as const;

  // Store the pending signup before sending, so a delivered code always has one.
  // NX: only the first request for this email claims the slot.
  const claimed = await redis.set(key, value, { condition: 'NX', expiration: ttl });
  if (!claimed) {
    // A signup for this email is already waiting. Only the same person (same
    // password) may resend or edit it. 
    const stored = await redis.get(key);
    const samePerson =
      !!stored &&
      (await bcrypt.compare(input.password, (JSON.parse(stored) as PendingRegistration).passwordHash));
    if (!samePerson) return { ok: false as const, reason: 'signup_in_progress' as const };
    await redis.set(key, value, { expiration: ttl });
  }

  try {
    const otpResult = await sendOTPRequest({
      email: input.email,
      challengeId: REGISTER_CHALLENGE,
    });
    if (!otpResult.ok) {
      // A resend keeps the existing pending signup; a first request cleans up.
      if (claimed) await redis.del(key);
      return otpResult;
    }
  } catch (err) {
    if (claimed) await redis.del(key).catch(() => undefined);
    throw err;
  }
  return { ok: true as const };
}

// HTTP register verify: consume the OTP, load pending info, then create the account.
//skips buildNewUser logic because password hashing happens in initiateRegister
export async function completeRegister(input: RegisterVerifyInput) {
  const otpResult = await verifyOTP({
    email: input.email,
    challengeId: REGISTER_CHALLENGE,
    otp: input.otp,
    pendingKey: pendingKey(input.email),
  });
  if (!otpResult.ok) return otpResult;
  if (!otpResult.pending) return { ok: false as const, reason: 'missing' as const };

  const pending = JSON.parse(otpResult.pending) as PendingRegistration;

  const field = await findDuplicate(pending.email, pending.username);
  if (field) return { ok: false as const, field };

  const archived = await prisma.archivedUser.findUnique({ where: { email: pending.email } });
  const now = new Date();
  const restoreFrom = archived && archived.purgeAfter > now ? archived : null;

  try {
    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.user.create({
        data: {
          firstName: pending.firstName,
          lastName: pending.lastName,
          username: pending.username,
          email: pending.email,
          passwordHash: pending.passwordHash,
        },
        select: profileSelect,
      });
      if (restoreFrom) {
        await enqueueUserRestored(tx, created.id, restoreFrom.userId);
        await tx.archivedUser.delete({ where: { email: restoreFrom.email } });
      } else {
        await tx.archivedUser.deleteMany({ where: { email: input.email, purgeAfter: { lte: now } } });
        await enqueueUserCreated(tx, created.id);
      }
      return created;
    });
    return { ok: true as const, user };
  } catch (err) {
    const taken = duplicateField(err);
    if (taken) return { ok: false as const, field: taken };
    throw err;
  }
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, passwordHash: true, roles: true },
  });

  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    return { ok: false as const };
  }

  return { ok: true as const, userId: user.id, roles: user.roles };
}

export async function getProfile(id: string) {
  return prisma.user.findUnique({ 
    where: { id }, 
    select: profileSelect });
}

export async function getPublicProfile(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: publicProfileSelect,
  });
}

export async function updateProfile(id: string, input: UpdateProfileInput) {
  if (input.username) {
    const taken = await prisma.user.findFirst({
      where: { username: input.username, NOT: { id } },
      select: { id: true },
    });
    if (taken) return { ok: false as const, reason: 'username_taken' as const };
  }

  try {
    const user = await prisma.user.update({ where: { id }, data: input, select: profileSelect });
    return { ok: true as const, user };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return { ok: false as const, reason: 'username_taken' as const };
      if (err.code === 'P2025') return { ok: false as const, reason: 'not_found' as const };
    }
    throw err;
  }
}

export async function listProfiles() {
  return prisma.user.findMany({ select: profileSelect });
}

const orderClient = createOrderClient(env.ORDER_GRPC_ADDR);

export async function checkDeletionEligibility(userId: string) {
  try {
    const result = await orderClient.checkDeletionEligibility({ userId });
    return { ok: true as const, eligible: result.eligible, activeOrders: result.blockedOrderCount };
  } catch (err) {
    // Can't confirm there are no active orders, so don't delete.
    console.error('Order eligibility check failed:', err instanceof Error ? err.message : String(err));
    return { ok: false as const };
  }
}

function addRetentionYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

export async function deleteAccount(userId: string) {
  const eligibility = await checkDeletionEligibility(userId);
  if (!eligibility.ok) return { ok: false as const, reason: 'eligibility_unavailable' as const };
  if (!eligibility.eligible) {
    return { ok: false as const, reason: 'active_orders' as const, activeOrders: eligibility.activeOrders };
  }

  return prisma.$transaction(async (tx) => {
    await lockAdminSet(tx);

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, roles: true },
    });
    if (!user) return { ok: false as const, reason: 'not_found' as const };

    // The guard only counts other admins, so it must not run for a non-admin.
    if (user.roles.includes('ADMINISTRATOR')) {
      const guard = await ensureNotLastAdmin(tx, user.id);
      if (!guard.ok) return guard;
    }

    const deletedAt = new Date();
    const purgeAfter = addRetentionYears(deletedAt, RETENTION_YEARS);

    await tx.archivedUser.create({ data: { email: user.email, userId: user.id, deletedAt, purgeAfter } });
    await tx.user.delete({ where: { id: user.id } });
    await enqueueUserDeleted(tx, user.id, deletedAt);

    return { ok: true as const, deletedAt, purgeAfter };
  });
}
