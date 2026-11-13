import { randomUUID } from 'node:crypto';
import { CREDIT_USER_QUEUE, type UserCreated } from '@foc/messaging';
import { prisma } from '../db';
import { enqueueUserCreated } from './outboxStore';

export { CREDIT_USER_QUEUE };
export type { UserCreated };

export function buildUserCreated(userId: string): UserCreated {
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('userId must be a non-empty string');
  }

  return {
    type: 'user.created',
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    userId,
  };
}

async function publishFromCli(): Promise<void> {
  const userIds = process.argv.slice(2);
  if (userIds.length === 0) throw new Error('Pass at least one user id');

  try {
    await prisma.$transaction(async (tx) => {
      for (const userId of userIds) {
        await enqueueUserCreated(tx, userId);
      }
    });
    for (const userId of userIds) console.log('queued', userId);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  publishFromCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
