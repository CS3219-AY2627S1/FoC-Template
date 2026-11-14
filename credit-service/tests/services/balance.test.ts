// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-16
//  2026-10-16: Week 7/8 catch-up - tests for F19.5.1 and the authorization rule that
//    guards it. The rule is tested as a pure function because the middleware cannot be
//    mounted yet; see src/middleware/requireBalanceAccess.ts.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { afterAll, describe, expect, it } from 'vitest';
import { getBalance, reserveCredits } from '../../src/services/credits.service.js';
import { canReadBalance } from '../../src/auth/roleRank.js';
import { closePool, givenFundedUser, newRequestId, newUserId } from '../helpers/db.js';

afterAll(async () => {
  await closePool();
});

describe('F19.5.1 — view total, reserved and unreserved', () => {
  it('reports all three figures, with unreserved derived', async () => {
    const userId = await givenFundedUser();
    await reserveCredits(userId, newRequestId(), 6);

    const balance = await getBalance(userId);

    expect(balance).toEqual({
      userId,
      totalBalance: 20,
      reservedBalance: 6,
      unreservedBalance: 14,
    });
    // Unreserved is computed, never stored (context §5).
    expect(balance.unreservedBalance).toBe(balance.totalBalance - balance.reservedBalance);
  });

  it('reports a freshly allocated user as fully unreserved', async () => {
    const userId = await givenFundedUser();
    await expect(getBalance(userId)).resolves.toMatchObject({
      totalBalance: 20,
      reservedBalance: 0,
      unreservedBalance: 20,
    });
  });

  it('404s for a user with no balance', async () => {
    await expect(getBalance(newUserId())).rejects.toMatchObject({
      code: 'BALANCE_NOT_FOUND',
      status: 404,
    });
  });
});

describe('F19.5.1 — who may read a balance', () => {
  const self = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';

  it('lets any user read their own balance', () => {
    expect(canReadBalance({ userId: self, role: 'user' }, self)).toBe(true);
  });

  it('stops an ordinary user reading someone else', () => {
    expect(canReadBalance({ userId: self, role: 'user' }, other)).toBe(false);
  });

  it('lets an admin read someone else', () => {
    expect(canReadBalance({ userId: self, role: 'admin' }, other)).toBe(true);
  });

  it('does not deny super admin', () => {
    // The point of comparing ranks rather than testing role === 'admin'
    // (team decision 2026-10-16).
    expect(canReadBalance({ userId: self, role: 'super admin' }, other)).toBe(true);
  });

  it('treats an unknown role as unelevated', () => {
    expect(canReadBalance({ userId: self, role: 'auditor' }, other)).toBe(false);
  });
});
