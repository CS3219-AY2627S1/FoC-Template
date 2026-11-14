/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Route-level tests for the four Phase 1 endpoints (SupplierServiceArchitecture.md §7 table,
 *        §7.1, §7.2): role acceptance, validation errors, 404 mapping, and static-before-:id route
 *        order. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): added the two admin methods to the fake
 *        service so it still matches the SupplierService type (Phase 2 plan Task 3). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/routes/supplier.routes.test.ts to test/routes/supplier.routes.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-05, Claude Code, model: claude-sonnet-5-5): Added GET /api/v1/suppliers ids tests, per the 2026-11-05 supplier-bookmarking spec.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { SupplierService } from '../../src/business/supplierService.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { AppError } from '../../src/utils/AppError.js';
import { createSupplierRouter } from '../../src/routes/supplier.routes.js';

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

function buildApp(service = fakeService()) {
  const app = express();
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'];
    if (typeof role === 'string') {
      req.user = { user_id: 'u-1', role };
    }
    next();
  });
  app.use('/api/v1/suppliers', createSupplierRouter(service as unknown as SupplierService));
  app.use(errorHandler);
  return { app, service };
}

describe.each(['user', 'admin', 'super admin'])('role %s', (role) => {
  it('may list suppliers', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/suppliers').set('x-test-role', role);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/suppliers', () => {
  it('passes parsed query values to the service', async () => {
    const { app, service } = buildApp();
    await request(app)
      .get('/api/v1/suppliers?page=2&search=store&location_id=4&category_id=2&isOpen=false&sortOrder=Z-A&limit=50')
      .set('x-test-role', 'user');
    expect(service.listSuppliers).toHaveBeenCalledWith({
      page: 2,
      search: 'store',
      locationId: 4,
      categoryId: 2,
      isOpen: false,
      sortOrder: 'Z-A',
    });
  });

  it('returns 422 for an isOpen value that is not true or false', async () => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/suppliers?isOpen=maybe').set('x-test-role', 'user');
    expect(res.status).toBe(422);
    expect(res.body.details[0]).toMatchObject({ field: 'isOpen', location: 'query' });
    expect(service.listSuppliers).not.toHaveBeenCalled();
  });

  it('treats an empty search as no search', async () => {
    const { app, service } = buildApp();
    await request(app).get('/api/v1/suppliers?search=').set('x-test-role', 'user');
    expect(service.listSuppliers).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined }),
    );
  });

  it('returns 422 with the error envelope for invalid query values', async () => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/suppliers?limit=51').set('x-test-role', 'user');
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ status_code: 422, error: 'Unprocessable Entity' });
    expect(res.body.details[0]).toMatchObject({ field: 'limit', location: 'query' });
    expect(service.listSuppliers).not.toHaveBeenCalled();
  });

  it('returns 403 for a role outside user/admin/super admin', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/suppliers').set('x-test-role', 'guest');
    expect(res.status).toBe(403);
  });

  it('returns 403 when no identity is attached', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/suppliers');
    expect(res.status).toBe(403);
  });

  it('passes ids to the service split into well-formed numbers (de-duplicated) and malformed items', async () => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/suppliers?ids=3,7,3,abc').set('x-test-role', 'user');
    expect(res.status).toBe(200);
    expect(service.listSuppliers).toHaveBeenCalledWith(
      expect.objectContaining({ ids: { valid: [3, 7], invalid: ['abc'] } }),
    );
  });

  it('accepts an empty ids value and passes an empty list', async () => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/suppliers?ids=').set('x-test-role', 'user');
    expect(res.status).toBe(200);
    expect(service.listSuppliers).toHaveBeenCalledWith(
      expect.objectContaining({ ids: { valid: [], invalid: [] } }),
    );
  });

  it('combines ids with the other filters', async () => {
    const { app, service } = buildApp();
    await request(app).get('/api/v1/suppliers?ids=3,7&search=store&isOpen=true').set('x-test-role', 'user');
    expect(service.listSuppliers).toHaveBeenCalledWith(
      expect.objectContaining({ ids: { valid: [3, 7], invalid: [] }, search: 'store', isOpen: true }),
    );
  });

  it.each([
    ['more than 20 values', 'ids=' + Array.from({ length: 21 }, (_, i) => i + 1).join(',')],
    ['a repeated parameter', 'ids=1&ids=2'],
  ])('returns 422 for %s', async (_label, queryString) => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/suppliers?' + queryString).set('x-test-role', 'user');
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ status_code: 422, error: 'Unprocessable Entity' });
    expect(res.body.details[0]).toMatchObject({ location: 'query' });
    expect(res.body.details[0].field).toMatch(/^ids/);
    expect(service.listSuppliers).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/suppliers/:id', () => {
  it('returns the supplier detail', async () => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/suppliers/101').set('x-test-role', 'user');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 101 });
    expect(service.getSupplier).toHaveBeenCalledWith(101);
  });

  it('returns 422 for a non-numeric id', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/suppliers/abc').set('x-test-role', 'user');
    expect(res.status).toBe(422);
    expect(res.body.details[0]).toMatchObject({ field: 'id', location: 'path' });
  });

  it('maps a service 404 to the error envelope', async () => {
    const service = fakeService();
    service.getSupplier.mockRejectedValue(new AppError(404, 'Not Found', 'Supplier not found.'));
    const { app } = buildApp(service);
    const res = await request(app).get('/api/v1/suppliers/999').set('x-test-role', 'user');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status_code: 404, error: 'Not Found' });
  });
});

describe('reference endpoints', () => {
  it('serves /reference/location before the :id route', async () => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/suppliers/reference/location').set('x-test-role', 'user');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ locations: [] });
    expect(service.getSupplier).not.toHaveBeenCalled();
  });

  it('serves /reference/categories', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/suppliers/reference/categories').set('x-test-role', 'user');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ categories: [] });
  });
});
