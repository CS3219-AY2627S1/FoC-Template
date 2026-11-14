/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-10-19
 * Scope: Generated Vitest HTTP tests (supertest, real test DB) for GET /users/public and
 *        GET /users/public/:id, the public display-name lookup. Kept in its own file so the
 *        existing users.controller.test.ts is untouched.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Fix F2 - debugged the ECONNRESET / "socket hang up" flake; replaced per-call
 *        `request(app)` supertest servers with the shared loopback server in
 *        tests/helpers/server.ts (`api()`). No test logic or assertions changed.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '../helpers/server.js';
import { truncateAll } from '../helpers/db.js';
import { resetEmailMock } from '../helpers/email.js';
import { accessTokenFor, bearer, createUserWithRole } from '../helpers/fixtures.js';

resetEmailMock();
beforeEach(truncateAll);
afterEach(truncateAll);

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

async function callerToken(role: 'user' | 'admin' | 'super admin' = 'user', n: number | string = 'caller') {
  const user = await createUserWithRole(n, role);
  return { user, token: await accessTokenFor(user) };
}

const get = (path: string, token?: string) => {
  const r = api().get(path);
  return token ? r.set('Authorization', bearer(token)) : r;
};

describe('GET /users/public', () => {
  it('rejects a request with no Authorization header with 401', async () => {
    const res = await get(`/users/public?ids=${UNKNOWN_ID}`);
    expect(res.status).toBe(401);
  });

  it('allows an ordinary user — this is the point of the endpoint', async () => {
    const { token } = await callerToken('user');
    const target = await createUserWithRole(1, 'user');

    const res = await get(`/users/public?ids=${target.id}`, token);

    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([{ id: target.id, username: target.username }]);
  });

  it('allows an admin too', async () => {
    const { token } = await callerToken('admin');
    const target = await createUserWithRole(1, 'user');
    const res = await get(`/users/public?ids=${target.id}`, token);
    expect(res.status).toBe(200);
  });

  it('returns id and username only — no email, role, status or timestamps', async () => {
    const { token } = await callerToken('user');
    const target = await createUserWithRole(1, 'admin');

    const res = await get(`/users/public?ids=${target.id}`, token);

    expect(Object.keys(res.body.users[0]).sort()).toEqual(['id', 'username']);
    // Belt and braces: nothing sensitive anywhere in the serialised body.
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(target.email);
    expect(body).not.toContain('admin');
    expect(body).not.toContain('password');
  });

  it('resolves several ids in one request', async () => {
    const { token } = await callerToken('user');
    const a = await createUserWithRole(1, 'user');
    const b = await createUserWithRole(2, 'user');

    const res = await get(`/users/public?ids=${a.id},${b.id}`, token);

    expect(res.status).toBe(200);
    expect(res.body.users.map((u: { id: string }) => u.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('omits unknown ids instead of erroring', async () => {
    const { token } = await callerToken('user');
    const known = await createUserWithRole(1, 'user');

    const res = await get(`/users/public?ids=${known.id},${UNKNOWN_ID}`, token);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].id).toBe(known.id);
  });

  it('returns an empty list when nothing matches', async () => {
    const { token } = await callerToken('user');
    const res = await get(`/users/public?ids=${UNKNOWN_ID}`, token);
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });

  it('rejects more than 50 ids', async () => {
    const { token } = await callerToken('user');
    const ids = Array.from({ length: 51 }, () => UNKNOWN_ID).join(',');
    const res = await get(`/users/public?ids=${ids}`, token);
    expect(res.status).toBe(400);
  });

  it('accepts exactly 50 ids', async () => {
    const { token } = await callerToken('user');
    const ids = Array.from({ length: 50 }, () => UNKNOWN_ID).join(',');
    const res = await get(`/users/public?ids=${ids}`, token);
    expect(res.status).toBe(200);
  });

  it('rejects a non-UUID id', async () => {
    const { token } = await callerToken('user');
    const res = await get('/users/public?ids=not-a-uuid', token);
    expect(res.status).toBe(400);
  });

  it('rejects a missing ids parameter', async () => {
    const { token } = await callerToken('user');
    const res = await get('/users/public', token);
    expect(res.status).toBe(400);
  });

  it('is not shadowed by GET /:id', async () => {
    // /public is registered first; if it were not, ':id' would capture the literal
    // "public" and this would be a 400 from the UUID check, or a 403 from authorize.
    const { token } = await callerToken('user');
    const res = await get(`/users/public?ids=${UNKNOWN_ID}`, token);
    expect(res.status).toBe(200);
  });
});

describe('GET /users/public/:id', () => {
  it('returns id and username for a known user', async () => {
    const { token } = await callerToken('user');
    const target = await createUserWithRole(1, 'user');

    const res = await get(`/users/public/${target.id}`, token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: target.id, username: target.username });
  });

  it('404s for an unknown id', async () => {
    const { token } = await callerToken('user');
    const res = await get(`/users/public/${UNKNOWN_ID}`, token);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('rejects a request with no token', async () => {
    const res = await get(`/users/public/${UNKNOWN_ID}`);
    expect(res.status).toBe(401);
  });
});
