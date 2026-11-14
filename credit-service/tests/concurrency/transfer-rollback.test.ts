// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-16
//  2026-10-16: Week 7/8 catch-up - evidence for NFR8.1.2. Injects a failure after both
//    wallets have been written but before the transaction commits, and asserts the
//    whole transfer is undone.
//    Requires a running credit-db; see credit-service/README.md.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

// Partially mocked so every query behaves normally except the final log insert, which
// is the last statement in the transfer transaction. Failing there means both balance
// UPDATEs have already executed inside the open transaction — exactly the
// "system failure during a credit transfer" NFR8.1.2 describes.
vi.mock('../../src/db/queries/credits.queries.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/db/queries/credits.queries.js')>();
  return { ...actual, insertTransaction: vi.fn(actual.insertTransaction) };
});

const queries = await import('../../src/db/queries/credits.queries.js');
const { transferCredits } = await import('../../src/services/credits.service.js');
const {
  closePool,
  countTransactionsForRequest,
  givenFundedUser,
  givenReservation,
  readBalance,
} = await import('../helpers/db.js');

afterEach(() => {
  vi.mocked(queries.insertTransaction).mockClear();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await closePool();
});

describe('NFR8.1.2 — a failed transfer rolls back completely', () => {
  it('leaves both wallets and the log exactly as they were', async () => {
    const { requesterId, requestId } = await givenReservation(5);
    const courierId = await givenFundedUser();

    const before = {
      requester: await readBalance(requesterId),
      courier: await readBalance(courierId),
      rows: await countTransactionsForRequest(requestId),
    };
    expect(before.requester).toEqual({ total: 20, reserved: 5 });
    expect(before.courier).toEqual({ total: 20, reserved: 0 });

    vi.mocked(queries.insertTransaction).mockRejectedValueOnce(
      new Error('connection lost before commit'),
    );

    await expect(transferCredits(requestId, courierId)).rejects.toThrow(
      'connection lost before commit',
    );

    // Both wallets, not just the requester's. The scenario in context §9 is precisely
    // the requester being debited while the courier is never credited.
    expect(await readBalance(requesterId)).toEqual(before.requester);
    expect(await readBalance(courierId)).toEqual(before.courier);
    expect(await countTransactionsForRequest(requestId)).toBe(before.rows);
  });

  it('leaves the request transferable once the failure clears', async () => {
    const { requesterId, requestId } = await givenReservation(8);
    const courierId = await givenFundedUser();

    vi.mocked(queries.insertTransaction).mockRejectedValueOnce(new Error('transient'));
    await expect(transferCredits(requestId, courierId)).rejects.toThrow('transient');

    // Nothing was recorded, so a retry is not blocked by F19.3.2's unique index.
    // This is what makes the transfer safe to drive from a retry later.
    await transferCredits(requestId, courierId);

    expect(await readBalance(requesterId)).toEqual({ total: 12, reserved: 0 });
    expect(await readBalance(courierId)).toEqual({ total: 28, reserved: 0 });
    expect(await countTransactionsForRequest(requestId)).toBe(2);
  });
});
