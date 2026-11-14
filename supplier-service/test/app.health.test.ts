/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
 * Scope: ECS Fargate migration - tests for GET /health, per George's ECS Fargate plan, Phase 1 item 7.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../src/app.js';
import { config } from '../src/config.js';

describe('GET /health', () => {
  it('returns 200 without authentication', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('is never rate limited and does not use up the per-IP allowance', async () => {
    for (let i = 0; i < config.perIpRateLimit + 5; i += 1) {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    }
    // 401 from auth, not 429: the health checks above were not counted.
    const res = await request(app).get('/api/v1/__probe');
    expect(res.status).toBe(401);
  });
});
