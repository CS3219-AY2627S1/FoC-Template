/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #4 - outbox writes inside a caller's transaction and the relay's
 *        read/delete, mirroring supplier-service's outboxWriter.ts and
 *        mysqlOutboxRepository.ts (outbox + relay decided by George, 2026-10-19).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from './prisma.js';
import type { OutboxTask } from '../queue/tasks.js';

export interface OutboxRow {
  id: bigint;
  taskName: string;
  payload: unknown;
  version: number;
}

/**
 * Inserts one outbox row per task, stamped with the order version this transaction
 * writes. Must be called with the transaction client so the rows commit (or roll
 * back) together with the order change.
 */
export async function insertOutboxRows(
  tx: Prisma.TransactionClient,
  version: number,
  tasks: OutboxTask[],
): Promise<void> {
  if (tasks.length === 0) return;
  await tx.outbox.createMany({
    data: tasks.map((task) => ({
      taskName: task.taskName,
      payload: task.payload as Prisma.InputJsonValue,
      version,
    })),
  });
}

export interface OutboxRepository {
  /** Up to `limit` rows, lowest order version first, then lowest id. */
  fetchBatch(limit: number): Promise<OutboxRow[]>;
  delete(id: bigint): Promise<void>;
}

export function createOutboxRepository(prisma: PrismaClient): OutboxRepository {
  return {
    async fetchBatch(limit) {
      return prisma.outbox.findMany({
        orderBy: [{ version: 'asc' }, { id: 'asc' }],
        take: limit,
      });
    },
    async delete(id) {
      // deleteMany: a row already removed by a previous tick is not an error.
      await prisma.outbox.deleteMany({ where: { id } });
    },
  };
}
