// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-16
//  2026-10-16: Week 7/8 catch-up - asserts the database constraints directly.
//    context §4 requires F19.3.2 to be enforced by the database rather than by
//    check-then-write application logic. The service-level tests cannot prove that:
//    the application guard wins the race in practice, so removing the index leaves
//    them green. These tests exercise the constraint itself.
//    Requires a running credit-db; see credit-service/README.md.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { afterAll, describe, expect, it } from 'vitest';
import pool from '../../src/db/pool.js';
import { closePool, givenFundedUser, givenReservation, newRequestId, newUserId } from '../helpers/db.js';

const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';

/** Inserts a log row directly, bypassing the service's guards. */
function insertLogRow(
  type: string,
  requestId: string | null,
  originating: string | null,
  destination: string | null,
  amount = 1,
) {
  return pool.query(
    `INSERT INTO transaction_log
       (transaction_type, originating_user_id, destination_user_id, amount, request_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [type, originating, destination, amount, requestId],
  );
}

afterAll(async () => {
  await closePool();
});

describe('F19.3.2 — one transfer per request, enforced by the database', () => {
  it('rejects a second transfer row for the same request', async () => {
    const { requesterId, requestId } = await givenReservation(2);
    const courierId = await givenFundedUser();

    await insertLogRow('transfer', requestId, requesterId, courierId);
    await expect(
      insertLogRow('transfer', requestId, requesterId, courierId),
    ).rejects.toMatchObject({
      code: PG_UNIQUE_VIOLATION,
      constraint: 'transaction_log_one_transfer_per_request',
    });
  });

  it('still allows transfers for different requests', async () => {
    const requesterId = await givenFundedUser();
    const courierId = await givenFundedUser();
    await insertLogRow('transfer', newRequestId(), requesterId, courierId);
    await expect(
      insertLogRow('transfer', newRequestId(), requesterId, courierId),
    ).resolves.toBeDefined();
  });
});

describe('one reservation and one release per request', () => {
  it('rejects a duplicate reservation row', async () => {
    const { requesterId, requestId } = await givenReservation(2);
    await expect(insertLogRow('reservation', requestId, requesterId, null)).rejects.toMatchObject(
      {
        code: PG_UNIQUE_VIOLATION,
        constraint: 'transaction_log_one_reservation_per_request',
      },
    );
  });

  it('rejects a duplicate release row', async () => {
    const { requesterId, requestId } = await givenReservation(2);
    await insertLogRow('release', requestId, requesterId, null);
    await expect(insertLogRow('release', requestId, requesterId, null)).rejects.toMatchObject({
      code: PG_UNIQUE_VIOLATION,
      constraint: 'transaction_log_one_release_per_request',
    });
  });
});

describe('F20.1.1 — the log row shape is enforced by the database', () => {
  it('rejects an allocation that names no destination', async () => {
    await expect(insertLogRow('allocation', null, null, null)).rejects.toMatchObject({
      code: PG_CHECK_VIOLATION,
      constraint: 'transaction_log_party_shape',
    });
  });

  it('rejects a transfer with no destination user', async () => {
    await expect(
      insertLogRow('transfer', newRequestId(), newUserId(), null),
    ).rejects.toMatchObject({
      code: PG_CHECK_VIOLATION,
      constraint: 'transaction_log_party_shape',
    });
  });

  it('rejects a reservation with no request id', async () => {
    await expect(insertLogRow('reservation', null, newUserId(), null)).rejects.toMatchObject({
      code: PG_CHECK_VIOLATION,
      constraint: 'transaction_log_request_id_shape',
    });
  });

  it('rejects a non-positive amount', async () => {
    await expect(
      insertLogRow('reservation', newRequestId(), newUserId(), null, 0),
    ).rejects.toMatchObject({
      code: PG_CHECK_VIOLATION,
      constraint: 'transaction_log_amount_positive',
    });
  });
});

describe('balances invariants are enforced by the database', () => {
  it('refuses to let reserved exceed total', async () => {
    const userId = await givenFundedUser();
    await expect(
      pool.query('UPDATE balances SET reserved_balance = total_balance + 1 WHERE user_id = $1', [
        userId,
      ]),
    ).rejects.toMatchObject({ constraint: 'balances_reserved_not_exceeding_total' });
  });

  it('refuses a negative reserved balance', async () => {
    const userId = await givenFundedUser();
    await expect(
      pool.query('UPDATE balances SET reserved_balance = -1 WHERE user_id = $1', [userId]),
    ).rejects.toMatchObject({ constraint: 'balances_reserved_non_negative' });
  });
});
