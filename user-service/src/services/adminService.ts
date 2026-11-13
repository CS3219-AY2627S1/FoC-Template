// AI Assistance Disclosure:
// Tool: Claude Code (Claude Opus), 2026-10-19; OpenAI Codex,
// 2026-11-02 (Asia/Singapore).
// Scope: AI generated bootstrapAdmin (advisory lock, single transaction, audit
// record), grantAdmin, revokeAdmin and ensureNotLastAdmin, then extracted the
// advisory-lock guard for account deletion.
// Author review: Author specified the bootstrap, role-management, locking,
// and last-admin requirements; reviewed, manually tested, and approved. See
// user-service/ai/usage-log.md, entries 019, 020, and 025.

import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { RegisterInput } from '../api/dto/registerDto';
import { buildNewUser, duplicateField, profileSelect } from './userService';
import { enqueueUserCreated } from '../events/outboxStore';
import { activeAdminWhere, ensureNotLastAdmin, lockAdminSet } from './adminGuards';

export { activeAdminWhere, ensureNotLastAdmin, lockAdminSet } from './adminGuards';

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
    where: { id: targetId },
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
