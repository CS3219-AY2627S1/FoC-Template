// AI Assistance Disclosure:
// Tool: OpenAI Codex, 2026-11-02 (Asia/Singapore).
// Scope: Extracted the existing admin lock and last-admin guard for reuse by
// account deletion. Author review: Author specified the locking and
// last-admin requirements; reviewed, manually tested, and approved.
// See user-service/ai/usage-log.md, entry 025.

import { Prisma } from '@prisma/client';

// Fixed key, so every admin-set change in this database queues on the same lock.
const ADMIN_LOCK_KEY = 32190001;

export const activeAdminWhere = {
  roles: { has: 'ADMINISTRATOR' },
} satisfies Prisma.UserWhereInput;

// Call first in any transaction that changes who is an admin, so those run one
// at a time. Released when the transaction ends.
export async function lockAdminSet(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_LOCK_KEY}::bigint)`;
}

// Call only after lockAdminSet in the same transaction, or the count can be stale.
export async function ensureNotLastAdmin(tx: Prisma.TransactionClient, userId: string) {
  const others = await tx.user.count({ where: { ...activeAdminWhere, NOT: { id: userId } } });
  if (others === 0) return { ok: false as const, reason: 'last_admin' as const };
  return { ok: true as const };
}
