/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-02
 * Scope: Added Phase 5 authorization tests for mutating endpoints using the existing JWKS authentication.
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
const kid = 'phase-5-user';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const input = `${encode({ alg: 'RS256', typ: 'JWT', kid })}.${encode({ sub: 'u-1', role: 'user', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
const signer = createSign('RSA-SHA256');
signer.update(input);
signer.end();
const userToken = `${input}.${signer.sign(privateKey).toString('base64url')}`;
let ipCounter = 0;
const nextIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

const endpoints: Array<{ method: 'post' | 'put' | 'delete'; path: string }> = [
  ...['suppliers'].flatMap((name) => [
    { method: 'post' as const, path: `/api/v1/admin/${name}` },
    { method: 'put' as const, path: `/api/v1/admin/${name}/1` },
    { method: 'delete' as const, path: `/api/v1/admin/${name}/1` },
  ]),
  ...['faculties', 'locations', 'categories'].flatMap((name) => [
    { method: 'post' as const, path: `/api/v1/admin/reference/${name}` },
    { method: 'put' as const, path: `/api/v1/admin/reference/${name}/1` },
    { method: 'delete' as const, path: `/api/v1/admin/reference/${name}/1` },
  ]),
];

function expectNoStateChange(): void {
  for (const stub of [...Object.values(poolStub), ...Object.values(redisStub)]) {
    expect(stub).not.toHaveBeenCalled();
  }
}

describe('NFR6.1 mutating endpoints', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256' }],
    }), { status: 200 })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  describe.each(endpoints)('$method $path', ({ method, path }) => {
    it('rejects missing credentials without changing state', async () => {
      const res = await request(app)[method](path).set('X-Forwarded-For', nextIp());
      expect(res.status).toBe(401);
      expect(res.body.status_code).toBe(401);
      expect(fetch).not.toHaveBeenCalled();
      expectNoStateChange();
    });
    it('rejects an invalid token without changing state', async () => {
      const res = await request(app)[method](path).set('X-Forwarded-For', nextIp()).set('Authorization', 'Bearer invalid');
      expect(res.status).toBe(401);
      expect(res.body.status_code).toBe(401);
      expectNoStateChange();
    });
    it('rejects an authenticated user without changing state', async () => {
      const res = await request(app)[method](path).set('X-Forwarded-For', nextIp()).set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
      expect(res.body.status_code).toBe(403);
      expectNoStateChange();
    });
  });
});
