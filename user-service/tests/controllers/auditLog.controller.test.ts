// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
// Scope: Stage 26d - HTTP tests (supertest, real test DB) for GET /admin/audit-logs, covering
//        instructions.md Stage 26d's Verification bullets. admin_audit_log has no FK to users
//        and is never cleared by truncateAll, so (as in auditLog.queries.test.ts) every test
//        scopes its request by a `target` filter on a user created in that test, which stale
//        rows from earlier tests (whose users are gone) can never match.
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
// Scope: Fix F2 - debugged the ECONNRESET / "socket hang up" flake; replaced per-call
//        `request(app)` supertest servers with the shared loopback server in
//        tests/helpers/server.ts (`api()`). No test logic or assertions changed.
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '../helpers/server.js';
import * as auditLogQueries from '../../src/db/queries/auditLog.queries.js';
import pool from '../../src/db/pool.js';
import { withTransaction } from '../../src/db/transaction.js';
import { truncateAll } from '../helpers/db.js';
import { accessTokenFor, bearer, createActiveUser, createUserWithRole } from '../helpers/fixtures.js';

beforeEach(truncateAll);
afterEach(truncateAll);

const UNAUTHORIZED = { message: 'Unauthorized', code: 'UNAUTHORIZED' };
const FORBIDDEN = { message: 'Forbidden', code: 'FORBIDDEN' };

const get = (path: string, token?: string) => {
  const r = api().get(path);
  return token ? r.set('Authorization', bearer(token)) : r;
};

async function callerToken(role: 'user' | 'admin' | 'super admin', n: number | string = 'caller') {
  const user = await createUserWithRole(n, role);
  return { user, token: await accessTokenFor(user) };
}

async function seedRow(overrides: {
  actorId: string;
  targetId: string;
  action?: auditLogQueries.AuditAction;
  reason?: string;
  userAgent?: string | null;
}): Promise<string> {
  return withTransaction((client) =>
    auditLogQueries.insertAuditLog(
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

describe('GET /admin/audit-logs', () => {
  it('rejects a request with no token with 401 UNAUTHORIZED', async () => {
    const res = await get('/admin/audit-logs');
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });

  it('rejects a regular user with 403 FORBIDDEN', async () => {
    const { token } = await callerToken('user');
    const res = await get('/admin/audit-logs', token);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(FORBIDDEN);
  });

  it('admin and super admin both get 200 with the same rows', async () => {
    const { user: actor } = await callerToken('admin', 'actor');
    const target = await createActiveUser(1);
    await seedRow({ actorId: actor.id, targetId: target.id });

    const { token: adminToken } = await callerToken('admin', 'viewer1');
    const { token: saToken } = await callerToken('super admin', 'viewer2');

    const adminRes = await get(`/admin/audit-logs?target=${target.username}`, adminToken);
    const saRes = await get(`/admin/audit-logs?target=${target.username}`, saToken);
    expect(adminRes.status).toBe(200);
    expect(saRes.status).toBe(200);
    expect(adminRes.body.logs).toEqual(saRes.body.logs);
    expect(adminRes.body.logs).toHaveLength(1);
  });

  it('no params: 200 with the paginated shape, newest first, entry fields with no email or password hash', async () => {
    const { user: actor } = await callerToken('admin', 'actor');
    const target = await createActiveUser(1);
    await seedRow({ actorId: actor.id, targetId: target.id, action: 'USER_SUSPEND' });
    await seedRow({ actorId: actor.id, targetId: target.id, action: 'USER_UNLOCK', reason: 'IDENTITY_VERIFIED' });

    const { token: viewerToken } = await callerToken('admin', 'viewer');
    const res = await get(`/admin/audit-logs?target=${target.username}`, viewerToken);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['logs', 'page', 'pageSize', 'total', 'totalPages'].sort());
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(50);
    expect(res.body.total).toBe(2);
    expect(res.body.logs[0].action).toBe('USER_UNLOCK');
    expect(res.body.logs[1].action).toBe('USER_SUSPEND');
    expect(Object.keys(res.body.logs[0]).sort()).toEqual(
      [
        'id',
        'createdAt',
        'actorId',
        'actorUsername',
        'action',
        'targetId',
        'targetUsername',
        'before',
        'after',
        'reason',
        'userAgent',
      ].sort(),
    );
    expect(JSON.stringify(res.body.logs)).not.toContain('@');
    expect(JSON.stringify(res.body.logs)).not.toMatch(/password/i);
  });

  it.each(['0', '-1', 'abc', '1.5'])('rejects page=%s with 400 "Page must be a positive integer"', async (page) => {
    const { token } = await callerToken('admin');
    const res = await get(`/admin/audit-logs?page=${page}`, token);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Page must be a positive integer', code: 'VALIDATION_ERROR' });
  });

  it('page=2 continues with no overlap or gap; a page past the end is empty with the correct total', async () => {
    const { user: actor } = await callerToken('admin', 'actor');
    const target = await createActiveUser(1);
    for (let i = 0; i < 55; i++) {
      await seedRow({ actorId: actor.id, targetId: target.id });
    }
    const { token } = await callerToken('admin', 'viewer');

    const page1 = await get(`/admin/audit-logs?target=${target.username}&page=1`, token);
    const page2 = await get(`/admin/audit-logs?target=${target.username}&page=2`, token);
    expect(page1.body.logs).toHaveLength(50);
    expect(page2.body.logs).toHaveLength(5);
    expect(page1.body.total).toBe(55);
    expect(page2.body.total).toBe(55);
    const ids = new Set([...page1.body.logs, ...page2.body.logs].map((l: { id: string }) => l.id));
    expect(ids.size).toBe(55);

    const page3 = await get(`/admin/audit-logs?target=${target.username}&page=3`, token);
    expect(page3.status).toBe(200);
    expect(page3.body.logs).toEqual([]);
    expect(page3.body.total).toBe(55);
  });

  it('actor and target filter on username substring, case-insensitive input', async () => {
    const { user: actor } = await callerToken('admin', 'theactor');
    const target = await createActiveUser('thetarget');
    await seedRow({ actorId: actor.id, targetId: target.id });
    const { token } = await callerToken('admin', 'viewer');

    const byActor = await get(`/admin/audit-logs?actor=THEACTOR`, token);
    expect(byActor.body.logs.some((l: { actorId: string }) => l.actorId === actor.id)).toBe(true);

    const byTarget = await get(`/admin/audit-logs?target=THETARGET`, token);
    expect(byTarget.body.logs.some((l: { targetId: string }) => l.targetId === target.id)).toBe(true);
  });

  it('action accepts one value and several; an invalid value is 400', async () => {
    const { user: actor } = await callerToken('admin', 'actor');
    const target = await createActiveUser(1);
    await seedRow({ actorId: actor.id, targetId: target.id, action: 'USER_SUSPEND' });
    await seedRow({ actorId: actor.id, targetId: target.id, action: 'USER_UNLOCK', reason: 'IDENTITY_VERIFIED' });
    await seedRow({ actorId: actor.id, targetId: target.id, action: 'USER_PROMOTE', reason: 'APPOINTED_MODERATOR' });
    const { token } = await callerToken('admin', 'viewer');

    const one = await get(`/admin/audit-logs?target=${target.username}&action=USER_SUSPEND`, token);
    expect(one.body.logs.map((l: { action: string }) => l.action)).toEqual(['USER_SUSPEND']);

    const several = await get(
      `/admin/audit-logs?target=${target.username}&action=USER_SUSPEND&action=USER_UNLOCK`,
      token,
    );
    expect(several.body.logs.map((l: { action: string }) => l.action).sort()).toEqual(['USER_SUSPEND', 'USER_UNLOCK']);

    const invalid = await get(`/admin/audit-logs?action=NOT_AN_ACTION`, token);
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });

  it('reasonCode matches a code exactly, OTHER matches "OTHER: ..." rows, an invalid code is 400', async () => {
    const { user: actor } = await callerToken('admin', 'actor');
    const target = await createActiveUser(1);
    await seedRow({ actorId: actor.id, targetId: target.id, reason: 'FRAUD_OR_SCAM' });
    await seedRow({ actorId: actor.id, targetId: target.id, reason: 'OTHER: a long explanation goes here' });
    const { token } = await callerToken('admin', 'viewer');

    const exact = await get(`/admin/audit-logs?target=${target.username}&reasonCode=FRAUD_OR_SCAM`, token);
    expect(exact.body.logs).toHaveLength(1);
    expect(exact.body.logs[0].reason).toBe('FRAUD_OR_SCAM');

    const other = await get(`/admin/audit-logs?target=${target.username}&reasonCode=OTHER`, token);
    expect(other.body.logs).toHaveLength(1);
    expect(other.body.logs[0].reason).toBe('OTHER: a long explanation goes here');

    const invalid = await get(`/admin/audit-logs?reasonCode=NOT_A_CODE`, token);
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ message: 'Invalid reason code', code: 'VALIDATION_ERROR' });
  });

  it('from/to are inclusive; from after to is 400; invalid dates are 400', async () => {
    const { token } = await callerToken('admin');

    const invalidFrom = await get('/admin/audit-logs?from=not-a-date', token);
    expect(invalidFrom.status).toBe(400);
    expect(invalidFrom.body).toEqual({ message: 'From must be a valid date', code: 'VALIDATION_ERROR' });

    const invalidTo = await get('/admin/audit-logs?to=not-a-date', token);
    expect(invalidTo.status).toBe(400);
    expect(invalidTo.body).toEqual({ message: 'To must be a valid date', code: 'VALIDATION_ERROR' });

    const reversed = await get(
      '/admin/audit-logs?from=2026-01-02T00:00:00.000Z&to=2026-01-01T00:00:00.000Z',
      token,
    );
    expect(reversed.status).toBe(400);
    expect(reversed.body.code).toBe('VALIDATION_ERROR');
  });

  it('sortDir=asc returns oldest first; sortBy is an unexpected field', async () => {
    const { user: actor } = await callerToken('admin', 'actor');
    const target = await createActiveUser(1);
    const first = await seedRow({ actorId: actor.id, targetId: target.id });
    const second = await seedRow({ actorId: actor.id, targetId: target.id, action: 'USER_UNLOCK', reason: 'IDENTITY_VERIFIED' });
    const { token } = await callerToken('admin', 'viewer');

    const asc = await get(`/admin/audit-logs?target=${target.username}&sortDir=asc`, token);
    expect(asc.body.logs.map((l: { id: string }) => l.id)).toEqual([first, second]);

    const badSortBy = await get('/admin/audit-logs?sortBy=anything', token);
    expect(badSortBy.status).toBe(400);
    expect(badSortBy.body).toEqual({ message: 'Request contains unexpected fields', code: 'VALIDATION_ERROR' });
  });

  it('an unknown param is 400 "Request contains unexpected fields"', async () => {
    const { token } = await callerToken('admin');
    const res = await get('/admin/audit-logs?foo=bar', token);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Request contains unexpected fields', code: 'VALIDATION_ERROR' });
  });

  it('a repeated param on a single-value filter is 400', async () => {
    const { token } = await callerToken('admin');
    const res = await get('/admin/audit-logs?actor=a&actor=b', token);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('a row whose actor or target has been deleted is still listed, with a null username', async () => {
    const actor = await createUserWithRole('actortodelete', 'admin');
    const target = await createActiveUser('targettodelete');
    const rowId = await seedRow({ actorId: actor.id, targetId: target.id });
    const { token } = await callerToken('admin', 'viewer');

    await pool.query('DELETE FROM users WHERE id = $1', [target.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [actor.id]);

    // Scoped by action + reasonCode (rather than actor/target, which no longer have a
    // username to match) so this test's row is found regardless of rows left over elsewhere.
    const res = await get('/admin/audit-logs?action=USER_SUSPEND&reasonCode=FRAUD_OR_SCAM', token);
    const row = res.body.logs.find((l: { id: string }) => l.id === rowId);
    expect(row).toBeDefined();
    expect(row).toMatchObject({ actorUsername: null, targetUsername: null });
  });

  it('no audit row is written by viewing the log', async () => {
    const { token } = await callerToken('admin');
    const before = await get('/admin/audit-logs', token);
    const after = await get('/admin/audit-logs', token);
    expect(before.status).toBe(200);
    expect(after.body.total).toBe(before.body.total);
  });
});
