// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-16
//  2026-10-16: Week 7/8 catch-up - tests for F19.3.1, F19.3.2 and F19.4.1.
//    Requires a running credit-db; see credit-service/README.md.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { afterAll, describe, expect, it } from 'vitest';
import { releaseCredits, transferCredits } from '../../src/services/credits.service.js';
import {
  closePool,
  countTransactionsForRequest,
  givenFundedUser,
  givenReservation,
  newRequestId,
  newUserId,
  readBalance,
} from '../helpers/db.js';

afterAll(async () => {
  await closePool();
});

describe('F19.3.1 — credit transfer', () => {
  it('moves the reserved credits from requester to courier', async () => {
    const { requesterId, requestId } = await givenReservation(5);
    const courierId = await givenFundedUser();

    const { transaction } = await transferCredits(requestId, courierId);

    // context §5: requester total and reserved both fall; courier total rises.
    expect(await readBalance(requesterId)).toEqual({ total: 15, reserved: 0 });
    expect(await readBalance(courierId)).toEqual({ total: 25, reserved: 0 });

    expect(transaction.transaction_type).toBe('transfer');
    expect(transaction.originating_user_id).toBe(requesterId);
    expect(transaction.destination_user_id).toBe(courierId);
    expect(transaction.amount).toBe(5);
    expect(transaction.request_id).toBe(requestId);
  });

  it('transfers exactly what was reserved, not what the caller claims', async () => {
    // The amount is never taken from the request body — it is read back from the
    // reservation row, so there is no way to over-transfer.
    const { requesterId, requestId } = await givenReservation(3);
    const courierId = await givenFundedUser();

    await transferCredits(requestId, courierId);

    expect(await readBalance(requesterId)).toEqual({ total: 17, reserved: 0 });
    expect(await readBalance(courierId)).toEqual({ total: 23, reserved: 0 });
  });

  it('rejects a request that was never reserved', async () => {
    const courierId = await givenFundedUser();
    await expect(transferCredits(newRequestId(), courierId)).rejects.toMatchObject({
      code: 'RESERVATION_NOT_FOUND',
      status: 404,
    });
  });

  it('rejects an unknown courier without creating a balance for them', async () => {
    const { requesterId, requestId } = await givenReservation(4);
    const unknownCourier = newUserId();

    await expect(transferCredits(requestId, unknownCourier)).rejects.toMatchObject({
      code: 'COURIER_NOT_FOUND',
      status: 404,
    });

    // Credits may only enter the economy via F19.1.1 (team decision 2026-10-16).
    expect(await readBalance(unknownCourier)).toBeNull();
    // And the requester is untouched.
    expect(await readBalance(requesterId)).toEqual({ total: 20, reserved: 4 });
  });
});

describe('F19.3.2 — at most one transfer per request', () => {
  it('rejects a second transfer and leaves the balances alone', async () => {
    const { requesterId, requestId } = await givenReservation(6);
    const courierId = await givenFundedUser();

    await transferCredits(requestId, courierId);
    await expect(transferCredits(requestId, courierId)).rejects.toMatchObject({
      code: 'ALREADY_TRANSFERRED',
      status: 409,
    });

    expect(await readBalance(requesterId)).toEqual({ total: 14, reserved: 0 });
    expect(await readBalance(courierId)).toEqual({ total: 26, reserved: 0 });
    // reservation + one transfer
    expect(await countTransactionsForRequest(requestId)).toBe(2);
  });

  it('settles concurrent transfers for one request to exactly one winner', async () => {
    const { requesterId, requestId } = await givenReservation(5);
    const courierId = await givenFundedUser();

    const results = await Promise.allSettled([
      transferCredits(requestId, courierId),
      transferCredits(requestId, courierId),
      transferCredits(requestId, courierId),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    // The losers must lose to F19.3.2's unique index, reported as ALREADY_TRANSFERRED.
    // Asserting the reason and not just the count matters: without the index the
    // balances_reserved_non_negative CHECK also stops the duplicates, so a
    // count-only assertion would still pass with F19.3.2 removed entirely.
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected).toHaveLength(2);
    for (const r of rejected) {
      expect(r.reason).toMatchObject({ code: 'ALREADY_TRANSFERRED', status: 409 });
    }

    expect(await readBalance(requesterId)).toEqual({ total: 15, reserved: 0 });
    expect(await readBalance(courierId)).toEqual({ total: 25, reserved: 0 });
    expect(await countTransactionsForRequest(requestId)).toBe(2);
  });
});

describe('F19.4.1 — credit release', () => {
  it('returns reserved credits without changing the total', async () => {
    const { requesterId, requestId } = await givenReservation(7);

    const { transaction } = await releaseCredits(requestId);

    // context §5: reserved falls, total untouched.
    expect(await readBalance(requesterId)).toEqual({ total: 20, reserved: 0 });

    expect(transaction.transaction_type).toBe('release');
    expect(transaction.originating_user_id).toBe(requesterId);
    expect(transaction.destination_user_id).toBeNull();
    expect(transaction.amount).toBe(7);
    expect(transaction.request_id).toBe(requestId);
  });

  it('frees the credits for another request', async () => {
    const { requesterId, requestId } = await givenReservation(20);
    await releaseCredits(requestId);

    // All 20 are unreserved again, so a fresh reservation of the full balance works.
    const { reserveCredits } = await import('../../src/services/credits.service.js');
    await reserveCredits(requesterId, newRequestId(), 20);

    expect(await readBalance(requesterId)).toEqual({ total: 20, reserved: 20 });
  });

  it('rejects a request that was never reserved', async () => {
    await expect(releaseCredits(newRequestId())).rejects.toMatchObject({
      code: 'RESERVATION_NOT_FOUND',
      status: 404,
    });
  });

  it('is idempotent on requestId', async () => {
    const { requesterId, requestId } = await givenReservation(4);

    await releaseCredits(requestId);
    await expect(releaseCredits(requestId)).rejects.toMatchObject({
      code: 'ALREADY_RELEASED',
      status: 409,
    });

    expect(await readBalance(requesterId)).toEqual({ total: 20, reserved: 0 });
    expect(await countTransactionsForRequest(requestId)).toBe(2);
  });
});

describe('transfer and release are mutually exclusive', () => {
  it('refuses to transfer credits that were already released', async () => {
    const { requesterId, requestId } = await givenReservation(4);
    const courierId = await givenFundedUser();
    await releaseCredits(requestId);

    await expect(transferCredits(requestId, courierId)).rejects.toMatchObject({
      code: 'ALREADY_RELEASED',
    });

    expect(await readBalance(requesterId)).toEqual({ total: 20, reserved: 0 });
    expect(await readBalance(courierId)).toEqual({ total: 20, reserved: 0 });
  });

  it('refuses to release credits that were already transferred', async () => {
    const { requesterId, requestId } = await givenReservation(4);
    const courierId = await givenFundedUser();
    await transferCredits(requestId, courierId);

    await expect(releaseCredits(requestId)).rejects.toMatchObject({
      code: 'ALREADY_TRANSFERRED',
    });

    expect(await readBalance(requesterId)).toEqual({ total: 16, reserved: 0 });
    expect(await readBalance(courierId)).toEqual({ total: 24, reserved: 0 });
  });
});
