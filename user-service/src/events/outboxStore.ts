import { Prisma } from '@prisma/client';
import { CREDIT_USER_QUEUE } from '@foc/messaging';
import { prisma } from '../db';
import { buildUserCreated } from './userCreated';

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
