/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 c1 (instructions.md) - end-to-end tests for the Supplier-Order-Service-Key
 *        fallback on GET /suppliers/:id and GET /suppliers/reference/location, through the real
 *        authenticate + requireRole chain (as wired in app.ts), with a fake SupplierService so no
 *        database is needed. No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review:
 */
import { createSign, generateKeyPairSync } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupplierService } from '../../src/business/supplierService.js';
import { authenticate } from '../../src/middleware/authenticate.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { createSupplierRouter } from '../../src/routes/supplier.routes.js';

const RIGHT_KEY = 'test-supplier-order-service-key';

function fakeService(): { [K in keyof SupplierService]: ReturnType<typeof vi.fn> } {
  return {
    listSuppliers: vi.fn().mockResolvedValue({
      metadata: { totalRecords: 0, currPage: 1, limit: 50, totalPages: 0 },
      data: [],
    }),
    getSupplier: vi.fn().mockResolvedValue({ id: 101 }),
    listAdminSuppliers: vi.fn(),
    getAdminSupplier: vi.fn(),
    listLocations: vi.fn().mockResolvedValue({ locations: [] }),
    listCategories: vi.fn().mockResolvedValue({ categories: [] }),
  };
}

// Mirrors app.ts's mount shape (apiV1 router carries authenticate, then /suppliers), since
// authenticate.ts matches req.path relative to that mount point, not the full /api/v1/... URL.
function buildApp(service = fakeService()) {
  const app = express();
  const apiV1 = express.Router();
  apiV1.use(authenticate);
  apiV1.use('/suppliers', createSupplierRouter(service as unknown as SupplierService));
  app.use('/api/v1', apiV1);
  app.use(errorHandler);
  return { app, service };
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = 'service-key-test';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };

function validJwt(role: string): string {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }));
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'RS256', typ: 'JWT', kid })}.${encode({ sub: 'u-1', role, exp: Math.floor(Date.now() / 1000) + 300 })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  return `Bearer ${input}.${signer.sign(privateKey).toString('base64url')}`;
}

describe('Supplier-Order-Service-Key fallback (instructions.md Stage 28 c1)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts the right key on GET /suppliers/:id with no user token and no role check', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/suppliers/101').set('Supplier-Order-Service-Key', RIGHT_KEY);
    expect(res.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts the right key on GET /suppliers/reference/location with no user token and no role check', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get('/api/v1/suppliers/reference/location')
      .set('Supplier-Order-Service-Key', RIGHT_KEY);
    expect(res.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects the wrong key with no JWT with 401 INVALID_SERVICE_KEY', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/suppliers/101').set('Supplier-Order-Service-Key', 'wrong-key');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_SERVICE_KEY');
  });

  it('rejects the wrong key even when a JWT is also present but invalid', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get('/api/v1/suppliers/101')
      .set('Supplier-Order-Service-Key', 'wrong-key')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_SERVICE_KEY');
  });

  it('a valid JWT still works even when a wrong key is also sent (unchanged JWT behaviour)', async () => {
    const { app } = buildApp();
    const auth = validJwt('user');
    const res = await request(app)
      .get('/api/v1/suppliers/101')
      .set('Authorization', auth)
      .set('Supplier-Order-Service-Key', 'wrong-key');
    expect(res.status).toBe(200);
  });

  it('no key, no JWT: unchanged 401 Unauthorized', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/suppliers/101');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('the key is rejected on another route (GET /suppliers list)', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/suppliers').set('Supplier-Order-Service-Key', RIGHT_KEY);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('the key is rejected on GET /suppliers/reference/categories (not one of the two routes)', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get('/api/v1/suppliers/reference/categories')
      .set('Supplier-Order-Service-Key', RIGHT_KEY);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('never logs the secret', async () => {
    const { app } = buildApp();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await request(app).get('/api/v1/suppliers/101').set('Supplier-Order-Service-Key', RIGHT_KEY);
    await request(app).get('/api/v1/suppliers/101').set('Supplier-Order-Service-Key', 'wrong-key');
    const logged = [...errorSpy.mock.calls, ...logSpy.mock.calls].flat().map(String);
    expect(logged.some((entry) => entry.includes(RIGHT_KEY))).toBe(false);
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
