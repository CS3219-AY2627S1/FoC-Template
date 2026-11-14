/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented Phase 2 Task 6 Idempotency-Key header middleware tests, as specified in the plan.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/middleware/requireIdempotencyKey.test.ts to test/middleware/requireIdempotencyKey.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { requireIdempotencyKey } from '../../src/middleware/requireIdempotencyKey.js';

const app = express();
app.post('/x', requireIdempotencyKey, (_req, res) => res.status(204).end());
app.use(errorHandler);

describe('requireIdempotencyKey', () => {
  it('rejects a missing header with 400', async () => {
    const res = await request(app).post('/x');
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ field: 'Idempotency-Key', location: 'header' });
  });

  it('rejects a header that is not a UUID with 400', async () => {
    expect((await request(app).post('/x').set('Idempotency-Key', 'abc')).status).toBe(400);
  });

  it('accepts a UUID', async () => {
    const res = await request(app).post('/x').set('Idempotency-Key', '9b2f5a80-4c1e-4f70-9d7e-2f3a1c6b8e11');
    expect(res.status).toBe(204);
  });
});
