// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - tests for F19.1.1, F19.2.1, F19.2.2, F19.2.3 and the
//    F20.1.1 log entry written alongside each balance change.
//    Requires a running credit-db; see credit-service/README.md.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Wee Jean

import { afterAll, describe, expect, it } from 'vitest';
import { AppError } from '../../src/utils/AppError.js';
import { INITIAL_ALLOCATION_CREDITS } from '../../src/domain/constants.js';
import { allocateInitialCredits, reserveCredits } from '../../src/services/credits.service.js';
import {
  closePool,
  countTransactions,
  newRequestId,
  newUserId,
  readBalance,
} from '../helpers/db.js';

// No cleanup: the suite connects as the least-privilege role, which has no DELETE
// (NFR8.2.3). globalSetup rebuilds the database for each run instead.
const trackUser = (): string => newUserId();

afterAll(async () => {
  await closePool();
});

describe('F19.1.1 — initial allocation', () => {
  it('grants 20 credits and logs the allocation in the same transaction', async () => {
    const userId = trackUser();

    const { balance, transaction } = await allocateInitialCredits(userId);

    expect(balance.totalBalance).toBe(INITIAL_ALLOCATION_CREDITS);
    expect(balance.reservedBalance).toBe(0);
    expect(balance.unreservedBalance).toBe(INITIAL_ALLOCATION_CREDITS);

    // F20.1.1 fields, with the team's 2026-09-26 decision on the allocation's parties.
    expect(transaction.transaction_type).toBe('allocation');
    expect(transaction.originating_user_id).toBeNull();
    expect(transaction.destination_user_id).toBe(userId);
    expect(transaction.amount).toBe(INITIAL_ALLOCATION_CREDITS);
    expect(transaction.request_id).toBeNull();
    expect(transaction.transaction_id).toEqual(expect.any(String));
    expect(transaction.created_at).toBeInstanceOf(Date);
  });

  it('rejects a second allocation without granting credits or writing a log row', async () => {
    const userId = trackUser();
    await allocateInitialCredits(userId);

    await expect(allocateInitialCredits(userId)).rejects.toMatchObject({
      code: 'ALREADY_ALLOCATED',
    });

    expect(await readBalance(userId)).toEqual({ total: 20, reserved: 0 });
    expect(await countTransactions(userId)).toBe(1);
  });
});

describe('F19.2 — reservation', () => {
  it('moves credits into reserved and logs the reservation (F19.2.1)', async () => {
    const userId = trackUser();
    await allocateInitialCredits(userId);

    const { balance, transaction } = await reserveCredits(userId, newRequestId(), 5);

    expect(balance.totalBalance).toBe(20);
    expect(balance.reservedBalance).toBe(5);
    expect(balance.unreservedBalance).toBe(15);

    expect(transaction.transaction_type).toBe('reservation');
    expect(transaction.originating_user_id).toBe(userId);
    expect(transaction.destination_user_id).toBeNull();
    expect(transaction.amount).toBe(5);
    expect(transaction.request_id).toEqual(expect.any(String));
  });

  it('counts only unreserved credits as spendable (F19.2.2)', async () => {
    const userId = trackUser();
    await allocateInitialCredits(userId);
    await reserveCredits(userId, newRequestId(), 15);

    // 20 total, 15 already reserved. A 6-credit offer exceeds the 5 unreserved even
    // though the total balance would cover it.
    await expect(reserveCredits(userId, newRequestId(), 6)).rejects.toMatchObject({
      code: 'INSUFFICIENT_UNRESERVED_CREDITS',
    });

    expect(await readBalance(userId)).toEqual({ total: 20, reserved: 15 });
  });

  it('rejects an offer above the unreserved balance and logs nothing (F19.2.3)', async () => {
    const userId = trackUser();
    await allocateInitialCredits(userId);

    await expect(reserveCredits(userId, newRequestId(), 21)).rejects.toBeInstanceOf(AppError);

    expect(await readBalance(userId)).toEqual({ total: 20, reserved: 0 });
    expect(await countTransactions(userId)).toBe(1); // the allocation only
  });

  it('rejects a reservation for a user with no balance', async () => {
    await expect(reserveCredits(newUserId(), newRequestId(), 1)).rejects.toMatchObject({
      code: 'BALANCE_NOT_FOUND',
    });
  });

  it('rolls the reservation back when the same request is reserved twice', async () => {
    const userId = trackUser();
    await allocateInitialCredits(userId);
    const requestId = newRequestId();

    await reserveCredits(userId, requestId, 4);
    await expect(reserveCredits(userId, requestId, 4)).rejects.toMatchObject({
      code: 'RESERVATION_ALREADY_EXISTS',
    });

    // The duplicate must not have reserved a second 4 credits.
    expect(await readBalance(userId)).toEqual({ total: 20, reserved: 4 });
    expect(await countTransactions(userId)).toBe(2); // allocation + one reservation
  });
});
