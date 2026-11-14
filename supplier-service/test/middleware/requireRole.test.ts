/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Generated unit tests for the role-guard middleware from the Phase 0 plan. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/middleware/requireRole.test.ts to test/middleware/requireRole.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5): added a test for the
 *        supplierServiceKeyAuthenticated bypass (instructions.md Stage 28 c1). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { requireRole } from '../../src/middleware/requireRole.js';

function buildApp(
  userRole: string | undefined,
  allowed: string[],
  serviceKeyAuthenticated = false,
): express.Express {
  const app = express();
  app.use((req, _res, next) => {
    if (userRole !== undefined) {
      req.user = { user_id: 'u-1', role: userRole };
    }
    if (serviceKeyAuthenticated) {
      req.supplierServiceKeyAuthenticated = true;
    }
    next();
  });
  app.get('/admin-only', requireRole(...allowed), (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('requireRole', () => {
  it('allows a role in the allowed list', async () => {
    const app = buildApp('admin', ['admin', 'super admin']);
    const res = await request(app).get('/admin-only');
    expect(res.status).toBe(200);
  });

  it('rejects a role not in the allowed list with 403', async () => {
    const app = buildApp('user', ['admin', 'super admin']);
    const res = await request(app).get('/admin-only');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('rejects an unauthenticated request with 403', async () => {
    const app = buildApp(undefined, ['admin', 'super admin']);
    const res = await request(app).get('/admin-only');
    expect(res.status).toBe(403);
  });

  it('skips the role check when supplierServiceKeyAuthenticated is set, even with no user', async () => {
    const app = buildApp(undefined, ['admin', 'super admin'], true);
    const res = await request(app).get('/admin-only');
    expect(res.status).toBe(200);
  });
});
