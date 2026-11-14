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

import { config as loadDotenv } from 'dotenv';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { createPrismaClient } from '../src/db/prisma.js';

// Requires a reachable Postgres at DATABASE_URL (e.g. `docker compose up -d order-db`).
loadDotenv({ quiet: true });
const prisma = createPrismaClient(loadEnv().DATABASE_URL);
const app = createApp({ prisma });

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Health (e2e)', () => {
  it('GET /health reaches the real database', async () => {
    await request(app)
      .get('/health')
      .expect(200, { status: 'ok', database: 'up' });
  });
});
