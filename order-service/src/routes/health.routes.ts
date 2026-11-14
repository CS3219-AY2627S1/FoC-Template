/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-09-23
 * Scope: Project scaffolding / infrastructure only. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import { Router } from 'express';
import type { PrismaClient } from '../db/prisma.js';

export function healthRouter(db: Pick<PrismaClient, '$queryRaw'>): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'up' });
    } catch (err) {
      console.error('Health check failed:', err);
      res.status(503).json({ status: 'error', database: 'down' });
    }
  });

  return router;
}
