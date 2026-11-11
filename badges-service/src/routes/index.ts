/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-30
 * Scope: Route registration, in rating-service's layout.
 * Reviewed by Ngooi Jun Sen
 */

import type { FastifyInstance } from 'fastify';
import { badgeRoutes } from './badges.routes.js';
import { healthRoutes } from './health.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(badgeRoutes, { prefix: '/api/v1/badges' });
}
