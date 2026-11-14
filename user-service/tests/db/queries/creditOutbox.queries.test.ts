// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-10-23
// Scope: Generated integration tests (real test DB) for creditOutbox.queries.ts
//        (insertCreditAllocation, findDueCreditAllocations, markCreditAllocationSent,
//        markCreditAllocationDead, recordCreditAllocationFailure,
//        replayDeadCreditAllocations), which had no test coverage at all before this change.
//        instructions.md's own Stage 14 text defers its tests to the end-of-project test
//        stage, which this file is part of. Governing decision: instructions.md Stage 14b's
//        function descriptions and the "Backoff" / "Outcome -> action" sections, cross-checked
//        against the actual SQL in src/db/queries/creditOutbox.queries.ts. Does not call
//        credit-service or mock HTTP anywhere - every function here is a plain SQL query
//        against the real test Postgres instance, consistent with Stage 7's mocking policy.
// Author review:
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as outbox from '../../../src/db/queries/creditOutbox.queries.js';
import { withTransaction } from '../../../src/db/transaction.js';
import * as users from '../../../src/db/queries/users.queries.js';
import { getOutboxRowById, seedOutboxRow, truncateAll } from '../../helpers/db.js';

let userId: string;

beforeEach(async () => {
  await truncateAll();
  userId = (
    await users.createUser({
      username: 'alice',
      email: 'alice@example.com',
      passwordHash: 'h',
      status: 'active',
    })
  ).id;
});
afterEach(truncateAll);

describe('insertCreditAllocation', () => {
  it('inserts a pending row for the user with attempts 0 and returns its id', async () => {
    const id = await withTransaction((client) => outbox.insertCreditAllocation(userId, client));
    const row = await getOutboxRowById(id);
    expect(row).toMatchObject({ user_id: userId, status: 'pending', attempts: 0, last_error: null });
  });
});

describe('findDueCreditAllocations', () => {
  it('returns only pending rows whose next_attempt_at has passed', async () => {
    const due = await seedOutboxRow(userId);
    await seedOutboxRow(userId, { nextAttemptAt: new Date(Date.now() + 60_000) }); // not due yet
    await seedOutboxRow(userId, { status: 'sent' });
    await seedOutboxRow(userId, { status: 'dead' });

    const rows = await outbox.findDueCreditAllocations(10);
    expect(rows.map((r) => r.id)).toEqual([due]);
  });

  it('orders by next_attempt_at then created_at, and respects the limit', async () => {
    const earlier = new Date(Date.now() - 2000);
    const later = new Date(Date.now() - 1000);
    const b = await seedOutboxRow(userId, { nextAttemptAt: later });
    const a = await seedOutboxRow(userId, { nextAttemptAt: earlier });

    const rows = await outbox.findDueCreditAllocations(1);
    expect(rows.map((r) => r.id)).toEqual([a]);
    const allRows = await outbox.findDueCreditAllocations(10);
    expect(allRows.map((r) => r.id)).toEqual([a, b]);
  });

  it('returns an empty array when nothing is due', async () => {
    expect(await outbox.findDueCreditAllocations(10)).toEqual([]);
  });
});

describe('markCreditAllocationSent', () => {
  it('sets status to sent and returns true for a pending row', async () => {
    const id = await seedOutboxRow(userId);
    expect(await outbox.markCreditAllocationSent(id)).toBe(true);
    expect((await getOutboxRowById(id))!.status).toBe('sent');
  });

  it('returns false and leaves the row untouched when it is not pending (sent or dead)', async () => {
    const sentId = await seedOutboxRow(userId, { status: 'sent' });
    expect(await outbox.markCreditAllocationSent(sentId)).toBe(false);

    const deadId = await seedOutboxRow(userId, { status: 'dead', attempts: 10 });
    expect(await outbox.markCreditAllocationSent(deadId)).toBe(false);
    expect((await getOutboxRowById(deadId))!.status).toBe('dead');
  });
});

describe('markCreditAllocationDead', () => {
  it('sets status to dead, increments attempts, and records last_error for a pending row', async () => {
    const id = await seedOutboxRow(userId, { attempts: 2 });
    expect(await outbox.markCreditAllocationDead(id, 'HTTP 404')).toBe(true);
    const row = await getOutboxRowById(id);
    expect(row).toMatchObject({ status: 'dead', attempts: 3, last_error: 'HTTP 404' });
  });

  it('returns false and does not move a row that is already sent or dead', async () => {
    const sentId = await seedOutboxRow(userId, { status: 'sent' });
    expect(await outbox.markCreditAllocationDead(sentId, 'HTTP 500')).toBe(false);
    expect((await getOutboxRowById(sentId))!.status).toBe('sent');
  });
});

describe('recordCreditAllocationFailure', () => {
  const opts = { maxAttempts: 10, baseDelaySeconds: 1, maxDelaySeconds: 300 };

  it('stays pending below maxAttempts, incrementing attempts and scheduling a future next_attempt_at', async () => {
    const id = await seedOutboxRow(userId, { attempts: 0 });
    const before = Date.now();
    expect(await outbox.recordCreditAllocationFailure(id, 'NETWORK ECONNREFUSED', opts)).toBe(true);
    const row = await getOutboxRowById(id);
    expect(row!.status).toBe('pending');
    expect(row!.attempts).toBe(1);
    expect(row!.last_error).toBe('NETWORK ECONNREFUSED');
    // Backoff cap after the 1st failure is 1 second (base * 2^0); allow generous slack for
    // clock skew between the test process and the DB server.
    expect(row!.next_attempt_at.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row!.next_attempt_at.getTime()).toBeLessThanOrEqual(before + 2000);
  });

  it('goes dead once attempts reaches maxAttempts, leaving next_attempt_at unchanged', async () => {
    const fixedNextAttempt = new Date(Date.now() - 5000);
    const id = await seedOutboxRow(userId, { attempts: 9, nextAttemptAt: fixedNextAttempt });
    expect(await outbox.recordCreditAllocationFailure(id, 'TIMEOUT', opts)).toBe(true);
    const row = await getOutboxRowById(id);
    expect(row!.status).toBe('dead');
    expect(row!.attempts).toBe(10);
    expect(row!.next_attempt_at.getTime()).toBe(fixedNextAttempt.getTime());
  });

  it('the backoff cap grows with attempts (2^(n-1), capped at maxDelaySeconds)', async () => {
    // After the 5th failure (attempts: 4 -> 5), the cap is base * 2^4 = 16s.
    const id = await seedOutboxRow(userId, { attempts: 4 });
    const before = Date.now();
    await outbox.recordCreditAllocationFailure(id, 'TIMEOUT', opts);
    const row = await getOutboxRowById(id);
    const waitMs = row!.next_attempt_at.getTime() - before;
    expect(waitMs).toBeGreaterThanOrEqual(-1000);
    expect(waitMs).toBeLessThanOrEqual(17_000);
  });

  it('respects maxDelaySeconds as an upper bound on the cap', async () => {
    // attempts: 19 -> the uncapped formula (2^18 seconds) must be clamped to maxDelaySeconds.
    const id = await seedOutboxRow(userId, { attempts: 19 });
    const before = Date.now();
    await outbox.recordCreditAllocationFailure(id, 'TIMEOUT', { ...opts, maxAttempts: 30 });
    const row = await getOutboxRowById(id);
    const waitMs = row!.next_attempt_at.getTime() - before;
    expect(waitMs).toBeLessThanOrEqual(opts.maxDelaySeconds * 1000 + 1000);
  });

  it('returns false and does not touch a row that is already sent or dead', async () => {
    const sentId = await seedOutboxRow(userId, { status: 'sent' });
    expect(await outbox.recordCreditAllocationFailure(sentId, 'TIMEOUT', opts)).toBe(false);
    expect((await getOutboxRowById(sentId))!.status).toBe('sent');
  });
});

describe('replayDeadCreditAllocations', () => {
  it('resets a dead row to pending with attempts 0, leaving last_error unchanged', async () => {
    const id = await seedOutboxRow(userId, { status: 'dead', attempts: 10, lastError: 'HTTP 500' });
    const resetIds = await outbox.replayDeadCreditAllocations([id]);
    expect(resetIds).toEqual([id]);
    const row = await getOutboxRowById(id);
    expect(row).toMatchObject({ status: 'pending', attempts: 0, last_error: 'HTTP 500' });
  });

  it('with ids=null, resets every dead row and nothing else', async () => {
    const dead1 = await seedOutboxRow(userId, { status: 'dead' });
    const dead2 = await seedOutboxRow(userId, { status: 'dead' });
    const sent = await seedOutboxRow(userId, { status: 'sent' });
    const pending = await seedOutboxRow(userId, { status: 'pending' });

    const resetIds = await outbox.replayDeadCreditAllocations(null);
    expect(new Set(resetIds)).toEqual(new Set([dead1, dead2]));
    expect((await getOutboxRowById(sent))!.status).toBe('sent');
    expect((await getOutboxRowById(pending))!.status).toBe('pending');
  });

  it('with explicit ids, a sent or pending row is reported as not reset and stays unchanged', async () => {
    const sent = await seedOutboxRow(userId, { status: 'sent' });
    const pending = await seedOutboxRow(userId, { status: 'pending' });
    const resetIds = await outbox.replayDeadCreditAllocations([sent, pending]);
    expect(resetIds).toEqual([]);
    expect((await getOutboxRowById(sent))!.status).toBe('sent');
    expect((await getOutboxRowById(pending))!.status).toBe('pending');
  });

  it('a nonexistent id resets nothing and is not reported', async () => {
    const resetIds = await outbox.replayDeadCreditAllocations(['00000000-0000-4000-8000-000000000000']);
    expect(resetIds).toEqual([]);
  });
});
