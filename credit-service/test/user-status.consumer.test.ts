import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { handleUserStatusMessage } from '../src/kafka/userStatusHandler.js';
import { creditLog, creditOrder, creditUser, db, seedOrder, seedUser } from './helpers.js';

function userVerified(userId: string, eventId: string = randomUUID()): string {
  return JSON.stringify({
    eventId,
    type: 'UserVerified',
    occurredAt: new Date().toISOString(),
    data: { userId, email: 'student@u.nus.edu' },
  });
}

function userDeleted(userId: string, eventId: string = randomUUID()): string {
  return JSON.stringify({
    eventId,
    type: 'UserDeleted',
    occurredAt: new Date().toISOString(),
    data: { userId },
  });
}

// Silence expected warnings from the skip paths.
const silent = (): void => undefined;

describe('handleUserStatusMessage (UserVerified → onboarding)', () => {
  it('creates a credit_user with balance 20 and an ONBOARDING log', async () => {
    const userId = randomUUID();
    const eventId = randomUUID();

    await handleUserStatusMessage(userVerified(userId, eventId));

    const [user] = await db.select().from(creditUser).where(eq(creditUser.userId, userId));
    expect(user?.balance).toBe(20);

    const [log] = await db.select().from(creditLog).where(eq(creditLog.actorId, userId));
    expect(log?.operationType).toBe('ONBOARDING');
    expect(log?.amount).toBe(20);
    expect(log?.balanceAfter).toBe(20);
    expect(log?.eventId).toBe(eventId);
  });

  it('is idempotent: redelivery does not duplicate the account or the log', async () => {
    const userId = randomUUID();
    const message = userVerified(userId);

    await handleUserStatusMessage(message); // first delivery
    await handleUserStatusMessage(message); // exact redelivery
    await handleUserStatusMessage(userVerified(userId)); // same user, new eventId

    expect(await db.select().from(creditUser).where(eq(creditUser.userId, userId))).toHaveLength(1);
    expect(await db.select().from(creditLog).where(eq(creditLog.actorId, userId))).toHaveLength(1);
  });

  it('persists a null event_id when the envelope omits one', async () => {
    const userId = randomUUID();
    await handleUserStatusMessage(
      JSON.stringify({ type: 'UserVerified', data: { userId } }),
    );

    const [log] = await db.select().from(creditLog).where(eq(creditLog.actorId, userId));
    expect(log?.operationType).toBe('ONBOARDING');
    expect(log?.eventId).toBeNull();
  });

  it('ignores unknown event types without writing rows or throwing', async () => {
    const userId = randomUUID();
    await handleUserStatusMessage(
      JSON.stringify({ eventId: randomUUID(), type: 'UserSuspended', data: { userId } }),
      silent,
    );
    expect(await db.select().from(creditUser)).toHaveLength(0);
  });

  it('skips a non-JSON message without throwing', async () => {
    await handleUserStatusMessage('not json at all', silent);
    expect(await db.select().from(creditUser)).toHaveLength(0);
  });

  it('skips an empty message without throwing', async () => {
    await handleUserStatusMessage(null, silent);
    expect(await db.select().from(creditUser)).toHaveLength(0);
  });

  it('skips JSON that is not an object (e.g. null) without throwing', async () => {
    // `null` parses fine; reading .type off it must not throw, or the consumer
    // would retry the message forever.
    for (const raw of ['null', '42', '"UserVerified"', '[]']) {
      await handleUserStatusMessage(raw, silent);
    }
    expect(await db.select().from(creditUser)).toHaveLength(0);
  });

  it('skips a UserVerified with a missing or malformed userId', async () => {
    await handleUserStatusMessage(
      JSON.stringify({ eventId: randomUUID(), type: 'UserVerified' }),
      silent,
    );
    await handleUserStatusMessage(
      JSON.stringify({ eventId: randomUUID(), type: 'UserVerified', data: {} }),
      silent,
    );
    await handleUserStatusMessage(
      JSON.stringify({ eventId: randomUUID(), type: 'UserVerified', data: { userId: 'nope' } }),
      silent,
    );
    expect(await db.select().from(creditUser)).toHaveLength(0);
  });
});

describe('handleUserStatusMessage (UserDeleted → revocation)', () => {
  const accountOf = async (userId: string) =>
    (await db.select().from(creditUser).where(eq(creditUser.userId, userId)))[0];
  const logsOf = (userId: string) =>
    db.select().from(creditLog).where(eq(creditLog.actorId, userId));

  it('revokes the balance to 0, marks the account deleted and writes a REVOCATION log', async () => {
    const userId = await seedUser(15);
    const eventId = randomUUID();

    await handleUserStatusMessage(userDeleted(userId, eventId));

    const account = await accountOf(userId);
    expect(account?.balance).toBe(0);
    expect(account?.deletedAt).toBeInstanceOf(Date);
    const logs = await logsOf(userId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      operationType: 'REVOCATION',
      amount: 15,
      balanceAfter: 0,
      orderId: null,
      eventId,
    });
  });

  it('is idempotent: a redelivery revokes once', async () => {
    const userId = await seedUser(15);
    const message = userDeleted(userId);

    await handleUserStatusMessage(message);
    const firstDeletedAt = (await accountOf(userId))?.deletedAt;
    await handleUserStatusMessage(message);
    await handleUserStatusMessage(userDeleted(userId)); // new eventId

    expect(await logsOf(userId)).toHaveLength(1);
    expect((await accountOf(userId))?.deletedAt).toEqual(firstDeletedAt);
  });

  it('marks an empty account deleted without a log (amount must be > 0)', async () => {
    const userId = await seedUser(0);

    await handleUserStatusMessage(userDeleted(userId));

    expect((await accountOf(userId))?.deletedAt).toBeInstanceOf(Date);
    expect(await logsOf(userId)).toHaveLength(0);
  });

  it('keeps the open reservations, so their couriers can still be paid', async () => {
    const userId = await seedUser(15);
    const orderId = await seedOrder(userId, 5);

    await handleUserStatusMessage(userDeleted(userId));

    const reservations = await db.select().from(creditOrder).where(eq(creditOrder.orderId, orderId));
    expect(reservations).toHaveLength(1);
  });

  it('skips a user with no credit account (never verified)', async () => {
    const log = vi.fn();
    const userId = randomUUID();

    await handleUserStatusMessage(userDeleted(userId), log);

    expect(await db.select().from(creditUser)).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('has no credit account'));
  });

  it('does not re-grant a revoked account on a late UserVerified', async () => {
    const userId = await seedUser(15);
    await handleUserStatusMessage(userDeleted(userId));

    await handleUserStatusMessage(userVerified(userId));

    expect((await accountOf(userId))?.balance).toBe(0);
    expect((await logsOf(userId)).map((l) => l.operationType)).toEqual(['REVOCATION']);
  });

  it('skips a UserDeleted with a missing or malformed userId', async () => {
    const log = vi.fn();
    await handleUserStatusMessage(JSON.stringify({ type: 'UserDeleted', data: {} }), log);
    await handleUserStatusMessage(
      JSON.stringify({ type: 'UserDeleted', data: { userId: 'nope' } }),
      log,
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('UserDeleted with missing/invalid userId'));
  });
});
