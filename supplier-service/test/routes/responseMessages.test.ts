/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-04
 * Scope: Added Phase 5 Task 2 tests asserting the response messages and details that the team accepted in
 *        docs/phase-5-response-inventory.md (shared-middleware and validation rows that need no database).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import { createSign, generateKeyPairSync } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { poolStub, redisStub } = vi.hoisted(() => ({
  poolStub: { query: vi.fn(), execute: vi.fn(), getConnection: vi.fn() },
  redisStub: { get: vi.fn(), set: vi.fn(), del: vi.fn(), eval: vi.fn(), call: vi.fn() },
}));
vi.mock('../../src/db/pool.js', () => ({ pool: poolStub }));
vi.mock('../../src/redis/client.js', () => ({ default: redisStub }));

import app from '../../src/app.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = 'phase-5-messages';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function tokenFor(role: string): string {
  const input = `${encode({ alg: 'RS256', typ: 'JWT', kid })}.${encode({ sub: `u-${role}`, role, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  return `${input}.${signer.sign(privateKey).toString('base64url')}`;
}
const userToken = tokenFor('user');
const adminToken = tokenFor('admin');
let ipCounter = 0;
const nextIp = () => `10.1.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

describe('accepted response messages (docs/phase-5-response-inventory.md)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256' }],
    }), { status: 200 })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('401: missing token', async () => {
    const res = await request(app).get('/api/v1/suppliers').set('X-Forwarded-For', nextIp());
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Bearer token is missing or invalid.');
    expect(res.body.details).toBeUndefined();
  });

  it('403: role not permitted on an admin route', async () => {
    const res = await request(app).get('/api/v1/admin/suppliers')
      .set('X-Forwarded-For', nextIp()).set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You do not have permission to perform this operation.');
    expect(res.body.details).toBeUndefined();
  });

  it('400: POST admin suppliers without an Idempotency-Key', async () => {
    const res = await request(app).post('/api/v1/admin/suppliers')
      .set('X-Forwarded-For', nextIp()).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('A valid Idempotency-Key header (UUID) is required.');
    expect(res.body.details).toEqual([
      expect.objectContaining({ field: 'Idempotency-Key', message: 'Send a UUID in the Idempotency-Key header.' }),
    ]);
  });

  it('422: supplier list rejects a limit other than 50 and names the detail', async () => {
    const res = await request(app).get('/api/v1/suppliers?limit=10')
      .set('X-Forwarded-For', nextIp()).set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('One or more request values failed validation.');
    expect(JSON.stringify(res.body.details)).toContain('limit is fixed at 50');
  });

  it('422: supplier detail rejects a non-numeric id', async () => {
    const res = await request(app).get('/api/v1/suppliers/abc')
      .set('X-Forwarded-For', nextIp()).set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('One or more request values failed validation.');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('422: reference location update with no fields', async () => {
    const res = await request(app).put('/api/v1/admin/reference/locations/1')
      .set('X-Forwarded-For', nextIp()).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('One or more request values failed validation.');
    expect(JSON.stringify(res.body.details)).toContain('At least one field is required.');
  });
});
