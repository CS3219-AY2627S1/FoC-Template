/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 e (instructions.md) - series router, mounted at /orders/series (before
 *        orders.routes.ts's GET /:id so "series" is never captured as an order id).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { Router } from 'express';
import type { PrismaClient } from '../db/prisma.js';
import * as seriesController from '../controllers/series.controller.js';

export function seriesRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.post('/', seriesController.createSeries(prisma));
  router.get('/mine', seriesController.listMySeries(prisma));
  router.get('/:seriesId', seriesController.getSeries(prisma));
  router.patch('/:seriesId/edit', seriesController.editSeries(prisma));
  router.delete('/:seriesId', seriesController.deleteSeries(prisma));
  return router;
}
