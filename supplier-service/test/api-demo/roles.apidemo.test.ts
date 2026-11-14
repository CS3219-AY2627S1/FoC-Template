/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-04
 * Scope: Phase 5 Task 5. Runs the same operations as a user, an admin and a super admin against a running
 *        stack and asserts which succeed and which return 403 (per the existing role guards), saving the real
 *        transcript. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { call, writeTranscript } from './client.js';

const tokens = inject('tokens');
const roles = ['user', 'admin', 'super admin'] as const;
const canWrite = (role: string) => role !== 'user';

describe('cross-role behaviour', () => {
  afterAll(() => writeTranscript('roles'));

  let locationId = 0;
  it('finds a location to use', async () => {
    const res = await call('Reference: locations', 'admin', tokens.admin, 'GET', '/api/v1/suppliers/reference/location');
    expect(res.status).toBe(200);
    locationId = res.body.locations[0].location_id;
  });

  describe.each(roles)('as %s', (role) => {
    const token = tokens[role];
    it('reads requester endpoints (200)', async () => {
      expect((await call('List (requester)', role, token, 'GET', '/api/v1/suppliers?page=1&limit=50')).status).toBe(200);
      expect((await call('Reference: categories', role, token, 'GET', '/api/v1/suppliers/reference/categories')).status).toBe(200);
    });

    it(`admin list is ${canWrite(role) ? '200' : '403'}`, async () => {
      const res = await call('List (admin)', role, token, 'GET', '/api/v1/admin/suppliers?page=1&limit=50');
      expect(res.status).toBe(canWrite(role) ? 200 : 403);
    });

    it(`create/update/delete ${canWrite(role) ? 'succeed' : 'are 403'}`, async () => {
      const create = await call('Create', role, token, 'POST', '/api/v1/admin/suppliers', {
        headers: { 'Idempotency-Key': randomUUID() },
        form: { name: `api-demo ${role} ${randomUUID()}`, type: 'Facility', location_id: String(locationId) },
      });
      if (!canWrite(role)) {
        expect(create.status).toBe(403);
        expect((await call('Update', role, token, 'PUT', '/api/v1/admin/suppliers/1', { form: { version: '0', desc: 'x' } })).status).toBe(403);
        expect((await call('Delete', role, token, 'DELETE', '/api/v1/admin/suppliers/1')).status).toBe(403);
        return;
      }
      expect(create.status).toBe(201);
      const update = await call('Update', role, token, 'PUT', `/api/v1/admin/suppliers/${create.body.id}`, {
        form: { version: String(create.body.version), desc: 'updated' },
      });
      expect(update.status).toBe(200);
      expect((await call('Delete', role, token, 'DELETE', `/api/v1/admin/suppliers/${create.body.id}`)).status).toBe(200);
    });
  });
});
