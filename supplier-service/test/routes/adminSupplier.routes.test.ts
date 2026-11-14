/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Route tests for the admin supplier list and detail endpoints (Phase 2 plan Task 3):
 *        role restriction, filter pass-through and error mapping. No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): added POST create tests and the new
 *        dependency shape per Phase 2 plan Task 8. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/routes/adminSupplier.routes.test.ts to test/routes/adminSupplier.routes.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added PUT update tests and the
 *        `update` dependency per Phase 3 plan Task 7. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added DELETE /:id tests and the
 *        `deletion` dependency per Phase 4 plan Task 6. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { SupplierCreationService } from '../../src/business/supplierCreationService.js';
import type { SupplierDeletionService } from '../../src/business/supplierDeletionService.js';
import type { SupplierService } from '../../src/business/supplierService.js';
import type { SupplierUpdateService } from '../../src/business/supplierUpdateService.js';
import type { BeginResult, IdempotencyStore } from '../../src/idempotency/idempotencyStore.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { AppError } from '../../src/utils/AppError.js';
import { createAdminSupplierRouter } from '../../src/routes/adminSupplier.routes.js';

function buildApp(overrides: Record<string, unknown> = {}, begin: BeginResult = 'started') {
  const service = {
    listAdminSuppliers: vi.fn().mockResolvedValue({
      metadata: { totalRecords: 0, currPage: 1, limit: 50, totalPages: 0 },
      data: [],
    }),
    getAdminSupplier: vi.fn().mockResolvedValue({ id: 101, version: 2 }),
    ...overrides,
  };
  const creation = {
    createSupplier: vi.fn().mockResolvedValue({ statusCode: 201, body: { id: 101, photos: [] } }),
  };
  const update = {
    updateSupplier: vi.fn().mockResolvedValue({ statusCode: 200, body: { id: 101, version: 4 } }),
  };
  const deletion = {
    deleteSupplier: vi.fn().mockResolvedValue({ statusCode: 200, body: { id: 101, isDeleted: true } }),
  };
  const idempotency = {
    begin: vi.fn().mockResolvedValue(begin),
    complete: vi.fn().mockResolvedValue(undefined),
    abandon: vi.fn().mockResolvedValue(undefined),
  };
  const app = express();
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'];
    if (typeof role === 'string') req.user = { user_id: 'u-1', role };
    next();
  });
  app.use(
    '/api/v1/admin/suppliers',
    createAdminSupplierRouter({
      reader: service as unknown as SupplierService,
      creation: creation as unknown as SupplierCreationService,
      update: update as unknown as SupplierUpdateService,
      deletion: deletion as unknown as SupplierDeletionService,
      idempotency: idempotency as unknown as IdempotencyStore,
    }),
  );
  app.use(errorHandler);
  return { app, service, creation, update, deletion, idempotency };
}

describe.each(['admin', 'super admin'])('role %s', (role) => {
  it('may list and read admin suppliers', async () => {
    const { app } = buildApp();
    expect((await request(app).get('/api/v1/admin/suppliers').set('x-test-role', role)).status).toBe(200);
    expect((await request(app).get('/api/v1/admin/suppliers/101').set('x-test-role', role)).status).toBe(200);
  });
});

describe('access control', () => {
  it('rejects the user role with 403 and never reaches the service', async () => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/admin/suppliers').set('x-test-role', 'user');
    expect(res.status).toBe(403);
    expect(service.listAdminSuppliers).not.toHaveBeenCalled();
  });

  it('rejects a request with no identity with 403', async () => {
    const { app } = buildApp();
    expect((await request(app).get('/api/v1/admin/suppliers/101')).status).toBe(403);
  });
});

describe('list validation and filters', () => {
  it('passes the same filters as the user list', async () => {
    const { app, service } = buildApp();
    await request(app)
      .get('/api/v1/admin/suppliers?search=store&location_id=4&category_id=2&isOpen=true&sortOrder=Z-A&page=2')
      .set('x-test-role', 'admin');

    expect(service.listAdminSuppliers).toHaveBeenCalledWith({
      page: 2,
      search: 'store',
      locationId: 4,
      categoryId: 2,
      isOpen: true,
      sortOrder: 'Z-A',
    });
  });

  it('rejects a limit other than 50 with 422', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/admin/suppliers?limit=10').set('x-test-role', 'admin');
    expect(res.status).toBe(422);
  });

  it('maps an unknown id to 404', async () => {
    const { app } = buildApp({
      getAdminSupplier: vi.fn().mockRejectedValue(new AppError(404, 'Not Found', 'Supplier not found.')),
    });
    const res = await request(app).get('/api/v1/admin/suppliers/999').set('x-test-role', 'admin');
    expect(res.status).toBe(404);
  });
});

const KEY = '9b2f5a80-4c1e-4f70-9d7e-2f3a1c6b8e11';
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const post = (app: express.Express, role = 'admin') =>
  request(app)
    .post('/api/v1/admin/suppliers')
    .set('x-test-role', role)
    .set('Idempotency-Key', KEY)
    .field('name', 'Campus Store')
    .field('type', 'Facility')
    .field('location_id', '4');

describe('POST create', () => {
  it('creates, passes the parsed input and photos in order, and caches the response', async () => {
    const { app, creation, idempotency } = buildApp();
    const res = await post(app)
      .attach('photos', png, { filename: 'a.png', contentType: 'image/png' })
      .attach('photos', png, { filename: 'b.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(idempotency.begin).toHaveBeenCalledWith('u-1', KEY);
    const [input, files, actor] = creation.createSupplier.mock.calls[0] as [{ name: string; type: string }, Array<{ mimeType: string }>, { userId: string }];
    expect(input).toMatchObject({ name: 'Campus Store', type: 'Facility', locationId: 4 });
    expect(files.map((f) => f.mimeType)).toEqual(['image/png', 'image/jpeg']);
    expect(actor).toEqual({ userId: 'u-1' });
    expect(idempotency.complete).toHaveBeenCalledWith('u-1', KEY, { statusCode: 201, body: { id: 101, photos: [] } });
  });

  it('returns the reactivation status from the service', async () => {
    const { app, creation } = buildApp();
    creation.createSupplier.mockResolvedValueOnce({ statusCode: 200, body: { id: 7 } });
    expect((await post(app)).status).toBe(200);
  });

  it('returns 400 without an Idempotency-Key and never calls the service', async () => {
    const { app, creation } = buildApp();
    const res = await request(app).post('/api/v1/admin/suppliers').set('x-test-role', 'admin').field('name', 'X');
    expect(res.status).toBe(400);
    expect(creation.createSupplier).not.toHaveBeenCalled();
  });

  it('returns 409 for a replay while the first request is in flight', async () => {
    const { app, creation } = buildApp({}, 'in_flight');
    const res = await post(app);
    expect(res.status).toBe(409);
    expect(creation.createSupplier).not.toHaveBeenCalled();
  });

  it('replays the cached response without calling the service again', async () => {
    const { app, creation } = buildApp({}, { statusCode: 201, body: { id: 55 } });
    const res = await post(app);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 55 });
    expect(creation.createSupplier).not.toHaveBeenCalled();
  });

  it('abandons the key when validation fails so the client can retry', async () => {
    const { app, idempotency } = buildApp();
    const res = await request(app)
      .post('/api/v1/admin/suppliers')
      .set('x-test-role', 'admin')
      .set('Idempotency-Key', KEY)
      .field('type', 'Store');
    expect(res.status).toBe(422);
    expect(idempotency.abandon).toHaveBeenCalledWith('u-1', KEY);
    expect(idempotency.complete).not.toHaveBeenCalled();
  });

  it('rejects the user role with 403 and touches neither the store nor the service', async () => {
    const { app, creation, idempotency } = buildApp();
    const res = await post(app, 'user');
    expect(res.status).toBe(403);
    expect(idempotency.begin).not.toHaveBeenCalled();
    expect(creation.createSupplier).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/admin/suppliers/:id', () => {
  it('rejects a user role with 403 and calls nothing', async () => {
    const { app, update } = buildApp();
    const res = await request(app).put('/api/v1/admin/suppliers/101').set('x-test-role', 'user').field('version', '3').field('name', 'X');
    expect(res.status).toBe(403);
    expect(update.updateSupplier).not.toHaveBeenCalled();
  });

  it('passes parsed fields and files to the service and returns its body', async () => {
    const { app, update } = buildApp();
    const res = await request(app)
      .put('/api/v1/admin/suppliers/101')
      .set('x-test-role', 'admin')
      .field('version', '3')
      .field('name', 'New Name')
      .field('isPhotoDirty', 'true')
      .field('photo_ids', '["ph-1"]')
      .field('placeholder_ids', '["ph-1"]')
      .attach('photos', Buffer.from('x'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 101, version: 4 });
    expect(update.updateSupplier).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ version: 3, name: 'New Name', isPhotoDirty: true, photoIds: ['ph-1'], placeholderIds: ['ph-1'] }),
      [expect.objectContaining({ mimeType: 'image/png' })],
    );
  });

  it('422s a body with only version', async () => {
    const { app } = buildApp();
    const res = await request(app).put('/api/v1/admin/suppliers/101').set('x-test-role', 'admin').field('version', '3');
    expect(res.status).toBe(422);
  });

  it('422s a missing version', async () => {
    const { app } = buildApp();
    const res = await request(app).put('/api/v1/admin/suppliers/101').set('x-test-role', 'admin').field('name', 'X');
    expect(res.status).toBe(422);
  });

  it('422s a non-numeric id', async () => {
    const { app } = buildApp();
    const res = await request(app).put('/api/v1/admin/suppliers/abc').set('x-test-role', 'admin').field('version', '1').field('name', 'X');
    expect(res.status).toBe(422);
  });

  it.each([404, 409])('maps a service %i to the error envelope', async (status) => {
    const { app, update } = buildApp();
    update.updateSupplier.mockRejectedValueOnce(new AppError(status, 'E', 'nope'));
    const res = await request(app).put('/api/v1/admin/suppliers/101').set('x-test-role', 'admin').field('version', '3').field('name', 'X');
    expect(res.status).toBe(status);
  });
});

describe('DELETE /api/v1/admin/suppliers/:id', () => {
  it.each(['admin', 'super admin'])('lets %s soft-delete and returns the service body', async (role) => {
    const { app, deletion } = buildApp();
    const res = await request(app).delete('/api/v1/admin/suppliers/101').set('x-test-role', role);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 101, isDeleted: true });
    expect(deletion.deleteSupplier).toHaveBeenCalledWith(101);
  });

  it('rejects the user role with 403 and never reaches the service', async () => {
    const { app, deletion } = buildApp();
    const res = await request(app).delete('/api/v1/admin/suppliers/101').set('x-test-role', 'user');
    expect(res.status).toBe(403);
    expect(deletion.deleteSupplier).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-1', '1.5'])('422s the invalid id %s and never reaches the service', async (id) => {
    const { app, deletion } = buildApp();
    const res = await request(app).delete(`/api/v1/admin/suppliers/${id}`).set('x-test-role', 'admin');
    expect(res.status).toBe(422);
    expect(deletion.deleteSupplier).not.toHaveBeenCalled();
  });

  it('maps a 404 from the service', async () => {
    const { app, deletion } = buildApp();
    deletion.deleteSupplier.mockRejectedValueOnce(new AppError(404, 'Not Found', 'Supplier not found.'));
    const res = await request(app).delete('/api/v1/admin/suppliers/9').set('x-test-role', 'admin');
    expect(res.status).toBe(404);
  });
});
