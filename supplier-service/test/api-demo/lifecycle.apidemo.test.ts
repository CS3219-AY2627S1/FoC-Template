/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-04
 * Scope: Phase 5 Task 4. API-only supplier lifecycle against a running stack (Arch §7.4): reference lookups,
 *        create with Idempotency-Key (and its replay), list/detail, update, stale-version 409, delete and the
 *        repeated-delete 404. Saves the real transcript. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review: Congchen
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { call, writeTranscript } from './client.js';

const admin = inject('tokens').admin;
const state: { locationId?: number; id?: number; version?: number } = {};
const key = randomUUID();
const name = `api-demo ${randomUUID()}`;

describe('supplier lifecycle through the API only (admin)', () => {
  afterAll(() => writeTranscript('lifecycle'));

  it('looks up reference locations and categories', async () => {
    const loc = await call('Reference: locations', 'admin', admin, 'GET', '/api/v1/suppliers/reference/location');
    expect(loc.status).toBe(200);
    expect(loc.body.locations.length).toBeGreaterThan(0);
    state.locationId = loc.body.locations[0].location_id;
    const cat = await call('Reference: categories', 'admin', admin, 'GET', '/api/v1/suppliers/reference/categories');
    expect(cat.status).toBe(200);
  });

  it('creates a supplier with an Idempotency-Key', async () => {
    const res = await call('Create', 'admin', admin, 'POST', '/api/v1/admin/suppliers', {
      headers: { 'Idempotency-Key': key },
      form: { name, type: 'Facility', location_id: String(state.locationId), desc: 'created by api-demo' },
    });
    expect(res.status).toBe(201);
    state.id = res.body.id;
    state.version = res.body.version;
    expect(typeof state.id).toBe('number');
  });

  it('replays the same Idempotency-Key without creating a second supplier', async () => {
    const res = await call('Create (replayed key)', 'admin', admin, 'POST', '/api/v1/admin/suppliers', {
      headers: { 'Idempotency-Key': key },
      form: { name, type: 'Facility', location_id: String(state.locationId), desc: 'created by api-demo' },
    });
    expect(res.status).toBe(201); // a completed request's stored status and body are replayed
    expect(res.body.id).toBe(state.id);
  });

  it('lists and reads the supplier', async () => {
    const list = await call('List (requester)', 'admin', admin, 'GET', `/api/v1/suppliers?page=1&limit=50&search=${encodeURIComponent(name)}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((s: { id: number }) => s.id)).toContain(state.id);
    expect((await call('Detail (requester)', 'admin', admin, 'GET', `/api/v1/suppliers/${state.id}`)).status).toBe(200);
    expect((await call('Detail (admin)', 'admin', admin, 'GET', `/api/v1/admin/suppliers/${state.id}`)).status).toBe(200);
  });

  it('updates with the current version', async () => {
    const res = await call('Update', 'admin', admin, 'PUT', `/api/v1/admin/suppliers/${state.id}`, {
      form: { version: String(state.version), desc: 'updated by api-demo' },
    });
    expect(res.status).toBe(200);
    expect(res.body.desc).toBe('updated by api-demo');
    expect(res.body.version).toBeGreaterThan(state.version!);
  });

  it('rejects an update with the stale version (409)', async () => {
    const res = await call('Update (stale version)', 'admin', admin, 'PUT', `/api/v1/admin/suppliers/${state.id}`, {
      form: { version: String(state.version), desc: 'stale write' },
    });
    expect(res.status).toBe(409);
  });

  it('deletes, then returns 404 on a repeated delete', async () => {
    const first = await call('Delete', 'admin', admin, 'DELETE', `/api/v1/admin/suppliers/${state.id}`);
    expect(first.status).toBe(200);
    const second = await call('Delete (repeated)', 'admin', admin, 'DELETE', `/api/v1/admin/suppliers/${state.id}`);
    expect(second.status).toBe(404);
  });
});
