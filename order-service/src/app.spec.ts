/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-09-23
 * Scope: Project scaffolding / infrastructure only. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope (2026-10-20): Issue #4 - createApp no longer takes a credit client.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import request from 'supertest';
import { createApp } from './app.js';
import type { PrismaClient } from './db/prisma.js';

function appWith(queryRaw: () => Promise<unknown>) {
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;
  return createApp({ prisma });
}

describe('GET /health', () => {
  it('200 when the database responds', async () => {
    const app = appWith(() => Promise.resolve([{ '?column?': 1 }]));
    await request(app)
      .get('/health')
      .expect(200, { status: 'ok', database: 'up' });
  });

  it('503 when the database is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = appWith(() => Promise.reject(new Error('connection refused')));
    await request(app)
      .get('/health')
      .expect(503, { status: 'error', database: 'down' });
  });
});

describe('fallbacks', () => {
  const app = appWith(() => Promise.resolve([]));

  it('404 JSON for unknown routes', async () => {
    await request(app)
      .get('/nope')
      .expect(404, { message: 'Not found: GET /nope' });
  });

  it('400 JSON for malformed request bodies', async () => {
    await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{bad json')
      .expect(400)
      .expect((res) => expect(res.body.message).toBeTypeOf('string'));
  });
});
