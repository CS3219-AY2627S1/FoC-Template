/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28b (Scheduled Errands), per instructions.md - Vitest HTTP tests (supertest,
 *        real test DB) for GET /users/worker/:id. Kept in its own file, mirroring
 *        users.public.controller.test.ts's precedent for a route with its own auth scheme.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Fix F2 - debugged the ECONNRESET / "socket hang up" flake; replaced per-call
 *        `request(app)` supertest servers with the shared loopback server in
 *        tests/helpers/server.ts (`api()`). No test logic or assertions changed.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '../helpers/server.js';
import { setLoginLockState, setUserStatus, truncateAll } from '../helpers/db.js';
import { resetEmailMock } from '../helpers/email.js';
import { createActiveUser, registerPending } from '../helpers/fixtures.js';

resetEmailMock();
beforeEach(truncateAll);
afterEach(truncateAll);

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const RIGHT_KEY = process.env.USER_ORDER_SERVICE_API_KEY!;

const get = (path: string, serviceKey?: string) => {
  const r = api().get(path);
  return serviceKey !== undefined ? r.set('User-Order-Service-Key', serviceKey) : r;
};

describe('GET /users/worker/:id', () => {
  it('rejects a request with a missing key with 401 INVALID_SERVICE_KEY', async () => {
    const target = await createActiveUser(1);
    const res = await get(`/users/worker/${target.id}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid service key', code: 'INVALID_SERVICE_KEY' });
  });

  it('rejects a request with the wrong key with 401 INVALID_SERVICE_KEY', async () => {
    const target = await createActiveUser(1);
    const res = await get(`/users/worker/${target.id}`, 'wrong-key');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid service key', code: 'INVALID_SERVICE_KEY' });
  });

  it('accepts the right key and returns only status and lockedUntil, for an active user', async () => {
    const target = await createActiveUser(1);
    const res = await get(`/users/worker/${target.id}`, RIGHT_KEY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'active', lockedUntil: null });
  });

  it("returns a pending user's status as 'pending'", async () => {
    const target = await registerPending(1);
    const res = await get(`/users/worker/${target.id}`, RIGHT_KEY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'pending', lockedUntil: null });
  });

  it("returns a suspended user's status as 'suspended'", async () => {
    const target = await createActiveUser(1);
    await setUserStatus(target.id, 'suspended');
    const res = await get(`/users/worker/${target.id}`, RIGHT_KEY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'suspended', lockedUntil: null });
  });

  it('returns a non-null, future lockedUntil for a locked user', async () => {
    const target = await createActiveUser(1);
    await setLoginLockState(target.id, { lockedUntilMinutesFromNow: 30, lockLevel: 1 });
    const res = await get(`/users/worker/${target.id}`, RIGHT_KEY);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.lockedUntil).not.toBeNull();
    expect(new Date(res.body.lockedUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it('returns 404 USER_NOT_FOUND for a well-formed UUID that does not exist', async () => {
    const res = await get(`/users/worker/${UNKNOWN_ID}`, RIGHT_KEY);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'User not found', code: 'USER_NOT_FOUND' });
  });

  it('returns 400 VALIDATION_ERROR "Invalid user ID" for a non-UUID id', async () => {
    const res = await get('/users/worker/abc123', RIGHT_KEY);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid user ID', code: 'VALIDATION_ERROR' });
  });

  it('is registered before GET /:id: no Bearer token is required, and a missing one is 401 INVALID_SERVICE_KEY, never UNAUTHORIZED from authenticate', async () => {
    const target = await createActiveUser(1);
    const res = await get(`/users/worker/${target.id}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_SERVICE_KEY');
  });
});
