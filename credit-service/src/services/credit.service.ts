/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-08
 * Scope: Credit Service source code, drafted and edited with Claude Code.
 * Reviewed by Don Lee
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, type Database } from '../database/index.js';
import { creditLog, creditOrder, creditUser } from '../database/schema.js';
import {
  InsufficientCreditsError,
  InvalidAmountError,
  OrderAlreadyReservedError,
  OrderNotFoundError,
  UserNotFoundError,
} from '../errors.js';
import type {
  BalanceResponse,
  ReleaseResponse,
  ReserveBody,
  ReserveResponse,
} from '../schemas/credit.js';

export async function getBalance(userId: string): Promise<BalanceResponse> {
  const [row] = await db
    .select({ balance: creditUser.balance })
    .from(creditUser)
    .where(and(eq(creditUser.userId, userId), isNull(creditUser.deletedAt)));

  if (!row) throw new UserNotFoundError(userId);
  return { userId, balance: row.balance };
}

export async function reserveCredits(input: ReserveBody): Promise<ReserveResponse> {
  const { orderId, requesterId, amount } = input;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new InvalidAmountError(amount);
  }

  return db.transaction(async (tx) => {
    // Lock the requester's row so concurrent reserves cannot double-spend.
    const [user] = await tx
      .select({ balance: creditUser.balance, deletedAt: creditUser.deletedAt })
      .from(creditUser)
      .where(eq(creditUser.userId, requesterId))
      .for('update');

    if (!user || user.deletedAt) throw new UserNotFoundError(requesterId);
    if (user.balance < amount) {
      throw new InsufficientCreditsError(amount, user.balance);
    }

    // A PK conflict means this order already holds a reservation.
    const reserved = await tx
      .insert(creditOrder)
      .values({ orderId, requesterId, reservedCredits: amount })
      .onConflictDoNothing()
      .returning({ orderId: creditOrder.orderId });

    if (reserved.length === 0) throw new OrderAlreadyReservedError(orderId);

    const newBalance = user.balance - amount;
    await tx
      .update(creditUser)
      .set({ balance: newBalance, updatedAt: sql`now()` })
      .where(eq(creditUser.userId, requesterId));

    await tx.insert(creditLog).values({
      operationType: 'RESERVATION',
      amount,
      actorId: requesterId,
      orderId,
      balanceAfter: newBalance,
    });

    return { orderId, requesterId, reserved: amount, balance: newBalance };
  });
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

// How an order event settled: paid out, nothing to settle (a redelivery), or
// settled without paying because the recipient's account was revoked.
export type Settlement = 'settled' | 'not-reserved' | 'forfeited';

type Refund =
  | ({ kind: 'refunded' } & Omit<ReleaseResponse, 'orderId'>)
  | { kind: 'forfeited'; requesterId: string };

// The requester-side refunds: the HTTP return (F5.2) and the cancel / expiry
// events (F4.2). Delete-once, per docs/schema.md: the reservation is deleted
// first and the requester credited only if it existed. Returns null when the
// order has no active reservation. A revoked requester's refund is forfeited:
// the reservation is gone and nothing is credited or logged.
async function refundRequester(
  tx: Transaction,
  orderId: string,
  operationType: 'RETURN' | 'CANCELLATION' | 'EXPIRY',
  eventId: string | null,
): Promise<Refund | null> {
  const [order] = await tx
    .delete(creditOrder)
    .where(eq(creditOrder.orderId, orderId))
    .returning({
      requesterId: creditOrder.requesterId,
      reservedCredits: creditOrder.reservedCredits,
    });

  if (!order) return null;

  const [updated] = await tx
    .update(creditUser)
    .set({
      balance: sql`${creditUser.balance} + ${order.reservedCredits}`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(creditUser.userId, order.requesterId), isNull(creditUser.deletedAt)))
    .returning({ balance: creditUser.balance });

  // The FK guarantees the row exists, so no update means it is revoked.
  if (!updated) return { kind: 'forfeited', requesterId: order.requesterId };

  await tx.insert(creditLog).values({
    operationType,
    amount: order.reservedCredits,
    actorId: order.requesterId,
    orderId,
    balanceAfter: updated.balance,
    eventId,
  });

  return {
    kind: 'refunded',
    requesterId: order.requesterId,
    refunded: order.reservedCredits,
    balance: updated.balance,
  };
}

export async function releaseCredits(orderId: string): Promise<ReleaseResponse> {
  return db.transaction(async (tx) => {
    // Deleting the reservation also validates that it exists (F5.1.1).
    const refund = await refundRequester(tx, orderId, 'RETURN', null);
    if (!refund) throw new OrderNotFoundError(orderId);
    // A revoked user can't act; roll back and keep the reservation.
    if (refund.kind === 'forfeited') throw new UserNotFoundError(refund.requesterId);
    const { requesterId, refunded, balance } = refund;
    return { orderId, requesterId, refunded, balance };
  });
}

// F2 onboarding: create a credit account (starting balance 20) for a verified
// user, exactly once. Driven by the foc.user.status `UserVerified` event (see
// src/kafka/). Structurally idempotent — the credit_user PK + ON CONFLICT DO
// NOTHING makes a redelivered event a no-op, even under concurrent delivery.
export async function onboardUser(userId: string, eventId: string | null = null): Promise<void> {
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(creditUser)
      .values({ userId })
      .onConflictDoNothing()
      .returning({ userId: creditUser.userId });

    // Already onboarded (or a redelivered event): nothing to do, no second log.
    if (!created) return;

    await tx.insert(creditLog).values({
      operationType: 'ONBOARDING',
      amount: 20, // the starting grant; balance defaults to 20 in the schema
      actorId: userId,
      balanceAfter: 20,
      eventId, // traceability back to the source event
    });
  });
}

// Account deletion: the User Service's foc.user.status `UserDeleted` (sent once
// the deletion period ends). Revokes the balance to 0 and marks the account
// deleted, once; the row stays for the FKs, the audit log and late events. Its
// open reservations stay too, so a courier finishing one is still paid.
// Re-signing up gives a new user id, so a new account and a new grant.
export async function revokeUser(
  userId: string,
  eventId: string | null = null,
): Promise<'revoked' | 'already-revoked' | 'unknown'> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ balance: creditUser.balance, deletedAt: creditUser.deletedAt })
      .from(creditUser)
      .where(eq(creditUser.userId, userId))
      .for('update');

    if (!user) return 'unknown'; // never onboarded (never verified)
    if (user.deletedAt) return 'already-revoked'; // a redelivery

    await tx
      .update(creditUser)
      .set({ balance: 0, deletedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(creditUser.userId, userId));

    // credit_log.amount must be > 0: an empty account has nothing to log.
    if (user.balance > 0) {
      await tx.insert(creditLog).values({
        operationType: 'REVOCATION',
        amount: user.balance,
        actorId: userId,
        balanceAfter: 0,
        eventId,
      });
    }
    return 'revoked';
  });
}

// F4 order events, driven by the order service's foc.credit.commands (see
// src/kafka/). Each returns 'settled', 'not-reserved' if the order had no
// reservation (already settled, so a redelivered command is a no-op), or
// 'forfeited' if the recipient's account was revoked.

// F4.3 completion: pay the order's reserved credits to its courier. The courier
// must already have a credit account (created at onboarding): if not, this
// throws, and the transaction rolls back with the reservation intact for a
// retry. An account is never created here. A revoked courier's payout is
// forfeited: the reservation is settled and nothing is credited.
// TODO: add retry + DLQ
export async function completeOrder(
  orderId: string,
  courierId: string,
  eventId: string | null = null,
): Promise<Settlement> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .delete(creditOrder)
      .where(eq(creditOrder.orderId, orderId))
      .returning({ reservedCredits: creditOrder.reservedCredits });

    if (!order) return 'not-reserved';

    const [courier] = await tx
      .update(creditUser)
      .set({
        balance: sql`${creditUser.balance} + ${order.reservedCredits}`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(creditUser.userId, courierId), isNull(creditUser.deletedAt)))
      .returning({ balance: creditUser.balance });

    if (!courier) {
      const [revoked] = await tx
        .select({ userId: creditUser.userId })
        .from(creditUser)
        .where(eq(creditUser.userId, courierId));
      if (revoked) return 'forfeited';
      throw new UserNotFoundError(courierId);
    }

    await tx.insert(creditLog).values({
      operationType: 'COMPLETION',
      amount: order.reservedCredits,
      actorId: courierId,
      orderId,
      balanceAfter: courier.balance,
      eventId,
    });
    return 'settled';
  });
}

// F4.2 cancellation / expiry: refund the order's reserved credits to its requester.
export async function cancelOrder(
  orderId: string,
  operationType: 'CANCELLATION' | 'EXPIRY',
  eventId: string | null = null,
): Promise<Settlement> {
  return db.transaction(async (tx) => {
    const refund = await refundRequester(tx, orderId, operationType, eventId);
    if (!refund) return 'not-reserved';
    return refund.kind === 'forfeited' ? 'forfeited' : 'settled';
  });
}
