// AI Assistance Disclosure:
// Tool: Codex (model: GPT-6), date: 2026-11-08
// Scope: HTTP tests for last-request endpoints in the precise delivery location spec.
// No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
// Scope: Fix F2 - debugged the ECONNRESET / "socket hang up" flake; replaced per-call
//        `request(app)` supertest servers with the shared loopback server in
//        tests/helpers/server.ts (`api()`). No test logic or assertions changed.
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import { afterEach, beforeEach, expect, it } from 'vitest';
import { api } from '../helpers/server.js';
import pool from '../../src/db/pool.js';
import { truncateAll } from '../helpers/db.js';
import { accessTokenFor, bearer, createActiveUser } from '../helpers/fixtures.js';

beforeEach(truncateAll);
afterEach(truncateAll);

it('requires authentication and saves trimmed details for the signed-in user', async () => {
  const path = '/users/me/last-request';
  expect((await api().get(path)).status).toBe(401);
  const user = await createActiveUser(1);
  const token = bearer(await accessTokenFor(user));
  expect((await api().get(path).set('Authorization', token)).body)
    .toEqual({ last_req_del_loc_id: null, last_req_del_loc_details: 'Nil' });
  expect((await api().put(path).set('Authorization', token)
    .send({ last_req_del_loc_id: 3, last_req_del_loc_details: ' Lobby ' })).status).toBe(200);
  expect((await api().get(path).set('Authorization', token)).body)
    .toEqual({ last_req_del_loc_id: 3, last_req_del_loc_details: 'Lobby' });
  expect((await api().put(path).set('Authorization', token)
    .send({ last_req_del_loc_id: 0, last_req_del_loc_details: ' ' })).status).toBe(400);
});

it('returns nulls for a missing row and cannot overwrite another user', async () => {
  const first = await createActiveUser(1);
  const second = await createActiveUser(2);
  const token = bearer(await accessTokenFor(first));
  await pool.query('DELETE FROM last_request WHERE user_id = $1', [first.id]);
  const path = '/users/me/last-request';
  expect((await api().get(path).set('Authorization', token)).body)
    .toEqual({ last_req_del_loc_id: null, last_req_del_loc_details: null });
  await api().put(path).set('Authorization', token).send({ user_id: second.id, last_req_del_loc_id: 1, last_req_del_loc_details: 'Lobby' }).expect(200);
  const otherToken = bearer(await accessTokenFor(second));
  expect((await api().get(path).set('Authorization', otherToken)).body)
    .toEqual({ last_req_del_loc_id: null, last_req_del_loc_details: 'Nil' });
});

it.each([
  { last_req_del_loc_id: null, last_req_del_loc_details: 'Lobby' },
  { last_req_del_loc_id: -1, last_req_del_loc_details: 'Lobby' },
  { last_req_del_loc_id: 1.5, last_req_del_loc_details: 'Lobby' },
  { last_req_del_loc_id: 2147483648, last_req_del_loc_details: 'Lobby' },
  { last_req_del_loc_id: 1, last_req_del_loc_details: 'x'.repeat(251) },
  { last_req_del_loc_id: 1, last_req_del_loc_details: null },
])('rejects invalid last request values', async (body) => {
  const user = await createActiveUser(1);
  const token = bearer(await accessTokenFor(user));
  const response = await api().put('/users/me/last-request').set('Authorization', token).send(body);
  expect(response.status).toBe(400);
  expect(response.body.code).toBe('VALIDATION_ERROR');
});
