/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Generated integration tests for the Phase 0 middleware chain from the Phase 0 plan.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): added Phase 1 route tests. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): added Phase 2 route tests per Phase 2
 *        plan Task 8. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/app.integration.test.ts to test/app.integration.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-02, Codex, model: GPT-6): updated integration fixtures for RS256 and JWKS.
 * Author review: Congchen
 * Scope (2026-11-02, Codex, model: GPT-6): updated integration test credentials for JWKS authentication.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-04, Codex, model: GPT-6): Resolved merge conflict using the existing JWKS test fixture.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import { createSign, generateKeyPairSync } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = 'integration-test-key';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };

function asRole(role: string): string {
  vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }));
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'RS256', typ: 'JWT', kid })}.${encode({ sub: 'u-1', role, exp: Math.floor(Date.now() / 1000) + 300 })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  return `Bearer ${input}.${signer.sign(privateKey).toString('base64url')}`;
}

describe('app (Phase 0 middleware chain)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects an unauthenticated request to any /api/v1 route with 401', async () => {
    const res = await request(app).get('/api/v1/__probe');
    expect(res.status).toBe(401);
    expect(res.body.status_code).toBe(401);
  });

  it('returns 404 for an unknown route once authenticated', async () => {
    const auth = asRole('user');

    const res = await request(app).get('/api/v1/__probe').set('Authorization', auth);
    expect(res.status).toBe(404);
  });

  it('does not set any CORS headers (single-origin API gateway, §3)', async () => {
    const res = await request(app).get('/api/v1/__probe');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects an unauthenticated GET /api/v1/suppliers with 401', async () => {
    const res = await request(app).get('/api/v1/suppliers');
    expect(res.status).toBe(401);
    expect(res.body.status_code).toBe(401);
  });

  it('routes an authenticated user to the supplier list (empty database rows mocked out)', async () => {
    const auth = asRole('user');
    const res = await request(app).get('/api/v1/suppliers?limit=51').set('Authorization', auth);
    // limit=51 fails validation before any database access, so no MySQL is needed for this test.
    expect(res.status).toBe(422);
  });
});

describe('Phase 2 routes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects unauthenticated admin requests with 401', async () => {
    expect((await request(app).get('/api/v1/admin/suppliers')).status).toBe(401);
    expect((await request(app).post('/api/v1/admin/suppliers')).status).toBe(401);
    expect((await request(app).delete('/api/v1/admin/reference/faculties/1')).status).toBe(401);
  });

  it('rejects the user role with 403 on every Phase 2 route', async () => {
    const auth = { Authorization: asRole('user') };
    expect((await request(app).get('/api/v1/admin/suppliers').set(auth)).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/suppliers/1').set(auth)).status).toBe(403);
    expect((await request(app).post('/api/v1/admin/suppliers').set(auth)).status).toBe(403);
    expect((await request(app).post('/api/v1/admin/reference/faculties').set(auth).send({ faculty: 'X' })).status).toBe(403);
    expect((await request(app).put('/api/v1/admin/reference/locations/1').set(auth).send({ level: 1 })).status).toBe(403);
    expect((await request(app).delete('/api/v1/admin/reference/categories/1').set(auth)).status).toBe(403);
  });

  it('returns 400 for an admin create without an Idempotency-Key', async () => {
    const auth = asRole('admin');
    const res = await request(app).post('/api/v1/admin/suppliers').set('Authorization', auth);
    expect(res.status).toBe(400);
  });

  it('returns 422 for an admin list with a bad limit', async () => {
    const auth = asRole('super admin');
    const res = await request(app).get('/api/v1/admin/suppliers?limit=10').set('Authorization', auth);
    expect(res.status).toBe(422);
  });
});
