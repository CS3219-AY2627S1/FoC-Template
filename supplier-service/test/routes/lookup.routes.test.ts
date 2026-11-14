/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Wrote route tests for the lookup endpoints per Phase 2 plan Task 4. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/routes/lookup.routes.test.ts to test/routes/lookup.routes.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { LookupService } from '../../src/business/lookupService.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { createLookupRouter } from '../../src/routes/lookup.routes.js';

function buildApp() {
  const service = {
    createFaculty: vi.fn().mockResolvedValue({ faculty_id: 1, faculty: 'Computing' }),
    updateFaculty: vi.fn().mockResolvedValue({ faculty_id: 1, faculty: 'Science' }),
    deleteFaculty: vi.fn().mockResolvedValue({ deleted: true, id: 1 }),
    createLocation: vi.fn().mockResolvedValue({ location_id: 2, location: 'L', faculty_id: 1, level: 1 }),
    updateLocation: vi.fn().mockResolvedValue({ location_id: 2, location: 'L', faculty_id: 1, level: 2 }),
    deleteLocation: vi.fn().mockResolvedValue({ deleted: true, id: 2 }),
    createCategory: vi.fn().mockResolvedValue({ category_id: 3, category_type: 'Food' }),
    updateCategory: vi.fn().mockResolvedValue({ category_id: 3, category_type: 'Drinks' }),
    deleteCategory: vi.fn().mockResolvedValue({ deleted: true, id: 3 }),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'];
    if (typeof role === 'string') req.user = { user_id: 'u-1', role };
    next();
  });
  app.use('/api/v1/admin/reference', createLookupRouter(service as unknown as LookupService));
  app.use(errorHandler);
  return { app, service };
}

describe('lookup routes', () => {
  it('creates a faculty (201) and passes the trimmed name', async () => {
    const { app, service } = buildApp();
    const res = await request(app)
      .post('/api/v1/admin/reference/faculties')
      .set('x-test-role', 'admin')
      .send({ faculty: ' Computing ' });
    expect(res.status).toBe(201);
    expect(service.createFaculty).toHaveBeenCalledWith('Computing');
  });

  it('maps location_id-style body fields to the service input', async () => {
    const { app, service } = buildApp();
    await request(app)
      .post('/api/v1/admin/reference/locations')
      .set('x-test-role', 'super admin')
      .send({ location: 'Library', faculty_id: 1, level: 2 });
    expect(service.createLocation).toHaveBeenCalledWith({ location: 'Library', facultyId: 1, level: 2 });
  });

  it('updates a category and deletes a faculty with 200', async () => {
    const { app } = buildApp();
    expect(
      (await request(app).put('/api/v1/admin/reference/categories/3').set('x-test-role', 'admin').send({ category_type: 'Drinks' })).status,
    ).toBe(200);
    const del = await request(app).delete('/api/v1/admin/reference/faculties/1').set('x-test-role', 'admin');
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ deleted: true, id: 1 });
  });

  it('rejects a bad body with 422 and a bad id with 422', async () => {
    const { app } = buildApp();
    expect(
      (await request(app).post('/api/v1/admin/reference/faculties').set('x-test-role', 'admin').send({})).status,
    ).toBe(422);
    expect((await request(app).delete('/api/v1/admin/reference/faculties/abc').set('x-test-role', 'admin')).status).toBe(422);
  });

  it('rejects the user role with 403 on every verb', async () => {
    const { app, service } = buildApp();
    expect((await request(app).post('/api/v1/admin/reference/faculties').set('x-test-role', 'user').send({ faculty: 'X' })).status).toBe(403);
    expect((await request(app).delete('/api/v1/admin/reference/faculties/1').set('x-test-role', 'user')).status).toBe(403);
    expect(service.createFaculty).not.toHaveBeenCalled();
    expect(service.deleteFaculty).not.toHaveBeenCalled();
  });
});
