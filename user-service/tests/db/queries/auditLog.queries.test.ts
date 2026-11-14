// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
// Scope: Stage 26a - integration tests (real test DB) for the admin_audit_log table (enum,
//        columns, indexes, append-only triggers) and insertAuditLog. Governing decision:
//        instructions.md Stage 26a's own Verification bullets.
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-06: Stage 26d - added listAuditLogsPage tests. admin_audit_log has no FK to users,
//   so truncateAll never clears it and rows from other tests in the same run persist (by
//   design - see tests/helpers/db.ts's note on getAuditLogRowsForTarget). That is not a problem
//   here: every test filters by a `target` (or `actor`) username that only exists in the
//   `users` table for the duration of that test (truncateAll deletes it afterward), so a stale
//   row from an earlier test - whose actor/target user is gone - gets a NULL joined username
//   via the LEFT JOIN and can never match a substring filter on a live username.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pool from '../../../src/db/pool.js';
import * as auditLog from '../../../src/db/queries/auditLog.queries.js';
import * as users from '../../../src/db/queries/users.queries.js';
import { withTransaction } from '../../../src/db/transaction.js';
import { getAuditLogRowsForTarget, truncateAll } from '../../helpers/db.js';

async function insertRow(overrides: {
  actorId: string;
  targetId: string;
  action?: auditLog.AuditAction;
  reason?: string;
  userAgent?: string | null;
}): Promise<string> {
  return withTransaction((client) =>
    auditLog.insertAuditLog(
      {
        actorId: overrides.actorId,
        action: overrides.action ?? 'USER_SUSPEND',
        targetId: overrides.targetId,
        before: { status: 'active' },
        after: { status: 'suspended' },
        reason: overrides.reason ?? 'FRAUD_OR_SCAM',
        userAgent: overrides.userAgent ?? null,
      },
      client,
    ),
  );
}

let actorId: string;
let targetId: string;

beforeEach(async () => {
  await truncateAll();
  actorId = (
    await users.createUser({ username: 'admin1', email: 'admin1@example.com', passwordHash: 'h', status: 'active' })
  ).id;
  targetId = (
    await users.createUser({ username: 'target1', email: 'target1@example.com', passwordHash: 'h', status: 'active' })
  ).id;
});
afterEach(truncateAll);

describe('admin_audit_log schema', () => {
  it('rejects UPDATE', async () => {
    const id = await withTransaction((client) =>
      auditLog.insertAuditLog(
        { actorId, action: 'USER_SUSPEND', targetId, before: { status: 'active' }, after: { status: 'suspended' }, reason: 'FRAUD_OR_SCAM', userAgent: null },
        client,
      ),
    );
    await expect(pool.query(`UPDATE admin_audit_log SET reason = 'x' WHERE id = $1`, [id])).rejects.toThrow(
      /append-only/,
    );
  });

  it('rejects DELETE', async () => {
    const id = await withTransaction((client) =>
      auditLog.insertAuditLog(
        { actorId, action: 'USER_UNLOCK', targetId, before: { isLocked: true }, after: { isLocked: false }, reason: 'IDENTITY_VERIFIED', userAgent: null },
        client,
      ),
    );
    await expect(pool.query(`DELETE FROM admin_audit_log WHERE id = $1`, [id])).rejects.toThrow(/append-only/);
  });

  it('rejects TRUNCATE', async () => {
    await expect(pool.query('TRUNCATE admin_audit_log')).rejects.toThrow(/append-only/);
  });

  it('leaves audit rows unchanged when the actor or target user is deleted', async () => {
    const id = await withTransaction((client) =>
      auditLog.insertAuditLog(
        { actorId, action: 'EMAIL_UNMASK', targetId, before: null, after: null, reason: 'SUPPORT_REQUEST', userAgent: null },
        client,
      ),
    );

    await pool.query('DELETE FROM users WHERE id = $1', [targetId]);
    await pool.query('DELETE FROM users WHERE id = $1', [actorId]);

    const row = (await pool.query('SELECT * FROM admin_audit_log WHERE id = $1', [id])).rows[0];
    expect(row).toMatchObject({ id, actor_id: actorId, target_id: targetId });
  });
});

describe('insertAuditLog', () => {
  it('inserts a row with the given fields and a database-clock created_at', async () => {
    const before = await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now');

    const id = await withTransaction((client) =>
      auditLog.insertAuditLog(
        {
          actorId,
          action: 'USER_PROMOTE',
          targetId,
          before: { role: 'user' },
          after: { role: 'admin' },
          reason: 'APPOINTED_MODERATOR',
          userAgent: 'Mozilla/5.0 Test',
        },
        client,
      ),
    );

    const after = await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
    const [row] = await getAuditLogRowsForTarget(targetId);
    expect(row).toMatchObject({
      id,
      actor_id: actorId,
      action: 'USER_PROMOTE',
      target_id: targetId,
      before: { role: 'user' },
      after: { role: 'admin' },
      reason: 'APPOINTED_MODERATOR',
      user_agent: 'Mozilla/5.0 Test',
    });
    expect(row!.created_at.getTime()).toBeGreaterThanOrEqual(before.rows[0]!.now.getTime());
    expect(row!.created_at.getTime()).toBeLessThanOrEqual(after.rows[0]!.now.getTime());
  });

  it('stores a NULL user_agent when none is given', async () => {
    await withTransaction((client) =>
      auditLog.insertAuditLog(
        { actorId, action: 'USER_DEMOTE', targetId, before: { role: 'admin' }, after: { role: 'user' }, reason: 'ROLE_ENDED', userAgent: null },
        client,
      ),
    );
    const [row] = await getAuditLogRowsForTarget(targetId);
    expect(row!.user_agent).toBeNull();
  });

  it('stores NULL before/after for EMAIL_UNMASK', async () => {
    await withTransaction((client) =>
      auditLog.insertAuditLog(
        { actorId, action: 'EMAIL_UNMASK', targetId, before: null, after: null, reason: 'OTHER: investigating a dispute', userAgent: null },
        client,
      ),
    );
    const [row] = await getAuditLogRowsForTarget(targetId);
    expect(row!.before).toBeNull();
    expect(row!.after).toBeNull();
    expect(row!.reason).toBe('OTHER: investigating a dispute');
  });

  it('rolls back with its transaction when a later statement in the same transaction fails', async () => {
    await expect(
      withTransaction(async (client) => {
        await auditLog.insertAuditLog(
          { actorId, action: 'USER_UNLOCK', targetId, before: { isLocked: true }, after: { isLocked: false }, reason: 'FALSE_LOCKOUT', userAgent: null },
          client,
        );
        throw new Error('simulated failure after insert');
      }),
    ).rejects.toThrow('simulated failure after insert');

    const rows = await getAuditLogRowsForTarget(targetId);
    expect(rows).toHaveLength(0);
  });
});

describe('listAuditLogsPage', () => {
  const defaultPage = { sortDir: 'desc' as const, limit: 50, offset: 0 };

  it('returns rows newest first with actor/target usernames joined, and the total', async () => {
    await insertRow({ actorId, targetId });
    await insertRow({ actorId, targetId, action: 'USER_UNLOCK', reason: 'IDENTITY_VERIFIED' });

    const { rows, total } = await auditLog.listAuditLogsPage({ ...defaultPage, target: 'target1' });
    expect(total).toBe(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.action).toBe('USER_UNLOCK');
    expect(rows[1]!.action).toBe('USER_SUSPEND');
    expect(rows[0]).toMatchObject({ actor_id: actorId, actor_username: 'admin1', target_id: targetId, target_username: 'target1' });
  });

  it('entries contain no email and no password hash column', async () => {
    await insertRow({ actorId, targetId });
    const { rows } = await auditLog.listAuditLogsPage({ ...defaultPage, target: 'target1' });
    expect(rows[0]).not.toHaveProperty('email');
    expect(rows[0]).not.toHaveProperty('password_hash');
    expect(JSON.stringify(rows[0])).not.toContain('@');
  });

  it('paginates with no overlap or gap, and a page past the end is empty with the correct total', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 55; i++) {
      ids.push(await insertRow({ actorId, targetId }));
    }

    const page1 = await auditLog.listAuditLogsPage({ ...defaultPage, target: 'target1', limit: 50, offset: 0 });
    const page2 = await auditLog.listAuditLogsPage({ ...defaultPage, target: 'target1', limit: 50, offset: 50 });
    expect(page1.total).toBe(55);
    expect(page2.total).toBe(55);
    expect(page1.rows).toHaveLength(50);
    expect(page2.rows).toHaveLength(5);
    const seenIds = new Set([...page1.rows, ...page2.rows].map((r) => r.id));
    expect(seenIds.size).toBe(55);
    expect([...seenIds].sort()).toEqual([...ids].sort());

    const pastEnd = await auditLog.listAuditLogsPage({ ...defaultPage, target: 'target1', limit: 50, offset: 100 });
    expect(pastEnd.rows).toEqual([]);
    expect(pastEnd.total).toBe(55);
  });

  it('actor and target substring match on usernames, with % and _ literal; the controller lowercases input before it reaches here', async () => {
    const weird = await users.createUser({ username: 'ta%rg_et2', email: 'weird@example.com', passwordHash: 'h', status: 'active' });
    await insertRow({ actorId, targetId: weird.id });
    await insertRow({ actorId, targetId });

    const byTarget = await auditLog.listAuditLogsPage({ ...defaultPage, target: 'target1' });
    expect(byTarget.rows.map((r) => r.target_id)).toEqual([targetId]);

    const byWeird = await auditLog.listAuditLogsPage({ ...defaultPage, target: 'ta%rg_et' });
    expect(byWeird.rows.map((r) => r.target_id)).toEqual([weird.id]);

    const byActor = await auditLog.listAuditLogsPage({ ...defaultPage, actor: 'admin1' });
    expect(byActor.total).toBe(2);
  });

  it('action filters with one value and with several', async () => {
    await insertRow({ actorId, targetId, action: 'USER_SUSPEND', reason: 'FRAUD_OR_SCAM' });
    await insertRow({ actorId, targetId, action: 'USER_UNLOCK', reason: 'IDENTITY_VERIFIED' });
    await insertRow({ actorId, targetId, action: 'USER_PROMOTE', reason: 'APPOINTED_MODERATOR' });

    const one = await auditLog.listAuditLogsPage({ ...defaultPage, target: 'target1', actions: ['USER_SUSPEND'] });
    expect(one.rows.map((r) => r.action)).toEqual(['USER_SUSPEND']);

    const several = await auditLog.listAuditLogsPage({
      ...defaultPage,
      target: 'target1',
      actions: ['USER_SUSPEND', 'USER_UNLOCK'],
    });
    expect(several.rows.map((r) => r.action).sort()).toEqual(['USER_SUSPEND', 'USER_UNLOCK']);
  });

  it('reasonCode matches the code exactly, and OTHER matches rows stored as "OTHER: ..."', async () => {
    await insertRow({ actorId, targetId, reason: 'FRAUD_OR_SCAM' });
    await insertRow({ actorId, targetId, reason: 'OTHER: a long free-text explanation here' });

    const exact = await auditLog.listAuditLogsPage({ ...defaultPage, target: 'target1', reasonCode: 'FRAUD_OR_SCAM' });
    expect(exact.rows).toHaveLength(1);
    expect(exact.rows[0]!.reason).toBe('FRAUD_OR_SCAM');

    const other = await auditLog.listAuditLogsPage({ ...defaultPage, target: 'target1', reasonCode: 'OTHER' });
    expect(other.rows).toHaveLength(1);
    expect(other.rows[0]!.reason).toBe('OTHER: a long free-text explanation here');
  });

  it('from/to are inclusive on both ends', async () => {
    // Inserted with an explicit created_at (the trigger only blocks UPDATE/DELETE/TRUNCATE,
    // not INSERT), at millisecond precision, so comparing against `from`/`to` built the same
    // way a parsed ISO 8601 string would be is exact - unlike clock_timestamp()'s default,
    // which carries microseconds a JS Date would truncate before the comparison.
    const createdAt = new Date('2024-01-01T00:00:00.000Z');
    const result = await pool.query<{ id: string }>(
      `INSERT INTO admin_audit_log (created_at, actor_id, action, target_id, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [createdAt, actorId, 'USER_SUSPEND', targetId, 'FRAUD_OR_SCAM'],
    );
    const id = result.rows[0]!.id;

    const inclusive = await auditLog.listAuditLogsPage({
      ...defaultPage,
      target: 'target1',
      from: createdAt,
      to: createdAt,
    });
    expect(inclusive.rows.map((r) => r.id)).toEqual([id]);

    const tooLate = await auditLog.listAuditLogsPage({
      ...defaultPage,
      target: 'target1',
      from: new Date(createdAt.getTime() + 1),
    });
    expect(tooLate.rows).toEqual([]);

    const tooEarly = await auditLog.listAuditLogsPage({
      ...defaultPage,
      target: 'target1',
      to: new Date(createdAt.getTime() - 1),
    });
    expect(tooEarly.rows).toEqual([]);
  });

  it('combines every filter: only rows matching all of them', async () => {
    await insertRow({ actorId, targetId, action: 'USER_SUSPEND', reason: 'FRAUD_OR_SCAM' });
    await insertRow({ actorId, targetId, action: 'USER_UNLOCK', reason: 'IDENTITY_VERIFIED' });

    const result = await auditLog.listAuditLogsPage({
      ...defaultPage,
      actor: 'admin1',
      target: 'target1',
      actions: ['USER_SUSPEND'],
      reasonCode: 'FRAUD_OR_SCAM',
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.action).toBe('USER_SUSPEND');
  });

  it('sortDir asc returns oldest first', async () => {
    const first = await insertRow({ actorId, targetId });
    const second = await insertRow({ actorId, targetId, action: 'USER_UNLOCK', reason: 'IDENTITY_VERIFIED' });

    const asc = await auditLog.listAuditLogsPage({ ...defaultPage, sortDir: 'asc', target: 'target1' });
    expect(asc.rows.map((r) => r.id)).toEqual([first, second]);
  });

  it('a deleted actor or target is still listed, with a null username', async () => {
    const before = (await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!.now;
    await insertRow({ actorId, targetId });
    await pool.query('DELETE FROM users WHERE id = $1', [targetId]);
    await pool.query('DELETE FROM users WHERE id = $1', [actorId]);

    // Scoped by `from` (rather than target/actor, which no longer have a username to match)
    // so this test's own row is found regardless of rows left over from other tests.
    const { rows } = await auditLog.listAuditLogsPage({ ...defaultPage, from: before });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ target_id: targetId, actor_username: null, target_username: null });
  });
});
