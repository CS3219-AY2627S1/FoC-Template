// AI Assistance Disclosure:
// Tool: OpenAI Codex, 2026-11-02 (Asia/Singapore).
// Scope: Added the author-specified user.deleted and user.restored outbox
// enqueue helpers, following the existing user.created pattern.
// Author review: Author specified the event flow; entry 026 was reviewed,
// manually tested, and approved. Credit owner also added flow to send user.deleted to Credit Service.
// Author reviewed, manually tested, and approved entry 027. See
// user-service/ai/usage-log.md.

import { Prisma } from '@prisma/client';
import { CREDIT_USER_QUEUE, QUEUES } from '@foc/messaging';
import { prisma } from '../db';
import { buildUserCreated } from './userCreated';
import { buildUserDeleted } from './userDeleted';
import { buildUserRestored } from './userRestored';

export type OutboxClient = Prisma.TransactionClient | typeof prisma;

export type UnpublishedOutboxRow = {
  eventId: string;
  queue: string;
  body: string;
};

export class OutboxStore {
  constructor(private readonly db: OutboxClient = prisma) {}

  async findUnpublished(limit: number): Promise<UnpublishedOutboxRow[]> {
    return this.db.userOutbox.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { eventId: true, queue: true, body: true },
    });
  }

  async markPublished(eventId: string): Promise<void> {
    // Rows flagged deleteOnPublish are removed instead of kept as history.
    const { count } = await this.db.userOutbox.deleteMany({ where: { eventId, deleteOnPublish: true } });
    if (count === 1) return;
    await this.db.userOutbox.update({
      where: { eventId },
      data: { publishedAt: new Date() },
    });
  }

  async recordFailure(eventId: string, message: string): Promise<void> {
    await this.db.userOutbox.update({
      where: { eventId },
      data: {
        attempts: { increment: 1 },
        lastError: message,
      },
    });
  }
}

export async function enqueueUserCreated(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const event = buildUserCreated(userId);
  await tx.userOutbox.create({
    data: {
      eventId: event.eventId,
      queue: CREDIT_USER_QUEUE,
      body: JSON.stringify(event),
    },
  });
}

// Order: it scrubs personal details. Credit freezes the account until restore.
export async function enqueueUserDeleted(
  tx: Prisma.TransactionClient,
  userId: string,
  deletedAt: Date,
): Promise<void> {
  for (const queue of [QUEUES.orderUser, CREDIT_USER_QUEUE]) {
    const event = buildUserDeleted(userId, deletedAt);
    await tx.userOutbox.create({
      data: {
        eventId: event.eventId,
        queue: queue,
        body: JSON.stringify(event),
      },
    });
  }
}

// Credit only: it moves the old balance to the new id. Order keeps old records unlinked.
export async function enqueueUserRestored(
  tx: Prisma.TransactionClient,
  userId: string,
  previousUserId: string,
): Promise<void> {
  const event = buildUserRestored(userId, previousUserId);
  await tx.userOutbox.create({
    data: {
      eventId: event.eventId,
      queue: CREDIT_USER_QUEUE,
      body: JSON.stringify(event),
      // The body links the old and new ids, so don't keep it once delivered.
      deleteOnPublish: true,
    },
  });
}
