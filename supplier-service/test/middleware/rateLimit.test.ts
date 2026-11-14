/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Generated unit tests for the 30 req/min/IP rate limiter (SupplierServiceSpec.md, "Phase 0 — Foundations").
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/middleware/rateLimit.test.ts to test/middleware/rateLimit.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-04, Codex, model: GPT-6): Tested the configured per-IP rate limit and default.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { createRateLimiter } from '../../src/middleware/rateLimit.js';

function buildApp(): express.Express {
  const app = express();
  app.set('trust proxy', true);
  app.use(createRateLimiter());
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('rateLimit', () => {
  let app: express.Express;

  beforeEach(() => {
    app = buildApp();
  });

  it('allows requests under the limit', async () => {
    for (let i = 0; i < 30; i++) {
      const res = await request(app).get('/ping');
      expect(res.status).toBe(200);
    }
  });

  it('rejects the 31st request within the same window with 429', async () => {
    for (let i = 0; i < 30; i++) {
      await request(app).get('/ping');
    }

    const res = await request(app).get('/ping');

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      status_code: 429,
      error: 'Too Many Requests',
    });
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('tracks separate IPs independently', async () => {
    for (let i = 0; i < 30; i++) {
      await request(app).get('/ping').set('X-Forwarded-For', '10.0.0.1');
    }
    const blocked = await request(app).get('/ping').set('X-Forwarded-For', '10.0.0.1');
    const otherIp = await request(app).get('/ping').set('X-Forwarded-For', '10.0.0.2');

    expect(blocked.status).toBe(429);
    expect(otherIp.status).toBe(200);
  });
});


describe('configured rate limit', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it('uses the configured limit for requests from one IP', async () => {
    vi.stubEnv('PER_IP_RATE_LIMIT', '2');
    vi.resetModules();
    const { createRateLimiter: configuredLimiter } = await import('../../src/middleware/rateLimit.js');
    const { errorHandler: configuredErrorHandler } = await import('../../src/middleware/errorHandler.js');
    const app = express();
    app.use(configuredLimiter());
    app.get('/ping', (_req, res) => res.sendStatus(200));
    app.use(configuredErrorHandler);
    expect((await request(app).get('/ping')).status).toBe(200);
    expect((await request(app).get('/ping')).status).toBe(200);
    expect((await request(app).get('/ping')).status).toBe(429);
  });

  it('defaults to 30 when unset', async () => {
    vi.stubEnv('PER_IP_RATE_LIMIT', undefined);
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { config } = await import('../../src/config.js');
    expect(config.perIpRateLimit).toBe(30);
  });
});
