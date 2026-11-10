/**
 * AI Assistance Disclosure
 * Tool: OpenAI Codex (GPT-5.6 Luna, GPT-5.6 Sol, GPT-6 Sol and GPT-6.1 Sol), 2026-09-25 to 2026-11-11.
 * Scope: Implementation and test assistance under author-finalized User Service requirements and architecture.
 * Author review: Josh Wang Kai Kiat validated correctness, edited where needed, and verified behavior/tests.
 */

import type { Prisma } from "@prisma/client";

export function otherAvailableAdmins(excludedUserId: string): Prisma.UserWhereInput {
  return { id: { not: excludedUserId }, role: "ADMIN", accessStatus: "ACTIVE", lockedAt: null,
    emailVerifiedAt: { not: null }, telegramVerifiedAt: { not: null },
    deletionRequestedAt: null, scheduledDeletionAt: null };
}

export async function lockAdminRoleChanges(transaction: Prisma.TransactionClient): Promise<void> {
  // All admin-role mutations and last-admin lifecycle checks must use this lock.
  // Preserve the key already used by deletion workers in older deployments.
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(3219, 15)`;
}
