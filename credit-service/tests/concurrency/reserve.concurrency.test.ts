// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - evidence for NFR8.1.1. These fail against a
//    check-then-write implementation and pass with SELECT ... FOR UPDATE.
//    Requires a running credit-db; see credit-service/README.md.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Wee Jean

import { afterAll, describe, expect, it } from 'vitest';
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

describe('NFR8.1.1 — concurrent balance updates are atomic', () => {
  it('never lets simultaneous reservations overdraw the unreserved balance', async () => {
    const userId = trackUser();
    await allocateInitialCredits(userId); // 20 credits

    // Six simultaneous 4-credit reservations against 20 credits. At most five can
    // succeed. Without the row lock each would read reserved=0 and all six would
    // commit, leaving reserved=24 against a total of 20.
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => reserveCredits(userId, newRequestId(), 4)),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(succeeded).toBe(5);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: { code: 'INSUFFICIENT_UNRESERVED_CREDITS' },
    });

    const balance = await readBalance(userId);
    expect(balance).toEqual({ total: 20, reserved: 20 });

    // One allocation + five reservations. The rejected attempt logged nothing.
    expect(await countTransactions(userId)).toBe(6);
  });

  it('keeps the balance and the log in step under concurrency', async () => {
    const userId = trackUser();
    await allocateInitialCredits(userId);

    await Promise.allSettled(
      Array.from({ length: 10 }, () => reserveCredits(userId, newRequestId(), 3)),
    );

    const balance = await readBalance(userId);
    expect(balance).not.toBeNull();

    // Every reserved credit must be explained by a logged reservation: the two writes
    // share one transaction, so neither can exist without the other (context §5).
    const reservationCount = (await countTransactions(userId)) - 1; // minus the allocation
    expect(balance!.reserved).toBe(reservationCount * 3);
    expect(balance!.reserved).toBeLessThanOrEqual(balance!.total);
  });

  it('allocates only once when registration fires twice at the same moment', async () => {
    const userId = trackUser();

    const results = await Promise.allSettled([
      allocateInitialCredits(userId),
      allocateInitialCredits(userId),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await readBalance(userId)).toEqual({ total: 20, reserved: 0 });
    expect(await countTransactions(userId)).toBe(1);
  });
});
