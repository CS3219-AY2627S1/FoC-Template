// AI Assistance Disclosure:
// Tool: Codex (model: GPT-6), date: 2026-11-08
// Scope: Tests for the last request queries in the precise delivery location spec.
// No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import { afterEach, beforeEach, expect, it } from 'vitest';
import pool from '../../../src/db/pool.js';
import * as lastRequest from '../../../src/db/queries/lastRequest.queries.js';
import * as users from '../../../src/db/queries/users.queries.js';
import { truncateAll } from '../../helpers/db.js';

let userId: string;
beforeEach(async () => {
  await truncateAll();
  userId = (await users.createUser({ username: 'alice', email: 'alice@example.com', passwordHash: 'h', status: 'active' })).id;
});
afterEach(truncateAll);

it('creates a default row and upserts the last request', async () => {
  expect(await lastRequest.getLastRequest(userId)).toEqual({ last_req_del_loc_id: null, last_req_del_loc_details: 'Nil' });
  await lastRequest.insertDefaultRow(userId);
  await lastRequest.upsertLastRequest(userId, 3, 'Lobby');
  expect(await lastRequest.getLastRequest(userId)).toEqual({ last_req_del_loc_id: 3, last_req_del_loc_details: 'Lobby' });
  await expect(lastRequest.upsertLastRequest(userId, 3, 'x'.repeat(251))).rejects.toThrow();
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  expect(await lastRequest.getLastRequest(userId)).toBeNull();
});
