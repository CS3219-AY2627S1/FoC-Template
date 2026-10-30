import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { RegisterInput } from '../api/dto/registerDto';
import { buildNewUser, duplicateField, profileSelect } from './userService';
import { enqueueUserCreated } from '../events/outboxStore';

// App-wide key for the admin lock.
const ADMIN_LOCK_KEY = 32190001;

export const activeAdminWhere = {
  roles: { has: 'ADMINISTRATOR' },
  isDeleted: false,
} satisfies Prisma.UserWhereInput;

// Call first in any transaction that changes who is an admin, so those run one
// at a time. Released when the transaction ends.
async function lockAdminSet(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_LOCK_KEY}::bigint)`;
}

export async function isInitialized() {
  return (await prisma.systemBootstrap.findUnique({ where: { id: 1 } })) !== null;
}

// Runs at most once per database
export async function bootstrapAdmin(input: RegisterInput) {
  // Hash before taking the lock — bcrypt is slow and needs no lock.
  const data = await buildNewUser(input);

  try {
    return await prisma.$transaction(async (tx) => {
      await lockAdminSet(tx);

      if (await tx.systemBootstrap.findUnique({ where: { id: 1 } })) {
        return { ok: false as const, reason: 'already_initialized' as const };
      }

      const user = await tx.user.create({
        data: { ...data, roles: ['USER', 'ADMINISTRATOR'] },
        select: profileSelect,
      });
      await enqueueUserCreated(tx, user.id);
      await tx.systemBootstrap.create({ data: { adminUserId: user.id } });
      await tx.adminRoleChange.create({
        data: { actorId: null, targetId: user.id, action: 'GRANT' },
      });
      return { ok: true as const, user };
    });
  } catch (err) {
    const field = duplicateField(err);
    if (field) return { ok: false as const, reason: `${field}_taken` as const };
    throw err;
  }
}

// Re-checks the caller in the DB: their token's roles can be up to 15m stale.
async function checkActorAndTarget(tx: Prisma.TransactionClient, actorId: string, targetId: string) {
  const actor = await tx.user.findFirst({
    where: { id: actorId, ...activeAdminWhere },
    select: { id: true },
  });
  if (!actor) return { ok: false as const, reason: 'forbidden' as const };

  const target = await tx.user.findFirst({
    where: { id: targetId, isDeleted: false },
    select: profileSelect,
  });
  if (!target) return { ok: false as const, reason: 'not_found' as const };

  return { ok: true as const, target };
}

export async function grantAdmin(actorId: string, targetId: string) {
  return prisma.$transaction(async (tx) => {
    await lockAdminSet(tx);

    const check = await checkActorAndTarget(tx, actorId, targetId);
    if (!check.ok) return check;
    if (check.target.roles.includes('ADMINISTRATOR')) {
      return { ok: true as const, user: check.target };
    }

    const user = await tx.user.update({
      where: { id: targetId },
      data: { roles: { push: 'ADMINISTRATOR' } },
      select: profileSelect,
    });
    await tx.adminRoleChange.create({ data: { actorId, targetId, action: 'GRANT' } });
    return { ok: true as const, user };
  });
}

// Call only after lockAdminSet in the same transaction, or the count can be stale.
export async function ensureNotLastAdmin(tx: Prisma.TransactionClient, userId: string) {
  const others = await tx.user.count({ where: { ...activeAdminWhere, NOT: { id: userId } } });
  if (others === 0) return { ok: false as const, reason: 'last_admin' as const };
  return { ok: true as const };
}

export async function revokeAdmin(actorId: string, targetId: string) {
  return prisma.$transaction(async (tx) => {
    await lockAdminSet(tx);

    const check = await checkActorAndTarget(tx, actorId, targetId);
    if (!check.ok) return check;
    if (!check.target.roles.includes('ADMINISTRATOR')) {
      return { ok: true as const, user: check.target };
    }

    const guard = await ensureNotLastAdmin(tx, targetId);
    if (!guard.ok) return guard;

    const user = await tx.user.update({
      where: { id: targetId },
      data: { roles: check.target.roles.filter((role) => role !== 'ADMINISTRATOR') },
      select: profileSelect,
    });
    await tx.adminRoleChange.create({ data: { actorId, targetId, action: 'REVOKE' } });
    return { ok: true as const, user };
  });
}
